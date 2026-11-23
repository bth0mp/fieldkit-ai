import { activeModelService } from './activeModelService';
import { generationService } from './generationService';
import { imageGenerationService } from './imageGenerationService';
import { stopAllTextEngines } from './engines';
import { providerRegistry } from './providers';
import { remoteServerManager } from './remoteServerManager';
import { testEndpoint } from './httpClientUtils';
import { stopReply } from './stopReply';
import { useAppStore, useRemoteServerStore } from '../stores';
import logger from '../utils/logger';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const writing = () => generationService.getState().isGenerating || imageGenerationService.getState().isGenerating;

let tail: Promise<void> = Promise.resolve();

/**
 * Choices run one at a time. Each counts as a running turn, so nothing queued is sent until it ends. The next
 * choice starts when the work is done, while this one's claim is still held, so its end drains nothing, unless the
 * next choice has a `check`: that runs with no claim held, so the earlier choice's end drains the queue.
 * `check` runs before the choice claims or stops anything: if it throws, nothing else happens.
 */
function exclusively(work: () => Promise<void>, check?: () => Promise<void>): Promise<void> {
  const before = tail;
  let workDone!: () => void;
  tail = new Promise<void>(resolve => { workDone = resolve; });
  const finish = async () => {
    try { await work(); } finally { workDone(); }
    await sleep(0); // the chat's queue processor reads its last render
  };
  const run = before.then(check).then(() => generationService.runTurn(async () => {
    // A turn still being prepared cannot be stopped, and would load its own model when it got there. Polled
    // because turns are not observable; gives up after 15 s so a hung one cannot block choosing for good.
    const until = Date.now() + 15_000;
    while (generationService.turnsRunning() > 1 && !writing() && Date.now() < until) await sleep(50);
    if (generationService.turnsRunning() > 1 && !writing()) logger.warn('[modelChoice] gave up waiting for a turn still being prepared');
    if (!generationService.getState().isGenerating) return finish();
    const stopped = stopReply();                  // clears every claim, ours too, and schedules a queue drain,
    return generationService.runTurn(async () => { // so claim again in the same tick
      await stopped;
      await stopAllTextEngines();                 // stopGeneration returns before the engine is idle
      await finish();
    });
  }));
  run.then(workDone, workDone); // a throw before the work (stopping the engines) must not block later choices
  return run;
}

export function chooseTextModel(modelId: string): Promise<void> {
  return exclusively(async () => {
    if (modelId !== useAppStore.getState().activeModelId) await activeModelService.unloadTextModel(true);
    // No await from here: the new choice is marked before the remote one is cleared, so there is never no model.
    activeModelService.selectTextModel(modelId);
    useAppStore.getState().setTextModelEvicted(false);
    remoteServerManager.clearActiveRemoteModel();
  });
}

export function chooseRemoteTextModel(serverId: string, modelId: string): Promise<void> {
  return exclusively(async () => {
    const { activeServerId, activeRemoteTextModelId } = useRemoteServerStore.getState();
    const providerId = providerRegistry.getActiveProviderId();
    const restore = () => {
      const store = useRemoteServerStore.getState();
      store.setActiveServerId(activeServerId);
      store.setActiveRemoteTextModelId(activeRemoteTextModelId);
      providerRegistry.setActiveProvider(providerId);
    };
    try { await remoteServerManager.setActiveRemoteTextModel(serverId, modelId); }
    catch (e) { restore(); throw e; }
    if (!providerRegistry.hasProvider(serverId)) { restore(); throw new Error('the server is not available'); }
    await activeModelService.unloadTextModel();
  }, async () => {
    // The server may be off or out of reach: say so before anything is stopped or unloaded. Only asks (the keychain's key,
    // the one the provider uses): no rediscovery, nothing stored, so a refusal leaves the row there to press again.
    const server = await remoteServerManager.getServerWithApiKey(serverId);
    if (!server) throw new Error('the server is not available');
    const result = await testEndpoint(server.endpoint, 10000, server.apiKey);
    if (!result.success) throw new Error(result.error ?? 'the server did not answer');
  });
}

export async function chooseImageModel(modelId: string): Promise<void> {
  useRemoteServerStore.getState().setActiveRemoteImageModelId(null);
  useAppStore.getState().setActiveImageModelId(modelId);
}

export function dropTextModel(): Promise<void> {
  return exclusively(async () => {
    remoteServerManager.clearActiveRemoteModel();
    await activeModelService.unloadTextModel();
  });
}

export async function dropImageModel(): Promise<void> {
  await activeModelService.unloadImageModel();
  useRemoteServerStore.getState().setActiveRemoteImageModelId(null);
}
