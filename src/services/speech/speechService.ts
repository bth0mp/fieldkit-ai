import { AppState } from 'react-native';
import { useSpeechStore, type SpeechPatch } from '../../stores/speechStore';
import { prepareMessageForSpeech } from '../../utils/messageContent';
import { chunkForEngine, splitIntoSentences } from '../../utils/speechText';
import logger from '../../utils/logger';
import { systemSpeechEngine } from './systemSpeechEngine';
import type { SpeechEngine, SpeechEngineEvent, SpeechPhase, SpeechVoice } from './speechTypes';

const LOG = '[SPEECH-SM]';
const DEFAULT_MAX_INPUT_LENGTH = 4000;
const PREVIEW_MESSAGE_ID = 'voice-preview';
const PREVIEW_TEXT = 'This is how your replies will sound.';

/** How a setup run (init, voice list, voice selection) ended. 'superseded' = a newer init replaced it. */
type SetupOutcome = 'ready' | 'unavailable' | 'error' | 'superseded';

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

/** The selected voice if it is still available, else the highest quality one (first wins a tie). */
function pickVoice(voices: SpeechVoice[], selectedId: string | null): SpeechVoice | undefined {
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
  private memo: Promise<SetupOutcome> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private maxInputLength = DEFAULT_MAX_INPUT_LENGTH;
  private attached = false;

  constructor(private readonly engine: SpeechEngine) {}

  /** Cached and synchronous: the engine exists and is not known to lack an offline voice. */
  canSpeak(): boolean {
    return this.engine.isPresent() && store().phase !== 'unavailable';
  }

  async speakMessage(input: { text: string; messageId: string }): Promise<void> {
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
      sentences: splitIntoSentences(prepareMessageForSpeech(input.text)),
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

  /** Synchronous, idempotent and always runs: silence the engine and drop everything pending. */
  stop(): void {
    this.generation++;
    this.session = null;
    const { speakingMessageId, phase } = store();
    if (speakingMessageId !== null || phase === 'speaking') {
      this.put({ speakingMessageId: null, ...(phase === 'speaking' ? { phase: 'ready' as const } : {}) });
    }
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
    if (on) this.refreshInBackground();
  }

  // ---------------------------------------------------------------------------------------------

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
