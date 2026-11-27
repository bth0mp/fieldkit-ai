import { useChatStore, whenChatsLoaded } from '../stores/chatStore';
import { audioRecorderService } from './audioRecorderService';

/**
 * Delete the recordings of earlier dictations that no saved message refers to. It waits until the saved
 * chats have been read successfully, so a chat that could not be read never loses its voice notes.
 * Returns how many files it deleted.
 */
export async function deleteLeftoverRecordings(): Promise<number> {
  await whenChatsLoaded();
  const keep = new Set<string>();
  for (const conversation of useChatStore.getState().conversations) {
    for (const message of conversation.messages) {
      if (message.audioPath) keep.add(message.audioPath);
      for (const attachment of message.attachments ?? []) keep.add(attachment.uri);
    }
  }
  return audioRecorderService.deleteUnusedRecordings(keep);
}
