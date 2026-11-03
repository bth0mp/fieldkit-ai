/**
 * Tool policy for a turn: which calls need the user's approval before they run. The conversation is
 * part of the question because a conversation's own state can make a tool need approval.
 */
import { AVAILABLE_TOOLS } from './registry';

export function approvalRequired({ toolName }: { toolName: string; conversationId: string | null }): boolean {
  return AVAILABLE_TOOLS.some(tool => tool.name === toolName && tool.requiresApproval === true);
}
