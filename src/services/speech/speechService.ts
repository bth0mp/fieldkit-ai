import { AppState } from 'react-native';
import { generationSession } from '../generationSession';
import { useChatStore } from '../../stores/chatStore';
import { useSpeechStore, type SpeechPatch } from '../../stores/speechStore';
import { prepareMessageForSpeech } from '../../utils/messageContent';
import { chunkForEngine, splitIntoSentences } from '../../utils/speechText';
import logger from '../../utils/logger';
import { isUnreadAnswer, replyBoundary, StreamingSession } from './streamingSession';
import { systemSpeechEngine } from './systemSpeechEngine';
import type { SpeechEngine, SpeechEngineEvent, SpeechPhase, SpeechVoice } from './speechTypes';

const LOG = '[SPEECH-SM]';
const DEFAULT_MAX_INPUT_LENGTH = 4000;
const PREVIEW_MESSAGE_ID = 'voice-preview';
const PREVIEW_TEXT = 'This is how your replies will sound.';

/** How a setup run (init, voice list, voice selection) ended. 'superseded' = a newer init replaced it. */
type SetupOutcome = 'ready' | 'unavailable' | 'error' | 'superseded';

/** The id the store shows while a reply is read as it streams, before the stored message is known. */
const STREAMING_ID = 'streaming';

/** The chunks of the message being spoken; `done` holds the utterance ids the engine finished. */
interface Session {
  gen: number;
  total: number;
  done: Set<string>;
}

const store = () => useSpeechStore.getState();

const errorCode = (error: unknown): unknown => (error as { code?: unknown } | null)?.code;

/** Only voices that work offline and are installed are ever selected or spoken. */
const isOfflineVoice = (voice: SpeechVoice): boolean => !voice.networkRequired && !voice.notInstalled;

/**
 * The voice the engine speaks with: the selected one if it is still available, else the highest quality
 * one (first wins a tie). The voice panel calls this too, so its check mark is always the voice in use.
 */
export function pickVoice(voices: SpeechVoice[], selectedId: string | null): SpeechVoice | undefined {
  return voices.find(voice => voice.id === selectedId)
    ?? voices.reduce<SpeechVoice | undefined>((best, voice) => (!best || voice.quality > best.quality ? voice : best), undefined);
}

/** Utterance ids are `${messageId}:${generation}:${index}`; read the generation from the right. */
function generationOf(utteranceId: string): number {
  const parts = utteranceId.split(':');
  return Number(parts[parts.length - 2]);
}

/**
 * Owns the speech state machine. The store is a read-only projection of it; screens and hooks call the
 * methods below and never touch the engine. Every speech request carries a generation: stop(), refresh()
 * and a newer request bump it, and anything started under an older generation drops out.
 */
class SpeechService {
  private generation = 0;
  private session: Session | null = null;
  private stream: StreamingSession | null = null;
  private readonly spokenMessageIds = new Set<string>();
  private memo: Promise<SetupOutcome> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private maxInputLength = DEFAULT_MAX_INPUT_LENGTH;
  private attached = false;
  /** The conversation whose generating turn a stop() silenced: nothing more of that turn is read aloud. */
  private silencedTurn: string | null = null;

  constructor(private readonly engine: SpeechEngine) {
    // The silence lasts until the host begins a turn (its later tool rounds stay silent too). A session end
    // is not the turn's end: a conversation switch ends the session while the left turn generates on.
    generationSession.subscribe(() => {
      if (generationSession.getConversationId() !== null) this.silencedTurn = null;
    });
    // The chat store marks where one streamed reply ends and the next begins (replyBoundary). The boundary is
    // handled once the store action that caused it is over: an append that strips the text to '' hands the
    // token hook the stripped text first, so the rest is read from the text the store settled on.
    useChatStore.subscribe((state, prev) => {
      const boundary = replyBoundary(state, prev);
      const stream = this.stream;
      if (boundary !== null && stream && !stream.ended) queueMicrotask(() => this.endReply({ stream, readRest: boundary === 'reset' }));
    });
  }

  /** Cached and synchronous: the engine exists and is not known to lack an offline voice. */
  canSpeak(): boolean {
    return this.engine.isPresent() && store().phase !== 'unavailable';
  }

  /**
   * `prepared` says the caller already ran the text through prepareMessageForSpeech. Preparing is not
   * idempotent (a second pass eats a leading "2024." as a list number), so prepared text is not touched again.
   */
  async speakMessage(input: { text: string; messageId: string; prepared?: boolean }): Promise<void> {
    if (!this.engine.isPresent()) return;
    // Native speak() queues behind whatever is playing, so cut that off first.
    this.stop();
    const gen = ++this.generation;
    this.put({
      speakingMessageId: input.messageId,
      phase: store().phase === 'ready' ? 'speaking' : 'initializing',
    });

    const outcome = await this.ensureReady();
    if (gen !== this.generation) return;
    if (outcome !== 'ready') {
      this.put({ speakingMessageId: null });
      return;
    }

    const chunks = chunkForEngine({
      sentences: splitIntoSentences(input.prepared ? input.text : prepareMessageForSpeech(input.text)),
      maxLen: this.maxInputLength,
    });
    if (chunks.length === 0) {
      this.finish();
      return;
    }
    this.session = { gen, total: chunks.length, done: new Set() };
    this.put({ phase: 'speaking' });

    for (const [index, text] of chunks.entries()) {
      const { rate, pitch } = store();
      const utteranceId = `${input.messageId}:${gen}:${index}`;
      try {
        await this.serialForGen(gen, () => this.engine.speak({ text, utteranceId, rate, pitch }));
      } catch (error) {
        this.speakFailed(gen, error);
        return;
      }
      if (gen !== this.generation) return;
    }
  }

  /**
   * Synchronous, idempotent and always runs: silence the engine and drop everything pending. A stop while a
   * turn is generating also keeps the rest of that turn from being read aloud.
   */
  stop(): void {
    this.generation++;
    this.session = null;
    if (this.stream) this.stream.stopped = true;
    // Back in a chat that still generates, there is no generation session (the switch ended it): the chat
    // store still names the chat it streams for.
    const generating = generationSession.getConversationId() ?? useChatStore.getState().streamingForConversationId;
    if (generating !== null) this.silencedTurn = generating;
    this.clearSpeaking();
    this.engine.stop().catch(error => logger.warn(`${LOG} stop failed`, error));
  }

  /**
   * Re-run init and the voice filter. Never memoized. Native init() releases the engine, which drops
   * queued utterances without events, so speaking state is reset first, exactly as stop() does.
   */
  async refresh(): Promise<void> {
    if (!this.engine.isPresent()) {
      this.put({ available: false });
      return;
    }
    // Before setup, not after: a setup that fails (error phase) must not read as "no speech on this device".
    this.put({ available: true });
    this.stop();
    await this.runSetup();
  }

  /** Choose a voice by id. The choice is persisted only once the engine accepted it. */
  async selectVoice(id: string): Promise<void> {
    if (!this.engine.isPresent() || (await this.ensureReady()) !== 'ready') return;
    if (!store().voices.some(voice => voice.id === id)) return;
    try {
      const accepted = await this.serial(() => this.engine.setVoice(id));
      if (accepted) this.put({ selectedVoiceId: id });
      else await this.refresh();
    } catch (error) {
      logger.error(`${LOG} selectVoice failed`, error);
    }
  }

  previewVoice(): Promise<void> {
    return this.speakMessage({ text: PREVIEW_TEXT, messageId: PREVIEW_MESSAGE_ID });
  }

  openVoiceInstaller(): Promise<void> {
    return this.engine.openVoiceInstaller();
  }

  setRate(rate: number): void {
    this.put({ rate });
  }

  setPitch(pitch: number): void {
    this.put({ pitch });
  }

  setAutoSpeak(on: boolean): void {
    this.put({ autoSpeak: on });
    if (on) {
      // Check the engine through the memoized setup (it runs again after a failed or unavailable one), not
      // refresh(): refresh's stop() would cut off a message chosen with Speak.
      if (this.engine.isPresent()) this.ensureReady().catch(error => logger.error(`${LOG} engine check failed`, error));
      // Turning reading on asks to hear the chat on screen, also a turn a stop silenced there; a chat the user
      // left stays silent. A stream a stop cut off is dropped, so the reply is read again from its first
      // finished sentence.
      if (this.silencedTurn === useChatStore.getState().activeConversationId) this.silencedTurn = null;
      this.dropStoppedStream();
    } else if (this.session !== null && this.session === this.stream) {
      this.stop(); // off silences a reply read as it streams; a message chosen with Speak plays on
    }
  }

  /**
   * The host calls this with the whole answer so far on every streamed token, from inside a store action:
   * stay synchronous and cheap. Each finished sentence goes to the engine. The last one is held until a
   * later sentence exists, because it may still grow; the rest is read when the next reply starts (endReply)
   * or by onStreamingEnd(), whichever ends this reply first.
   */
  onStreamingToken(cumulative: string): void {
    // A silenced turn opens no session: the speech of a message the user chose to hear keeps playing.
    if (this.silencedTurn !== null || !store().autoSpeak || !this.canSpeak()) return;
    const stream = this.streamFor();
    if (stream.stopped) return;
    this.enqueueStream(stream, stream.takeFinished(cumulative));
  }

  /**
   * The host calls this each time streaming stops for the conversation on screen, once a turn's last round is
   * over. The reply's last sentences are read from the stored message; the next token starts a new session.
   * The signal comes from a screen effect, so it can land after the next turn started: then it is stale.
   */
  onStreamingEnd(conversationId: string): void {
    if (useChatStore.getState().streamingForConversationId === conversationId) return; // streaming again
    const stream = this.stream;
    if (!stream || stream.ended) return;
    if (stream.conversationId !== null && conversationId !== stream.conversationId) return; // another chat's stream is still live
    if (!stream.stopped && store().autoSpeak && this.canSpeak()) this.readRemainder({ stream, conversationId });
    stream.ended = true;
    this.settleStream(stream);
  }

  // ---------------------------------------------------------------------------------------------

  /** The session this token belongs to: the running one, or a new one once the reply before is over. */
  private streamFor(): StreamingSession {
    if (this.stream && !this.stream.ended) return this.stream;
    // The generation bump drops any queued speech of the reply before; what is already playing finishes.
    const stream = new StreamingSession(++this.generation, useChatStore.getState().streamingForConversationId);
    this.stream = stream;
    this.session = stream;
    return stream;
  }

  /**
   * The chat store moved on to the next reply: a new turn, or the next tool round. A round that had text reads
   * its rest from the answer at its last token (no stream end comes for it: the store only empties the text).
   * The next token opens a new session.
   */
  private endReply(input: { stream: StreamingSession; readRest: boolean }): void {
    const { stream, readRest } = input;
    if (stream.ended) return;
    if (readRest && !stream.stopped && store().autoSpeak && this.canSpeak()) this.enqueueRest(stream, stream.answer);
    stream.ended = true;
    this.settleStream(stream);
  }

  /** Forget a stream a stop cut off, so the next token opens a new session instead of continuing it unheard. */
  private dropStoppedStream(): void {
    if (this.stream?.stopped) this.stream = null;
  }

  /** Queue sentences of the streaming reply. They reach the engine once it is set up (right away when it is). */
  private enqueueStream(stream: StreamingSession, sentences: string[]): void {
    if (sentences.length === 0) return;
    stream.queue.push(...sentences);
    if (store().speakingMessageId !== STREAMING_ID || store().phase !== 'speaking') {
      this.put({ speakingMessageId: STREAMING_ID, phase: 'speaking' });
    }
    if (stream.ready) {
      this.flushStream(stream);
    } else if (!stream.starting) {
      stream.starting = true;
      this.ensureReady()
        .then(outcome => this.streamReady({ stream, outcome }))
        .catch(error => logger.error(`${LOG} streaming speech failed`, error));
    }
  }

  private streamReady(input: { stream: StreamingSession; outcome: SetupOutcome }): void {
    const { stream, outcome } = input;
    stream.starting = false;
    if (this.stream !== stream || stream.stopped) {
      stream.queue = []; // a stop or a newer reply got here first and has already reset the state
      return;
    }
    if (outcome !== 'ready') {
      // No engine to read with: give this reply up instead of retrying the engine on every token.
      stream.stopped = true;
      stream.queue = [];
      this.session = null;
      this.clearSpeaking();
      return;
    }
    stream.ready = true;
    this.flushStream(stream);
  }

  /** Hand the queued sentences to the engine in order, cut to the size it accepts. */
  private flushStream(stream: StreamingSession): void {
    const { gen } = stream;
    for (const text of chunkForEngine({ sentences: stream.queue.splice(0), maxLen: this.maxInputLength })) {
      const { rate, pitch } = store();
      const utteranceId = stream.nextUtteranceId();
      this.serialForGen(gen, () => this.engine.speak({ text, utteranceId, rate, pitch }))
        .catch(error => this.speakFailed(gen, error));
    }
    this.settleStream(stream);
  }

  /** Read what the stream left over from the message the host stored, and mark it as read. */
  private readRemainder(input: { stream: StreamingSession; conversationId: string }): void {
    const { stream, conversationId } = input;
    const messages = useChatStore.getState().getConversationMessages(conversationId);
    const message = messages[messages.length - 1];
    if (!isUnreadAnswer(message, { since: stream.startedAt, spoken: this.spokenMessageIds })) return;
    this.enqueueRest(stream, message.content);
    this.spokenMessageIds.add(message.id);
    // Name the stored reply, so its Speak button shows Stop speaking while it is read.
    if (store().speakingMessageId === STREAMING_ID) this.put({ speakingMessageId: message.id });
  }

  /** Queue what of `content`, the reply's whole answer, was not read while it streamed. */
  private enqueueRest(stream: StreamingSession, content: string): void {
    const { rest, aligned } = stream.takeRemainder(content);
    if (!aligned) logger.warn(`${LOG} prefix-mismatch between the streamed and the stored reply`);
    this.enqueueStream(stream, rest);
  }

  /** Once the reply has ended and the engine has finished everything it was given, go back to ready. */
  private settleStream(stream: StreamingSession): void {
    if (!stream.ended || stream.stopped || stream.queue.length > 0 || this.stream !== stream) return;
    stream.total = stream.issued;
    if (stream.issued > 0 && stream.done.size >= stream.total && this.session === stream) this.finish();
  }

  /** Clear the speaking state, keeping a phase the service did not set to 'speaking' (unavailable, error). */
  private clearSpeaking(): void {
    const { speakingMessageId, phase } = store();
    if (speakingMessageId !== null || phase === 'speaking') {
      this.put({ speakingMessageId: null, ...(phase === 'speaking' ? { phase: 'ready' as const } : {}) });
    }
  }

  /** Fire-and-forget refresh(). refresh() reports its outcome through the store, so there is nothing to await. */
  private refreshInBackground(): void {
    this.refresh().catch(error => logger.error(`${LOG} refresh failed`, error));
  }

  private put(partial: SpeechPatch): void {
    store().set(partial);
  }

  /**
   * One strict order for engine calls: a link runs only after the one before it settled, and a rejected
   * link does not break the chain. Without it a speak could overtake the setVoice it depends on.
   */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** A chain link that does nothing when its generation is no longer current. */
  private serialForGen(gen: number, fn: () => Promise<void>): Promise<void> {
    return this.serial(async () => {
      if (gen === this.generation) await fn();
    });
  }

  private ensureReady(): Promise<SetupOutcome> {
    return this.memo ?? this.runSetup();
  }

  /**
   * Run a setup and make it the memo that ensureReady() hands out. The memo is cleared when the run does
   * not end 'ready', so the next call starts over. The setup link is shared by every generation (a stop
   * must not leave later callers with a half-initialised engine); callers check their generation after
   * awaiting it.
   */
  private runSetup(): Promise<SetupOutcome> {
    this.attach();
    const run = this.serial(() => this.setup()).catch(error => this.setupFailed(error));
    this.memo = run;
    run.then(outcome => {
      if (outcome !== 'ready' && this.memo === run) this.memo = null;
    });
    return run;
  }

  private async setup(): Promise<SetupOutcome> {
    const init = await this.engine.init();
    const engineInfo = { available: true, enginePackage: init.enginePackage };
    if (!init.bound) {
      logger.warn(`${LOG} no speech engine is bound`);
      this.put({ ...engineInfo, voices: [], needsVoiceInstall: false, phase: 'unavailable' });
      return 'unavailable';
    }
    this.maxInputLength = init.maxInputLength > 0 ? init.maxInputLength : DEFAULT_MAX_INPUT_LENGTH;

    const voices = (await this.engine.getVoices()).filter(isOfflineVoice);
    const chosen = pickVoice(voices, store().selectedVoiceId);
    if (!chosen || !(await this.engine.setVoice(chosen.id))) {
      logger.warn(`${LOG} no usable offline voice (${voices.length} offline listed)`);
      this.put({ ...engineInfo, voices, needsVoiceInstall: true, phase: 'unavailable' });
      return 'unavailable';
    }
    logger.log(`${LOG} ready engine=${init.enginePackage} voice=${chosen.id} voices=${voices.length}`);
    this.put({ ...engineInfo, voices, needsVoiceInstall: false, phase: this.restingPhase() });
    return 'ready';
  }

  private setupFailed(error: unknown): SetupOutcome {
    if (errorCode(error) === 'INIT_SUPERSEDED') {
      // A newer init() replaced this one and will publish the result. Not an error phase.
      logger.log(`${LOG} init superseded`);
      if (store().phase === 'initializing') this.put({ phase: 'idle' });
      return 'superseded';
    }
    logger.error(`${LOG} setup failed`, error);
    this.put({ phase: 'error' });
    return 'error';
  }

  /** 'speaking' while a message is claimed, else 'ready'. */
  private restingPhase(): SpeechPhase {
    return store().speakingMessageId === null ? 'ready' : 'speaking';
  }

  /** Subscribe to engine events and to AppState once, after the engine is known to be present. */
  private attach(): void {
    if (this.attached || !this.engine.isPresent()) return;
    this.attached = true;
    this.engine.onEvent(event => this.handleEvent(event));
    // Returning from the voice installer: look again for an offline voice.
    AppState.addEventListener('change', state => {
      if (state === 'active' && store().phase === 'unavailable') this.refreshInBackground();
    });
  }

  private handleEvent(event: SpeechEngineEvent): void {
    const { session } = this;
    if (!session || session.gen !== this.generation || generationOf(event.utteranceId) !== session.gen) return;
    switch (event.type) {
      case 'done':
        session.done.add(event.utteranceId);
        if (session.done.size >= session.total) this.finish();
        break;
      case 'stopped':
        this.stop(); // something outside interrupted the speech: drop the rest
        break;
      case 'error':
        logger.warn(`${LOG} utterance error code=${event.code}`);
        this.fail();
        break;
      default:
        break; // 'start': already speaking
    }
  }

  private finish(): void {
    this.session = null;
    this.put({ speakingMessageId: null, phase: 'ready' });
  }

  /** Stop everything, return to 'error' and force the next request to re-initialise the engine. */
  private fail(): void {
    this.stop();
    this.memo = null;
    this.put({ phase: 'error' });
  }

  private speakFailed(gen: number, error: unknown): void {
    if (gen !== this.generation) return; // already stopped or replaced
    if (errorCode(error) === 'NOT_OFFLINE') {
      // The engine refused a voice that is not usable offline. Stop queuing, then look at the voices again.
      logger.warn(`${LOG} engine refused a non-offline voice`);
      this.stop();
      this.refreshInBackground();
      return;
    }
    logger.error(`${LOG} speak failed`, error);
    this.fail();
  }
}

export const speechService = new SpeechService(systemSpeechEngine);
