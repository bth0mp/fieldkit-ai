/**
 * Builds the `mailto:` URL the email tool hands to the OS (RFC 6068): line breaks become `%0D%0A`,
 * spaces `%20`, and `&`, `+`, `#`, `=` are percent-encoded so they survive the mail app's parser.
 * Some mail apps drop or reject longer URLs, so the whole URL stays under MAILTO_MAX_LENGTH: the
 * recipients are never cut (a list that does not fit is refused), the subject gets a bounded share,
 * and the body gets whatever is left.
 */
interface MailDraft {
  to?: string;
  subject: string;
  body: string;
}

const MAILTO_MAX_LENGTH = 4000;
/** Encoded characters the subject may take, so a runaway subject never crowds out the body. */
const SUBJECT_MAX_ENCODED = 300;
/** Encoded characters the recipients may take. A longer list is refused, never shortened. */
const RECIPIENTS_MAX_ENCODED = 1000;

const encodeText = (text: string): string => encodeURIComponent(text.replace(/\r?\n/g, '\r\n'));

/** Each address is encoded on its own, keeping `@` readable; the list stays comma-separated. */
const encodeAddresses = (to: string): string =>
  to.split(',')
    .map(address => address.trim())
    .filter(Boolean)
    .map(address => encodeURIComponent(address).replace(/%40/g, '@'))
    .join(',');

/** Why these recipients cannot go in one draft (a message the model can act on, written like the other tool
 *  errors: no final period, the tool result adds its own), or null when they fit. */
export function recipientsProblem(to: string | undefined): string | null {
  if (!to || encodeAddresses(to).length <= RECIPIENTS_MAX_ENCODED) return null;
  return 'Too many recipients for one draft. Use fewer addresses, or split them across several drafts';
}

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

/** Throws when the recipients do not fit (see recipientsProblem): they are never dropped. `truncated` is set
 *  when anything was cut; `bodyTruncated` when the body was. */
export function buildMailtoUrl(draft: MailDraft): { url: string; truncated: boolean; bodyTruncated: boolean } {
  const problem = recipientsProblem(draft.to);
  if (problem) throw new Error(problem);
  const subject = encodePrefix(draft.subject, SUBJECT_MAX_ENCODED);
  const prefix = `mailto:${draft.to ? encodeAddresses(draft.to) : ''}?subject=${subject.encoded}&body=`;
  const body = encodePrefix(draft.body, MAILTO_MAX_LENGTH - 1 - prefix.length);
  return { url: `${prefix}${body.encoded}`, truncated: subject.cut || body.cut, bodyTruncated: body.cut };
}

/** Reads a draft from a tool call's arguments. A model may send `to` as a list; anything that is
 *  not text becomes empty. */
export function draftFromArgs(args: Record<string, unknown>): MailDraft {
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  const to = Array.isArray(args.to) ? args.to.filter(v => typeof v === 'string').join(',') : text(args.to);
  return { ...(to.trim() ? { to } : {}), subject: text(args.subject), body: text(args.body) };
}
