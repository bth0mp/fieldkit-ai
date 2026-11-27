import { Share } from 'react-native';
import type { Conversation, Message } from '../types';
import { parseModelOutput } from '../utils/messageContent';
import logger from '../utils/logger';
import { appLockService } from './appLockService';

/**
 * Sharing a conversation as plain text through the phone's share sheet.
 *
 * What goes out is what the two sides said: the user's messages and the assistant's answers, in order. The
 * assistant's hidden reasoning, its tool calls and the tool rows are left out, and so are the app's own notes
 * (model loaded, and so on). An attachment is named, not included. Nothing leaves the phone until the user
 * picks where to send it in the share sheet.
 */
function spokenText(message: Message): string {
  if (message.isSystemInfo || (message.role !== 'user' && message.role !== 'assistant')) return '';
  // The same parse the chat bubble uses, so reasoning and tool markup can never ride along.
  const text = message.role === 'assistant' ? parseModelOutput(message.content, message.reasoningContent).answer : message.content;
  const attached = (message.attachments ?? []).map(a => (a.fileName ? `[${a.type}: ${a.fileName}]` : `[${a.type}]`));
  return [text.trim(), ...attached].filter(Boolean).join('\n');
}

function conversationToText(conversation: Conversation): string {
  const turns = conversation.messages
    .map(message => ({ who: message.role === 'user' ? 'You' : 'Assistant', text: spokenText(message) }))
    .filter(turn => turn.text !== '')
    .map(turn => `${turn.who}: ${turn.text}`);
  const title = conversation.title?.trim();
  return [...(title ? [title] : []), ...turns].join('\n\n');
}

/** True once either side has said something: before that there is nothing to share. */
export function canShareConversation(conversation: Conversation | null | undefined): conversation is Conversation {
  return !!conversation && conversation.messages.some(message => spokenText(message) !== '');
}

export async function shareConversation(conversation: Conversation): Promise<void> {
  try {
    appLockService.openingSystemScreen();
    await Share.share({ title: conversation.title, message: conversationToText(conversation) });
  } catch (error) {
    // The user closing the sheet is not an error on Android; anything that lands here is the sheet failing to open.
    logger.error('[Share] Could not open the share sheet for a conversation:', error);
  }
}
