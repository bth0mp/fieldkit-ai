/**
 * Remote Server Manager
 *
 * Manages remote LLM server connections, including:
 * - CRUD operations for server configurations
 * - Secure API key storage using React Native Keychain
 * - Provider creation and management
 */

import { RemoteServer, RemoteModel, ServerTestResult } from '../types';
import { useRemoteServerStore } from '../stores/remoteServerStore';
import { OpenAICompatibleProvider } from './providers/openAICompatibleProvider';
import { providerRegistry } from './providers/registry';
import logger from '../utils/logger';
import {
  storeApiKeyImpl,
  getApiKeyImpl,
  removeApiKeyImpl,
  createProviderForServerImpl,
  setActiveRemoteTextModelImpl,
  setActiveRemoteImageModelImpl,
  initializeProvidersImpl,
  resolveApiKeyImpl,
  moveStoredKeysToKeychainImpl,
} from './remoteServerManagerUtils';

class RemoteServerManager {
  private keyMove: Promise<void> | null = null;
  private stopWaitingForServers: (() => void) | null = null;

  /**
   * Add a new remote server
   */
  async addServer(
    config: Omit<RemoteServer, 'id' | 'createdAt'> & { apiKey?: string }
  ): Promise<RemoteServer> {
    const store = useRemoteServerStore.getState();

    // Deduplicate: if a server with the same endpoint already exists, return it
    const trimSlashes = (url: string) => { let s = url.toLowerCase(); while (s.endsWith('/')) s = s.slice(0, -1); return s; };
    const normalizedEndpoint = trimSlashes(config.endpoint);
    const existing = store.servers.find(
      (s) => trimSlashes(s.endpoint) === normalizedEndpoint
    );
    if (existing) {
      logger.log('[RemoteServerManager] Server already exists:', existing.name);
      return existing;
    }

    // The key goes to the Keychain only; the saved record never holds it.
    const { apiKey, ...publicConfig } = config;
    const id = store.addServer(publicConfig);
    if (apiKey) {
      try {
        await this.storeApiKey(id, apiKey);
      } catch (error) {
        // No server without its key: a retry must not meet the record and be taken for a duplicate.
        store.removeServer(id);
        throw error;
      }
    }

    const server = store.getServerById(id);
    if (!server) throw new Error('Failed to create server');

    await createProviderForServerImpl(server);
    logger.log('[RemoteServerManager] Added server:', server.name);
    return server;
  }

  /**
   * Update a server configuration
   */
  async updateServer(
    id: string,
    updates: Partial<Omit<RemoteServer, 'id' | 'createdAt'>>
  ): Promise<void> {
    const store = useRemoteServerStore.getState();
    const existingServer = store.getServerById(id);

    if (!existingServer) throw new Error(`Server not found: ${id}`);

    if (updates.apiKey !== undefined) {
      if (updates.apiKey) {
        await this.storeApiKey(id, updates.apiKey);
      } else {
        await this.removeApiKey(id);
      }
    }

    const { apiKey: _, ...storeUpdates } = updates;
    store.updateServer(id, storeUpdates);
    // The key was just set or cleared in the Keychain: a copy an older version left in the record must go.
    if (updates.apiKey !== undefined) store.forgetSavedApiKey(id);

    const provider = providerRegistry.getProvider(id);
    if (provider && 'updateConfig' in provider) {
      (provider as OpenAICompatibleProvider).updateConfig({
        endpoint: updates.endpoint || existingServer.endpoint,
        apiKey: await resolveApiKeyImpl(id),
      });
    }

    logger.log('[RemoteServerManager] Updated server:', id);
  }

  /**
   * Remove a server
   */
  async removeServer(id: string): Promise<void> {
    providerRegistry.unregisterProvider(id);
    await this.removeApiKeyAnyway(id);
    useRemoteServerStore.getState().removeServer(id);
    logger.log('[RemoteServerManager] Removed server:', id);
  }

  /** Get all servers (without API keys) */
  getServers(): RemoteServer[] {
    return useRemoteServerStore.getState().servers;
  }

  /** Get a server by ID */
  getServer(id: string): RemoteServer | null {
    return useRemoteServerStore.getState().getServerById(id);
  }

  /** Get server with API key (for provider) */
  async getServerWithApiKey(id: string): Promise<(RemoteServer & { apiKey?: string }) | null> {
    const server = this.getServer(id);
    if (!server) return null;
    const apiKey = await this.getApiKey(id);
    return { ...server, apiKey: apiKey || undefined };
  }

  /**
   * Test server connection
   */
  async testConnection(
    id: string
  ): Promise<ServerTestResult> {
    const store = useRemoteServerStore.getState();
    return store.testConnection(id, await resolveApiKeyImpl(id));
  }

  /** Test connection to a server by endpoint (before adding) */
  async testConnectionByEndpoint(
    endpoint: string,
    apiKey?: string
  ): Promise<ServerTestResult> {
    return useRemoteServerStore.getState().testConnectionByEndpoint(endpoint, apiKey);
  }

  /**
   * Discover models from a server
   */
  async discoverModels(id: string): Promise<RemoteModel[]> {
    const store = useRemoteServerStore.getState();
    const server = store.getServerById(id);
    if (!server) throw new Error(`Server not found: ${id}`);

    return store.discoverModels(id, await resolveApiKeyImpl(id));
  }

  /**
   * Set the active server (null for local)
   */
  setActiveServer(id: string | null): void {
    useRemoteServerStore.getState().setActiveServerId(id);
    providerRegistry.setActiveProvider(id ?? 'local');
    logger.log('[RemoteServerManager] Active server set to:', id || 'local');
  }

  /** Set the active remote text model */
  async setActiveRemoteTextModel(serverId: string, modelId: string): Promise<void> {
    return setActiveRemoteTextModelImpl(serverId, modelId);
  }

  /** Set the active remote vision/image model */
  async setActiveRemoteImageModel(serverId: string, modelId: string): Promise<void> {
    return setActiveRemoteImageModelImpl(serverId, modelId);
  }

  /**
   * Clear active remote model (switch back to local)
   */
  clearActiveRemoteModel(): void {
    const store = useRemoteServerStore.getState();
    store.setActiveServerId(null);
    store.setActiveRemoteTextModelId(null);
    store.setActiveRemoteImageModelId(null);
    providerRegistry.setActiveProvider('local');
    logger.log('[RemoteServerManager] Cleared active remote model');
  }

  /** Get the active server */
  getActiveServer(): RemoteServer | null {
    return useRemoteServerStore.getState().getActiveServer();
  }

  /**
   * Initialize providers for all stored servers.
   * Also re-discovers models for each server to repopulate discoveredModels.
   * Restores active remote model selection if persisted.
   */
  async initializeProviders(): Promise<void> {
    await this.moveStoredKeysToKeychain().catch(() => {});
    return initializeProvidersImpl(() => this.getServers());
  }

  /**
   * Move keys an older version saved in the server records into the Keychain, once the store has read its
   * saved servers. A read that failed is not "no servers": nothing moves, and the move runs when a
   * later read of the saved servers works.
   */
  async moveStoredKeysToKeychain(): Promise<void> {
    const persist = useRemoteServerStore.persist;
    if (!persist.hasHydrated()) {
      this.stopWaitingForServers ??= persist.onFinishHydration(() => {
        this.stopWaitingForServers?.();
        this.stopWaitingForServers = null;
        this.moveStoredKeysToKeychain().catch(() => {});
      });
      return;
    }
    this.keyMove ??= moveStoredKeysToKeychainImpl().finally(() => { this.keyMove = null; });
    return this.keyMove;
  }

  /**
   * Clear all servers
   */
  async clearAllServers(): Promise<void> {
    for (const server of this.getServers()) {
      await this.removeApiKeyAnyway(server.id);
    }
    providerRegistry.clear();
    useRemoteServerStore.getState().clearAllServers();
  }

  // -------------------------------------------------------------------------
  // Keychain wrappers — public so tests + updateServer can call them
  // -------------------------------------------------------------------------

  async storeApiKey(serverId: string, apiKey: string): Promise<void> {
    return storeApiKeyImpl(serverId, apiKey);
  }

  async getApiKey(serverId: string): Promise<string | null> {
    return getApiKeyImpl(serverId);
  }

  private async removeApiKey(serverId: string): Promise<void> {
    return removeApiKeyImpl(serverId);
  }

  /** Removing a whole server goes ahead when the Keychain refuses; the failure is logged by the Keychain helper. */
  private async removeApiKeyAnyway(serverId: string): Promise<void> {
    try {
      await removeApiKeyImpl(serverId);
    } catch {
      // The server goes even though its key could not be cleared.
    }
  }

}

/** Singleton instance */
export const remoteServerManager = new RemoteServerManager();
