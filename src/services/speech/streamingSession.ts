import type { Message } from '../../types';
import { parseModelOutput, prepareMessageForSpeech } from '../../utils/messageContent';
import { splitIntoSentences, stableSpeakablePrefix, unreadSentences } from '../../utils/speechText';

/** Where the host's stream stands when a session opens. */
interface StreamStart {
  gen: number;
  conversationId: string | null;
  /** How many messages the conversation holds. The host stores one per finished round. */
  messageCount: number;
  /** Length of the first text the session saw. */
  length: number;
}

/**
 * One streamed reply being read aloud as it arrives, from its first token until the host reports the stream
 * ended. It holds the bookkeeping and the text rules; `speechService` owns it, drives the engine and is the
 * only writer of the speech store. Shaped like the service's chunk session (`gen`, `total`, `done`) so the
 * engine events finish it the same way; `total` stays Infinity while more sentences may follow.
 */
export class StreamingSession {
  total = Infinity;
  readonly done = new Set<string>();
  readonly startedAt = Date.now();
  readonly gen: number;
  readonly conversationId: string | null;
  /** The speech was cut off (stop, a new message, a failed setup): nothing more is read of this reply. */
  stopped = false;
  /** The host reported the stream over. The next token starts a new session. */
  ended = false;
  /** The engine is set up: queued sentences go straight to it. */
  ready = false;
  starting = false;
  queue: string[] = [];
  /** Sentences of the reply already handed on; the one after them may still grow. */
  private spokenCount = 0;
  private lastSpoken: string | null = null;
  private nextIndex = 0;
  private readonly messageCount: number;
  /** Length of the text at the last token. After a stop, a shorter text is the next reply. */
  private seenLength: number;

  constructor(start: StreamStart) {
    this.gen = start.gen;
    this.conversationId = start.conversationId;
    this.messageCount = start.messageCount;
    this.seenLength = start.length;
  }

  /**
   * True when a token starts a new reply instead of continuing this one: the host reported the stream over; or
   * it stored a message since (the pause between tool rounds does not always show as a stream end, because a
   * quick tool finishes before the screen redraws); or the text restarted after a stop.
   */
  isOver(now: Pick<StreamStart, 'length' | 'messageCount'>): boolean {
    return this.ended || now.messageCount !== this.messageCount || (this.stopped && now.length < this.seenLength);
  }

  noteLength(length: number): void {
    this.seenLength = length;
  }

  /**
   * The sentences of the answer so far that are finished and not yet handed on. Code, markup and anything
   * still open are left out. The last sentence is held until a later one exists, because it may still grow.
   */
  takeFinished(cumulative: string): string[] {
    const prefix = stableSpeakablePrefix(parseModelOutput(cumulative).answer);
    const sentences = splitIntoSentences(prepareMessageForSpeech(prefix));
    const finished = sentences.slice(this.spokenCount, sentences.length - 1);
    this.spokenCount = Math.max(this.spokenCount, sentences.length - 1);
    if (finished.length > 0) this.lastSpoken = finished[finished.length - 1];
    return finished;
  }

  /** What of the stored reply was not read while it streamed. `aligned` is false when it no longer matches what was. */
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
