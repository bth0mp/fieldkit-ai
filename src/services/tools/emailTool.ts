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
import type { ToolCall, ToolResult } from './types';

const OPENED = 'Opened a draft in the mail app. The user sends it from there.';
const BODY_SHORTENED = ' The body was shortened to fit; the full text was copied to the clipboard.';
const NO_MAIL_APP = 'No mail app opened. The draft was copied and the share sheet was opened.';

export const emailTool = {
  async run(call: ToolCall): Promise<ToolResult> {
    const start = Date.now();
    const draft = draftFromArgs(call.arguments);
    const { url, truncated } = buildMailtoUrl(draft);
    const result = (content: string): ToolResult => ({ toolCallId: call.id, name: call.name, content, durationMs: Date.now() - start });
    try {
      await Linking.openURL(url);
    } catch {
      Clipboard.setString(draft.body);
      await Share.share({ title: draft.subject, message: draft.body });
      return result(NO_MAIL_APP);
    }
    if (!truncated) return result(OPENED);
    Clipboard.setString(draft.body);
    return result(OPENED + BODY_SHORTENED);
  },
};
