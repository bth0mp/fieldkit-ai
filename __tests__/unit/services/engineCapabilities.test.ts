import { deriveEngineCapabilities } from '../../../src/services/engines';

/**
 * The single capability rule that replaces the ~8 scattered `engine === 'litert'` derivations.
 * These cases ENCODE the exact prior behavior (from useChatModelStateSync / useChatModelActions):
 * remote → declared caps; LiteRT → vision/audio from the model FLAG (shown before load) but
 * tools/thinking only once loaded; llama → all from the loaded engine; nothing loaded → all false.
 * Any drift from these values in a migrated site is a behavior change, not a refactor.
 * supportsToolApproval: can a tool call wait on the user's approval card? LiteRT's native tool loop
 * times a call out, so never there; llama and remote yes; no engine fails closed.
 */
const NO_LLAMA = { loaded: false, vision: false, audio: false, tools: false, thinking: false };

describe('deriveEngineCapabilities — single source for active-model capabilities', () => {
  describe('remote (gateway) model active', () => {
    it('takes vision/tools/thinking from the declared remote caps; audio not tracked', () => {
      const caps = deriveEngineCapabilities({
        isRemote: true,
        remoteCaps: { supportsVision: true, supportsToolCalling: true, supportsThinking: false },
        liteRTLoaded: false,
        llama: NO_LLAMA,
      });
      expect(caps).toEqual({ vision: true, tools: true, thinking: false, audio: false, supportsToolApproval: true });
    });

    it('defaults every remote capability to false when caps are missing', () => {
      const caps = deriveEngineCapabilities({ isRemote: true, remoteCaps: null, liteRTLoaded: false, llama: NO_LLAMA });
      expect(caps).toEqual({ vision: false, tools: false, thinking: false, audio: false, supportsToolApproval: true });
    });
  });

  describe('LiteRT model active', () => {
    it('LOADED: vision/audio from the model flags, tools+thinking true', () => {
      const caps = deriveEngineCapabilities({
        isRemote: false, engine: 'litert', liteRTVision: true, liteRTAudio: true,
        liteRTLoaded: true, llama: NO_LLAMA,
      });
      expect(caps).toEqual({ vision: true, audio: true, tools: true, thinking: true, supportsToolApproval: false });
    });

    it('NOT loaded: vision/audio STILL from the flag (shown before load), but tools/thinking false', () => {
      const caps = deriveEngineCapabilities({
        isRemote: false, engine: 'litert', liteRTVision: true, liteRTAudio: false,
        liteRTLoaded: false, llama: NO_LLAMA,
      });
      expect(caps).toEqual({ vision: true, audio: false, tools: false, thinking: false, supportsToolApproval: false });
    });

    it('non-vision LiteRT model reports no vision', () => {
      const caps = deriveEngineCapabilities({
        isRemote: false, engine: 'litert', liteRTVision: false, liteRTAudio: false,
        liteRTLoaded: true, llama: NO_LLAMA,
      });
      expect(caps).toEqual({ vision: false, audio: false, tools: true, thinking: true, supportsToolApproval: false });
    });

    it('never supports tool approval, loaded or not', () => {
      for (const liteRTLoaded of [true, false]) {
        const caps = deriveEngineCapabilities({ isRemote: false, engine: 'litert', liteRTVision: false, liteRTLoaded, llama: NO_LLAMA });
        expect(caps.supportsToolApproval).toBe(false);
      }
    });
  });

  describe('llama (GGUF) model active', () => {
    it('LOADED: all capabilities come from the live engine', () => {
      const caps = deriveEngineCapabilities({
        isRemote: false, engine: 'llama', liteRTLoaded: false,
        llama: { loaded: true, vision: true, audio: false, tools: true, thinking: true },
      });
      expect(caps).toEqual({ vision: true, audio: false, tools: true, thinking: true, supportsToolApproval: true });
    });

    it('NOT loaded: every capability is false (nothing to report yet)', () => {
      const caps = deriveEngineCapabilities({
        isRemote: false, engine: 'llama', liteRTLoaded: false,
        llama: { loaded: false, vision: true, audio: true, tools: true, thinking: true },
      });
      expect(caps).toEqual({ vision: false, audio: false, tools: false, thinking: false, supportsToolApproval: true });
    });
  });

  it('no active model → all false', () => {
    const caps = deriveEngineCapabilities({ isRemote: false, engine: undefined, liteRTLoaded: false, llama: NO_LLAMA });
    expect(caps).toEqual({ vision: false, audio: false, tools: false, thinking: false, supportsToolApproval: false });
  });

  it('remote takes precedence over a resident local engine', () => {
    const caps = deriveEngineCapabilities({
      isRemote: true, remoteCaps: { supportsVision: false, supportsToolCalling: true, supportsThinking: true },
      engine: 'litert', liteRTVision: true, liteRTLoaded: true,
      llama: { loaded: true, vision: true, audio: true, tools: true, thinking: true },
    });
    expect(caps).toEqual({ vision: false, tools: true, thinking: true, audio: false, supportsToolApproval: true });
  });
});
