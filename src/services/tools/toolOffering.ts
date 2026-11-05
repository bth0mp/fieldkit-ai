/**
 * Tool policy for a turn: which tools are offered, and which calls need the user's approval before they
 * run. The conversation is part of the question because a conversation's own state can make a tool need
 * approval.
 */
import { AVAILABLE_TOOLS } from './registry';
import { calendarService } from '../calendar/calendarService';
import { isConversationPrivate } from '../privateDataGuard';
import { servingEngine } from '../servingEngine';
import type { ToolDefinition } from './types';

const MODULE_PRESENT: Record<NonNullable<ToolDefinition['requiredModule']>, () => boolean> = {
  calendar: () => calendarService.isPresent(),
};

/** Can this device run the tool? A tool whose native module is missing is never offered or switched on. */
export function toolAvailability(toolId: string): { available: boolean; reason?: 'module-missing' } {
  const required = AVAILABLE_TOOLS.find(tool => tool.id === toolId)?.requiredModule;
  if (required && !MODULE_PRESENT[required]()) return { available: false, reason: 'module-missing' };
  return { available: true };
}

/** Tools that send what the model writes to the network: in a private chat they wait for the user's approval. */
const NETWORK_TOOLS_GATED_IN_PRIVATE_CHATS = ['web_search', 'read_url'];

export function approvalRequired({ toolName, conversationId }: { toolName: string; conversationId: string | null }): boolean {
  if (AVAILABLE_TOOLS.some(tool => tool.name === toolName && tool.requiresApproval === true)) return true;
  return NETWORK_TOOLS_GATED_IN_PRIVATE_CHATS.includes(toolName) && isConversationPrivate(conversationId);
}

/**
 * The enabled tools this turn may offer the model. A tool this device cannot run is never offered, a tool
 * whose results are private data is never offered to a remote model (servingEngine decides which engine
 * serves the turn), and an engine that cannot wait on an approval card (EngineCapabilities.supportsToolApproval
 * false) is never offered a tool that needs one. The tool loop and the prompt's tool hint both ask here.
 */
export function offeredToolIdsForTurn(input: { enabledToolIds: string[]; conversationId: string | null; forceRemote?: boolean; supportsToolApproval: boolean }): string[] {
  const { conversationId, supportsToolApproval, forceRemote } = input;
  const remoteActive = servingEngine({ forceRemote, conversationId }) === 'remote';
  const enabledToolIds = input.enabledToolIds.filter(id => {
    if (!toolAvailability(id).available) return false;
    return !(remoteActive && handlesPrivateData(id));
  });
  if (supportsToolApproval) return enabledToolIds;
  return enabledToolIds.filter(id => {
    const toolName = AVAILABLE_TOOLS.find(tool => tool.id === id)?.name ?? id;
    return !approvalRequired({ toolName, conversationId });
  });
}

/** Its results are the user's private data (the calendar). Takes a tool id or name (built-ins use the same). */
export function handlesPrivateData(toolIdOrName: string): boolean {
  return AVAILABLE_TOOLS.some(tool => (tool.id === toolIdOrName || tool.name === toolIdOrName) && tool.handlesPrivateData === true);
}

/**
 * Was this call's tool offered this turn? A built-in tool runs only when offered, so a call the model was
 * never given (a tool switched off, one withheld from this engine, or a name in text injected into a reply)
 * never runs. Extension tools (MCP) are offered and routed by their extension.
 */
export function toolCallOffered(input: { toolName: string; offeredToolNames: readonly string[] }): boolean {
  const { toolName, offeredToolNames } = input;
  const builtIn = AVAILABLE_TOOLS.some(tool => tool.name === toolName);
  return !builtIn || offeredToolNames.includes(toolName);
}
