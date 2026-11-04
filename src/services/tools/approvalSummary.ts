/**
 * What the approval card shows for a tool call: a title and a few plain-text lines the user can read
 * before approving. Never raw JSON.
 */
import { draftFromArgs, recipientList } from '../../utils/mailto';
import { AVAILABLE_TOOLS } from './registry';
import type { ToolCall } from './types';

export interface ApprovalSummary {
  title: string;
  lines: string[];
}

const MAX_VALUE_CHARS = 200;
const BODY_PREVIEW_LINES = 3;

const clip = (text: string): string => (text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS - 1)}…` : text);
/** A single-line field stays on one card line: a line break in it must not pass for another field. */
const oneLine = (text: string): string => text.replace(/\r\n|[\r\n\u0085\u2028\u2029]/g, ' ');

/** A readable rendering of an argument value: lists joined by commas, objects as `key: value` pairs. */
function valueText(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(valueText).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${valueText(v)}`).join(', ');
  }
  return String(value);
}

function emailSummary(call: ToolCall): ApprovalSummary {
  const draft = draftFromArgs(call.arguments);
  const bodyLines = draft.body ? draft.body.split(/\r?\n/).slice(0, BODY_PREVIEW_LINES).map(clip) : [];
  // Every recipient the draft goes to, never clipped (the card wraps): a long list must not hide one.
  const recipients = recipientList(draft.to ?? '').map(oneLine).join(', ');
  return {
    title: 'Email draft',
    lines: [`To: ${recipients || '(not set)'}`, `Subject: ${clip(oneLine(draft.subject))}`, ...bodyLines],
  };
}

export function approvalSummaryFor(call: ToolCall): ApprovalSummary {
  if (call.name === 'draft_email') return emailSummary(call);
  const title = AVAILABLE_TOOLS.find(tool => tool.name === call.name)?.displayName ?? call.name;
  const lines = Object.entries(call.arguments).map(([key, value]) => `${key}: ${clip(valueText(value))}`);
  return { title, lines };
}
