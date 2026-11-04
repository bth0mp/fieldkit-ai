import type { Message } from '../../types';
import { parseModelOutput, prepareMessageForSpeech } from '../../utils/messageContent';
import { splitIntoSentences, stableSpeakablePrefix, unreadSentences } from '../../utils/speechText';

/** The chat store's streaming fields that mark where a reply starts and ends. */
interface StreamingFields {
  streamingForConversationId: string | null;
  streamingMessage: string;
}

/**
 * Where a chat store update puts a reply boundary, if anywhere. Streaming that starts with an empty text, also
 * for another chat, is a 'start'. A text emptied while streaming goes on is a 'reset': the JS tool loop empties
 * it before each further round, and an append that strips a closed tool call can leave it empty. LiteRT's
 * native tool loop never empties the text, so its whole turn is one reply.
 */
export function replyBoundary(state: StreamingFields, prev: StreamingFields): 'start' | 'reset' | null {
  if (state.streamingForConversationId === null || state.streamingMessage !== '') return null;
  if (prev.streamingMessage !== '') return 'reset';
  return prev.streamingForConversationId !== state.streamingForConversationId ? 'start' : null;
}

/** The chat store streams a reply for a chat other than the one on screen. */
export function streamsOffScreen(state: StreamingFields & { activeConversationId: string | null }): boolean {
  return state.streamingForConversationId !== state.activeConversationId;
}

/**
 * One streamed reply being read aloud as it arrives, from its first token until the chat store starts the next
 * reply or the host reports the stream ended. It holds the bookkeeping and the text rules; `speechService` owns
 * it, drives the engine and is the only writer of the speech store. Shaped like the service's chunk session
 * (`gen`, `total`, `done`) so the engine events finish it the same way; `total` stays Infinity while more
 * sentences may follow.
 */
export class StreamingSession {
  total = Infinity;
  readonly done = new Set<string>();
  readonly startedAt = Date.now();
  /** The speech was cut off (stop, a new message, a failed setup): nothing more is read of this reply. */
  stopped = false;
  /** The reply is over. The next token starts a new session. */
  ended = false;
  /** The engine is set up: queued sentences go straight to it. */
  ready = false;
  starting = false;
  queue: string[] = [];
  /** The answer at the last token, markup left out: a reply boundary reads the rest of the reply from it. */
  answer = '';
  /** Sentences of the reply already handed on; the one after them may still grow. */
  private spokenCount = 0;
  private lastSpoken: string | null = null;
  private nextIndex = 0;

  constructor(readonly gen: number, readonly conversationId: string | null) {}

  /**
   * The sentences of the answer so far that are finished and not yet handed on. Code, markup and anything
   * still open are left out. The last sentence is held until a later one exists, because it may still grow.
   */
  takeFinished(cumulative: string): string[] {
    this.answer = parseModelOutput(cumulative).answer;
    const sentences = splitIntoSentences(prepareMessageForSpeech(stableSpeakablePrefix(this.answer)));
    const finished = sentences.slice(this.spokenCount, sentences.length - 1);
    this.spokenCount = Math.max(this.spokenCount, sentences.length - 1);
    if (finished.length > 0) this.lastSpoken = finished[finished.length - 1];
    return finished;
  }

  /** What of the whole reply was not read while it streamed. `aligned` is false when it no longer matches what was. */
  takeRemainder(content: string): { rest: string[]; aligned: boolean } {
    return unreadSentences({
      sentences: splitIntoSentences(prepareMessageForSpeech(content)),
      spokenCount: this.spokenCount,
      lastSpoken: this.lastSpoken,
    });
  }

  /** Utterance ids are `${messageId}:${generation}:${index}`, here with the message id `stream`. */
  nextUtteranceId(): string {
    return `stream:${this.gen}:${this.nextIndex++}`;
  }

  /** How many utterances were handed to the engine. */
  get issued(): number {
    return this.nextIndex;
  }
}

/** A reply the host just stored that was not read while it streamed: the assistant's own answer, new this turn. */
export function isUnreadAnswer(message: Message | undefined, seen: { since: number; spoken: Set<string> }): message is Message {
  return !!message && message.role === 'assistant' && !message.toolCalls?.length && !message.isSystemInfo
    && message.timestamp >= seen.since && !seen.spoken.has(message.id);
}
