import RNFS from 'react-native-fs';
import type { MediaAttachment, Message } from '../types';
import logger from '../utils/logger';

/**
 * The image attachments of one message that the model may see, by declaration alone (they name a
 * file). One rule for what model input may carry: every place that builds it asks here instead of
 * filtering `type === 'image'` by hand.
 */
export function modelImageAttachments(attachments: MediaAttachment[] | undefined): MediaAttachment[] {
  return (attachments ?? []).filter(a => a.type === 'image' && !!a.uri);
}

/**
 * Drop image attachments whose files no longer exist before they reach the native layer. A
 * generated image's uri is a temp/cache path that gets cleaned up, so once it is in the
 * conversation history EVERY later turn (even a voice note) flips to VISION mode and the native
 * completion throws "File does not exist or cannot be opened", killing the whole turn (silent empty
 * bubble). A missing image is simply not sent, so the turn runs (TEXT-ONLY if none remain)
 * instead of crashing.
 */
export async function dropMissingImageAttachments(messages: Message[]): Promise<Message[]> {
  const out: Message[] = [];
  for (const m of messages) {
    const attachments = m.attachments;
    if (!attachments?.some(a => a.type === 'image')) { out.push(m); continue; }
    const kept: typeof attachments = [];
    for (const a of attachments) {
      if (a.type !== 'image') { kept.push(a); continue; }
      const path = (a.uri || '').replace(/^file:\/\//, '');
      const exists = path.length > 0 && await RNFS.exists(path).catch(() => false);
      if (exists) kept.push(a);
      else logger.warn(`[LLM] dropping missing image attachment (file gone): ${a.uri}`);
    }
    out.push(kept.length === attachments.length ? m : { ...m, attachments: kept });
  }
  return out;
}
