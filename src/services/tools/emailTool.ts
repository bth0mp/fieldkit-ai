/**
 * draft_email: opens a prepared email in the user's mail app through a `mailto:` URL. The app never
 * sends mail itself — the user reviews the draft there and sends it. The tool loop runs this only after
 * the user approved the call on the approval card.
 *
 * Two cases the mail app cannot cover: a body too long for a mailto link opens shortened, with the full
 * body copied to the clipboard; and when no mail app opens at all, the draft is copied and the share
 * sheet opens so the user can still send it from any app.
 */
import { Clipboard, Linking, Share } from 'react-native';
import { buildMailtoUrl, draftFromArgs } from '../../utils/mailto';
import logger from '../../utils/logger';
import type { ToolCall, ToolResult } from './types';

const OPENED = 'Opened a draft in the mail app. The user sends it from there.';
const BODY_SHORTENED = ' The body was shortened to fit; the full text was copied to the clipboard.';
const SUBJECT_SHORTENED = ' The subject was shortened to fit.';
const NO_MAIL_APP = 'No mail app opened. The draft was copied and the share sheet was opened.';
const NO_MAIL_APP_NO_SHARE = 'No mail app opened. The draft was copied to the clipboard.';

/** No mail app opened: copy the draft (unless it already is) and open the share sheet. Says which happened. */
async function shareInstead(draft: { subject: string; body: string }, copied: boolean): Promise<string> {
  if (!copied) Clipboard.setString(draft.body);
  try {
    await Share.share({ title: draft.subject, message: draft.body });
    return NO_MAIL_APP;
  } catch (error) {
    logger.error('[emailTool] the share sheet did not open', error);
    return NO_MAIL_APP_NO_SHARE;
  }
}

export const emailTool = {
  async run(call: ToolCall): Promise<ToolResult> {
    const start = Date.now();
    const draft = draftFromArgs(call.arguments);
    const { url, truncated, bodyTruncated } = buildMailtoUrl(draft);
    const result = (content: string): ToolResult => ({ toolCallId: call.id, name: call.name, content, durationMs: Date.now() - start });
    // Copy the full body before the mail app opens: once it does, this app may no longer be in front.
    if (bodyTruncated) Clipboard.setString(draft.body);
    try {
      await Linking.openURL(url);
    } catch {
      return result(await shareInstead(draft, bodyTruncated));
    }
    if (!truncated) return result(OPENED);
    return result(OPENED + (bodyTruncated ? BODY_SHORTENED : SUBJECT_SHORTENED));
  },
};
