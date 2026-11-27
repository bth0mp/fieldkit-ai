import { useAppStore, useChatStore } from '../stores';
import { localDreamGeneratorService } from './localDreamGenerator';
import { contextCompactionService } from './contextCompaction';
import logger from '../utils/logger';

/** What every delete-chat dialog says. */
export function deleteChatMessage(title: string): string {
  return `Delete "${title}"? This will also delete all images generated in this chat.`;
}

/**
 * The one way to delete a chat, for every screen that offers it: the chat's images leave the gallery and
 * the disk, its saved summary goes, and the chat itself goes. A file that cannot be deleted (already gone,
 * say) is logged and the rest go on.
 */
export async function deleteChat(conversationId: string): Promise<void> {
  const imageIds = useAppStore.getState().removeImagesByConversationId(conversationId);
  // The chat goes at once; the promise settles when its files are gone.
  const deletions = imageIds.map(async (imageId) => {
    try {
      await localDreamGeneratorService.deleteGeneratedImage(imageId);
    } catch (error) {
      logger.warn(`[chatDeletion] could not delete image ${imageId}`, error);
    }
  });
  contextCompactionService.clearSummary(conversationId);
  useChatStore.getState().deleteConversation(conversationId);
  await Promise.all(deletions);
}
