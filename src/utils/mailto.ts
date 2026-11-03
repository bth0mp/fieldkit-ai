/**
 * Builds the `mailto:` URL the email tool hands to the OS (RFC 6068): line breaks become `%0D%0A`,
 * spaces `%20`, and `&`, `+`, `#`, `=` are percent-encoded so they survive the mail app's parser.
 * Some mail apps drop or reject longer URLs, so the whole URL stays under MAILTO_MAX_LENGTH.
 */
interface MailDraft {
  to?: string;
  subject: string;
  body: string;
}

const MAILTO_MAX_LENGTH = 4000;

const encodeText = (text: string): string => encodeURIComponent(text.replace(/\r?\n/g, '\r\n'));

/** Each address is encoded on its own, keeping `@` readable; the list stays comma-separated. */
const encodeAddresses = (to: string): string =>
  to.split(',')
    .map(address => address.trim())
    .filter(Boolean)
    .map(address => encodeURIComponent(address).replace(/%40/g, '@'))
    .join(',');

/** The longest prefix of `text` whose encoding fits in `budget` characters, cut between characters
 *  (never inside a percent-escape or a surrogate pair). */
function encodePrefix(text: string, budget: number): { encoded: string; cut: boolean } {
  const full = encodeText(text);
  if (full.length <= budget) return { encoded: full, cut: false };
  let encoded = '';
  for (const char of text.replace(/\r?\n/g, '\r\n')) {
    const next = encodeURIComponent(char);
    if (encoded.length + next.length > budget) break;
    encoded += next;
  }
  return { encoded, cut: true };
}

export function buildMailtoUrl(draft: MailDraft): { url: string; truncated: boolean } {
  const head = `mailto:${draft.to ? encodeAddresses(draft.to) : ''}?subject=`;
  const limit = MAILTO_MAX_LENGTH - 1;
  const bodyKey = '&body=';
  const subject = encodePrefix(draft.subject, Math.max(0, limit - head.length - bodyKey.length));
  const prefix = `${head}${subject.encoded}${bodyKey}`;
  const body = encodePrefix(draft.body, Math.max(0, limit - prefix.length));
  return { url: `${prefix}${body.encoded}`, truncated: subject.cut || body.cut };
}

/** Reads a draft from a tool call's arguments. A model may send `to` as a list; anything that is
 *  not text becomes empty. */
export function draftFromArgs(args: Record<string, unknown>): MailDraft {
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  const to = Array.isArray(args.to) ? args.to.filter(v => typeof v === 'string').join(',') : text(args.to);
  return { ...(to.trim() ? { to } : {}), subject: text(args.subject), body: text(args.body) };
}
