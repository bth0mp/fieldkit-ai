import { RECOMMENDED_MODELS } from '../../../../src/constants/models';
import { WHISPER_MODELS } from '../../../../src/services/whisperModels';
import { CURATED_LITERT_ENTRIES } from '../../../../src/services/curatedLiteRTRegistry';
import {
  IMAGE_BACKEND_NOTES,
  IMAGE_NOTES,
  NO_NOTE,
  PHONE_TIERS,
  PHONE_TIPS,
  TEXT_NOTES,
  WHISPER_NOTES,
  LITERT_NOTES,
  noteFor,
  ModelNote,
} from '../../../../src/features/modelGuide/notes';

const EMOJI = /\p{Extended_Pictographic}/u;
const BANNED = /off\s?grid|wednesday/i;

function expectCovered(ids: string[], notes: Record<string, ModelNote>) {
  for (const id of ids) {
    expect(Boolean(notes[id]) || Boolean(NO_NOTE[id])).toBe(true);
  }
}

describe('model notes', () => {
  it('covers every text, whisper and LiteRT model or says why not', () => {
    expectCovered(RECOMMENDED_MODELS.map(m => m.id), TEXT_NOTES);
    expectCovered(WHISPER_MODELS.map(m => m.id), WHISPER_NOTES);
    expectCovered(CURATED_LITERT_ENTRIES.map(e => e.fileName), LITERT_NOTES);
  });

  it('keeps every note short, plain and sourced from Hugging Face', () => {
    const all: ModelNote[] = [
      ...Object.values(TEXT_NOTES),
      ...Object.values(WHISPER_NOTES),
      ...Object.values(LITERT_NOTES),
      ...IMAGE_NOTES,
    ];
    for (const note of all) {
      expect(note.source).toMatch(/^https:\/\/huggingface\.co\//);
      for (const text of [note.goodFor, note.notFor]) {
        expect(text.length).toBeGreaterThanOrEqual(1);
        expect(text.length).toBeLessThanOrEqual(70);
        expect(text).not.toMatch(EMOJI);
        expect(text).not.toMatch(BANNED);
      }
    }
    for (const text of [...Object.values(IMAGE_BACKEND_NOTES), ...PHONE_TIPS]) {
      expect(text).not.toMatch(EMOJI);
      expect(text).not.toMatch(BANNED);
    }
  });

  it('finds a note by id across text, whisper and LiteRT', () => {
    expect(noteFor('unsloth/Qwen3.5-2B-GGUF')).toBe(TEXT_NOTES['unsloth/Qwen3.5-2B-GGUF']);
    expect(noteFor('small.en')).toBe(WHISPER_NOTES['small.en']);
    expect(noteFor('gemma-4-E2B-it.litertlm')).toBe(LITERT_NOTES['gemma-4-E2B-it.litertlm']);
    expect(noteFor('no-such-model')).toBeUndefined();
  });

  it('words the picture models, Qwen 3.5 2B and SmolLM2 notes as reviewed, and promises no video', () => {
    for (const id of ['ggml-org/SmolVLM2-500M-Video-Instruct-GGUF', 'ggml-org/SmolVLM-Instruct-GGUF', 'ggml-org/SmolVLM2-2.2B-Instruct-GGUF']) {
      expect(TEXT_NOTES[id].notFor).toBe('Making pictures, or languages other than English');
    }
    expect(TEXT_NOTES['unsloth/Qwen3.5-2B-GGUF'].goodFor).toBe('Chat in over 200 languages, on phones with little memory');
    expect(TEXT_NOTES['QuantFactory/SmolLM2-360M-Instruct-GGUF'].goodFor).toBe('Rewriting and summarizing text on phones with little memory');
    const description = (id: string) => RECOMMENDED_MODELS.find(m => m.id === id)?.description;
    expect(description('ggml-org/SmolVLM2-500M-Video-Instruct-GGUF')).toBe('Tiny vision model for constrained devices');
    expect(description('ggml-org/SmolVLM2-2.2B-Instruct-GGUF')).toBe('Vision understanding');
  });

  it('gives image notes a size', () => {
    for (const note of IMAGE_NOTES) expect(note.sizeBytes).toBeGreaterThan(0);
  });

  it('lists phone tiers 4, 6, 8, 12, 16 with one spec page per phone', () => {
    expect(PHONE_TIERS.map(t => t.gb)).toEqual([4, 6, 8, 12, 16]);
    for (const tier of PHONE_TIERS) {
      expect(tier.examples.length).toBeLessThanOrEqual(3);
      expect(tier.examples.length).toBe(tier.sources.length);
      for (const url of tier.sources) expect(url).toMatch(/^https:\/\//);
    }
    expect(PHONE_TIERS.find(t => t.gb === 12)?.examples.join(' ')).toContain('Galaxy S24 Ultra');
  });
});
