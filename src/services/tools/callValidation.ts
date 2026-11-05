/**
 * Checks a call to a tool that needs the user's approval BEFORE the approval card is raised, so the user is
 * never asked to approve something that cannot work: a draft with no subject or body would open blank, a
 * recipient list too long for one mailto link cannot be sent whole, and an event without valid times, or
 * one that ends before it starts, cannot open. The problem comes back as text the model can act on; the
 * loop turns it into an error result and shows no card.
 */
import { draftFromArgs, recipientsProblem } from '../../utils/mailto';
import { AVAILABLE_TOOLS } from './registry';
import { approvalRequired } from './toolOffering';
import { eventTimes } from './calendarTools';
import type { ToolCall } from './types';

const hasText = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

/** What is wrong with this call (a required text argument is missing or blank, or the tool's own limits are
 *  broken), or null when it may go to the user for approval. Calls that need no approval in this
 *  conversation (approvalRequired) are not checked. */
export function preApprovalProblem(call: ToolCall, context: { conversationId: string | null }): string | null {
  const tool = AVAILABLE_TOOLS.find(candidate => candidate.name === call.name);
  if (!tool || !approvalRequired({ toolName: call.name, conversationId: context.conversationId })) return null;
  const missing = Object.entries(tool.parameters)
    .filter(([name, param]) => param.required && !hasText(call.arguments[name]))
    .map(([name]) => name);
  if (missing.length > 0) return `Missing required parameter${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`;
  if (call.name === 'draft_email') return recipientsProblem(draftFromArgs(call.arguments).to);
  if (call.name === 'create_calendar_event') {
    const times = eventTimes(call.arguments);
    return 'problem' in times ? times.problem : null;
  }
  return null;
}
