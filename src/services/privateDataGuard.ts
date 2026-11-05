/**
 * A chat that holds private data (a calendar read returned events in it) is never sent to a remote model.
 * Every request site that sends a conversation's content to a remote provider calls assertRemoteAllowed
 * first; the chat screen turns the error into a notice that offers a new chat or the on-device model.
 */
import { useChatStore } from '../stores';

export function isConversationPrivate(conversationId: string | null): boolean {
  if (!conversationId) return false;
  return useChatStore.getState().conversations?.find(conv => conv.id === conversationId)?.containsPrivateData === true;
}

class PrivateDataRemoteError extends Error {
  constructor() {
    super('This chat contains calendar data, which is never sent to a remote model');
    this.name = 'PrivateDataRemoteError';
  }
}

/** Checks the name, not instanceof: a module reset (tests, fast refresh) gives the class a new identity. */
export function isPrivateDataRemoteError(e: unknown): boolean {
  return (e as { name?: unknown } | null)?.name === 'PrivateDataRemoteError';
}

/** Throws PrivateDataRemoteError when this conversation may not go to a remote model. */
export function assertRemoteAllowed(conversationId: string | null): void {
  if (isConversationPrivate(conversationId)) throw new PrivateDataRemoteError();
}
