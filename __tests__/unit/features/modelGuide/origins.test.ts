import { WHISPER_MODELS } from '../../../../src/services/whisperModels';
import { IMAGE_NOTES } from '../../../../src/features/modelGuide/notes';
import {
  IMAGE_ORIGINS,
  NO_ORIGIN,
  WHISPER_ORIGINS,
  originFor,
} from '../../../../src/features/modelGuide/origins';

/** The names the app derives from the file lists of xororz/sd-qnn and xororz/sd-mnn. */
const IMAGE_NAMES = [
  'AbsoluteReality', 'AnythingV5', 'ChilloutMix', 'CrossKemono2.5', 'CuteYukiMix', 'DarkSushiV4', 'DreamShaperV8',
  'HyperSpireV5', 'MajicmixRealisticV7', 'MeinaMixV12', 'MistoonAnimeV3', 'NaiAnimeV2', 'NeverEndingDreamV122',
  'QteaMix', 'RealisianV6', 'RealisticVisionHyper', 'SweetMixV22Flat', 'counterfeitV30', 'superinvinciblev2',
  'unStableIllusion',
];
const OWNER_NAME = /^[\w.-]+\/[\w.-]+$/;

describe('original pages', () => {
  it('maps every Whisper model to its openai page', () => {
    for (const { id } of WHISPER_MODELS) expect(WHISPER_ORIGINS[id]).toBe(`openai/whisper-${id}`);
  });

  it('puts each image name in exactly one of IMAGE_ORIGINS or NO_ORIGIN', () => {
    for (const name of IMAGE_NAMES) {
      expect([name in IMAGE_ORIGINS, name in NO_ORIGIN].filter(Boolean)).toHaveLength(1);
    }
    expect(Object.keys({ ...IMAGE_ORIGINS, ...NO_ORIGIN }).sort()).toEqual([...IMAGE_NAMES].sort());
  });

  it('writes every origin as owner/name', () => {
    for (const value of [...Object.values(IMAGE_ORIGINS), ...Object.values(WHISPER_ORIGINS)]) {
      expect(value).toMatch(OWNER_NAME);
    }
  });

  it('gives every missing origin a short reason', () => {
    for (const reason of Object.values(NO_ORIGIN)) {
      expect(reason.length).toBeGreaterThanOrEqual(1);
      expect(reason.length).toBeLessThanOrEqual(120);
    }
  });

  it('sources every image note from its original page', () => {
    for (const note of IMAGE_NOTES) {
      expect(IMAGE_ORIGINS[note.name]).toBeDefined();
      expect(note.source).toBe(`https://huggingface.co/${IMAGE_ORIGINS[note.name]}`);
    }
  });

  it('looks an origin up by kind and key', () => {
    expect(originFor('whisper', 'tiny')).toBe('openai/whisper-tiny');
    expect(originFor('image', 'no-such')).toBeUndefined();
  });
});
