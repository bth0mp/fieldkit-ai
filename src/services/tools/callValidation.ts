/**
 * Checks a call to a tool that needs the user's approval BEFORE the approval card is raised, so the user is
 * never asked to approve something that cannot work: a draft with no subject or body would open blank, a
 * recipient list too long for one mailto link cannot be sent whole, and an event without valid times, or
 * one that ends before it starts, cannot open. A query or URL too long for the card to show whole is
 * refused, so the user never approves text they cannot see. The problem comes back as text the model can
 * act on; the loop turns it into an error result and shows no card.
 */
import { draftFromArgs, recipientsProblem } from '../../utils/mailto';
import { AVAILABLE_TOOLS } from './registry';
import { approvalRequired } from './toolOffering';
import { eventTimes } from './calendarTools';
import type { ToolCall } from './types';

const hasText = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

/** The longest query or URL the approval card shows; it shows it whole. */
const MAX_SHOWN_CHARS = 500;
const SHOWN_WHOLE: Record<string, { param: string; label: string }> = {
  web_search: { param: 'query', label: 'query' },
  read_url: { param: 'url', label: 'URL' },
};

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
  const shown = SHOWN_WHOLE[call.name];
  if (shown && String(call.arguments[shown.param]).trim().length > MAX_SHOWN_CHARS) {
    return `The ${shown.label} is too long to show for approval (${MAX_SHOWN_CHARS} characters at most)`;
  }
  if (call.name === 'draft_email') return recipientsProblem(draftFromArgs(call.arguments).to);
  if (call.name === 'create_calendar_event') {
    const times = eventTimes(call.arguments);
    return 'problem' in times ? times.problem : null;
  }
  return null;
}
