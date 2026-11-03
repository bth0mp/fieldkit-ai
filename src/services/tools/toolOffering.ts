/**
 * Tool policy for a turn: which tools are offered, and which calls need the user's approval before they
 * run. The conversation is part of the question because a conversation's own state can make a tool need
 * approval.
 */
import { AVAILABLE_TOOLS } from './registry';

export function approvalRequired({ toolName }: { toolName: string; conversationId: string | null }): boolean {
  return AVAILABLE_TOOLS.some(tool => tool.name === toolName && tool.requiresApproval === true);
}

/**
 * The enabled tools this turn may offer the model. An engine that cannot wait on an approval card
 * (EngineCapabilities.supportsToolApproval false) is never offered a tool that needs one.
 */
export function offeredToolIds(input: { enabledToolIds: string[]; conversationId: string | null; supportsToolApproval: boolean }): string[] {
  const { enabledToolIds, conversationId, supportsToolApproval } = input;
  if (supportsToolApproval) return [...enabledToolIds];
  return enabledToolIds.filter(id => {
    const toolName = AVAILABLE_TOOLS.find(tool => tool.id === id)?.name ?? id;
    return !approvalRequired({ toolName, conversationId });
  });
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
