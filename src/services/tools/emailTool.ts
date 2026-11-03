/**
 * draft_email: opens a prepared email in the user's mail app through a `mailto:` URL. The app never
 * sends mail itself — the user reviews the draft there and sends it. The tool loop runs this only after
 * the user approved the call on the approval card.
 */
import { Linking } from 'react-native';
import { buildMailtoUrl, draftFromArgs } from '../../utils/mailto';
import type { ToolCall, ToolResult } from './types';

const OPENED = 'Opened a draft in the mail app. The user sends it from there.';

export const emailTool = {
  async run(call: ToolCall): Promise<ToolResult> {
    const start = Date.now();
    const { url } = buildMailtoUrl(draftFromArgs(call.arguments));
    await Linking.openURL(url);
    return { toolCallId: call.id, name: call.name, content: OPENED, durationMs: Date.now() - start };
  },
};
