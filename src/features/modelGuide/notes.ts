/**
 * Hand-written notes for the "Which model?" guide: one "Good for" and one "Not for" phrase per model, and the phone
 * memory tiers. The wording is ours. A line goes in only as far as the source page prints it: each model's note
 * names the Hugging Face model card it was read from (the base model's card where the repo is a quantizer's), and
 * each phone names the maker's spec page that lists its memory. A model with no honest note is left out, with the
 * reason in NO_NOTE or a comment. No speeds and no benchmark claims.
 */
import type { MemoryTier } from './guide';

export interface ModelNote {
  goodFor: string;
  notFor: string;
  /** The Hugging Face page the note was read from. Not shown to the user. */
  source: string;
}

export interface ImageModelNote extends ModelNote {
  /** Matches the `name` the app derives from the file name. */
  name: string;
  sizeBytes: number;
}

export interface PhoneTier {
  gb: MemoryTier;
  examples: string[];
  /** The maker's spec page for each example, in the same order. */
  sources: string[];
}

/** Ids with no honest note, and why. Empty while every id has one. */
export const NO_NOTE: Record<string, string> = {};

const HF = 'https://huggingface.co/';

const GEMMA_NOT = 'Open-ended or very complex tasks';

export const TEXT_NOTES: Record<string, ModelNote> = {
  'unsloth/gemma-4-E2B-it-GGUF': {
    goodFor: 'Chat, summaries, and questions about pictures or speech',
    notFor: GEMMA_NOT,
    source: `${HF}google/gemma-4-E2B-it`,
  },
  'unsloth/gemma-4-E4B-it-GGUF': {
    goodFor: 'Chat, summaries, pictures and speech; bigger than E2B',
    notFor: GEMMA_NOT,
    source: `${HF}google/gemma-4-E4B-it`,
  },
  'unsloth/Qwen3.5-0.8B-GGUF': {
    goodFor: 'Short chats and quick questions on phones with little memory',
    notFor: 'Leave Thinking off; it can loop and not finish',
    source: `${HF}Qwen/Qwen3.5-0.8B`,
  },
  'unsloth/Qwen3.5-2B-GGUF': {
    goodFor: 'Chat and questions in over 200 languages, on small phones',
    notFor: 'Leave Thinking off; it can loop and not finish',
    source: `${HF}Qwen/Qwen3.5-2B`,
  },
  'unsloth/Qwen3.5-9B-GGUF': {
    goodFor: 'Chat and questions in over 200 languages; the biggest Qwen',
    notFor: 'Phones with less than 8 GB of memory',
    source: `${HF}Qwen/Qwen3.5-9B`,
  },
  'ggml-org/SmolLM3-3B-GGUF': {
    goodFor: 'Chat and questions in six European languages',
    notFor: 'Pictures or audio; it only reads and writes text',
    source: `${HF}HuggingFaceTB/SmolLM3-3B`,
  },
  'bartowski/Mistral-7B-Instruct-v0.3-GGUF': {
    goodFor: 'Everyday chat and quick questions',
    notFor: 'Blocking unsafe replies; it has no filter built in',
    source: `${HF}mistralai/Mistral-7B-Instruct-v0.3`,
  },
  'ggml-org/SmolVLM2-500M-Video-Instruct-GGUF': {
    goodFor: 'Answering questions about photos and video; very small',
    notFor: 'Making pictures or video; English only',
    source: `${HF}HuggingFaceTB/SmolVLM2-500M-Video-Instruct`,
  },
  'QuantFactory/SmolLM2-360M-Instruct-GGUF': {
    goodFor: 'Rewriting and summarizing text on small phones',
    notFor: 'Other languages; it mostly handles English',
    source: `${HF}HuggingFaceTB/SmolLM2-360M-Instruct`,
  },
  'ggml-org/SmolVLM-Instruct-GGUF': {
    goodFor: 'Answering questions about photos',
    notFor: 'Making pictures; English only',
    source: `${HF}HuggingFaceTB/SmolVLM-Instruct`,
  },
  'ggml-org/SmolVLM2-2.2B-Instruct-GGUF': {
    goodFor: 'Describing photos and video, and answering questions',
    notFor: 'Making pictures or video; English only',
    source: `${HF}HuggingFaceTB/SmolVLM2-2.2B-Instruct`,
  },
};

/** Every Whisper card lists all the sizes in one table, so the tiny card is the source for the four small sizes. */
const WHISPER_TABLE = `${HF}openai/whisper-tiny`;
const WHISPER_RARE = 'Rarer languages; accuracy is lower there';
const whisperEn = (size: string): ModelNote => ({
  goodFor: `English speech to text; ${size}`,
  notFor: 'Other languages; this one is English only',
  source: WHISPER_TABLE,
});
const whisperMulti = (size: string): ModelNote => ({
  goodFor: `Speech to text in many languages; ${size}`,
  notFor: WHISPER_RARE,
  source: WHISPER_TABLE,
});

export const WHISPER_NOTES: Record<string, ModelNote> = {
  'tiny.en': whisperEn('the smallest Whisper'),
  'base.en': whisperEn('bigger than Tiny'),
  'small.en': whisperEn('bigger than Base'),
  'medium.en': whisperEn('bigger than Small'),
  tiny: whisperMulti('the smallest Whisper'),
  base: whisperMulti('bigger than Tiny'),
  small: whisperMulti('bigger than Base'),
  medium: whisperMulti('bigger than Small'),
  'large-v3-turbo': {
    goodFor: 'Speech to text in 99 languages; faster than Large v3',
    notFor: 'Live transcription as you speak',
    source: `${HF}openai/whisper-large-v3-turbo`,
  },
  'large-v3': {
    goodFor: 'Speech to text in 99 languages; the biggest Whisper',
    notFor: 'It can add words that were not spoken',
    source: `${HF}openai/whisper-large-v3`,
  },
};

export const LITERT_NOTES: Record<string, ModelNote> = {
  'gemma-4-E2B-it.litertlm': {
    goodFor: 'Private chat on the phone, using its graphics chip',
    notFor: 'Phones short on memory; the file is about 2.6 GB',
    source: `${HF}litert-community/gemma-4-E2B-it-litert-lm`,
  },
  'gemma-4-E4B-it.litertlm': {
    goodFor: 'Private chat on the phone; bigger than E2B',
    notFor: 'Phones short on memory; the file is 3.66 GB',
    source: `${HF}litert-community/gemma-4-E4B-it-litert-lm`,
  },
};

/**
 * The xororz/sd-mnn repo has no model card, and the Hugging Face pages found for these checkpoints are re-uploads
 * that do not describe the file the app downloads. No image model has an honest "Good for" line, so none is listed.
 * The shape is kept so a model can be added once a page supports it.
 */
export const IMAGE_NOTES: ImageModelNote[] = [];

export const IMAGE_BACKEND_NOTES: { mnn: string; qnn: string } = {
  mnn: 'Works on any phone. It does not need a Snapdragon NPU.',
  qnn: 'Uses the Snapdragon NPU. Needs a Snapdragon with Hexagon V68 or newer.',
};

const SAMSUNG = 'https://www.samsung.com/uk/smartphones/';
const PIXEL = 'https://store.google.com/product/';

export const PHONE_TIERS: PhoneTier[] = [
  {
    gb: 4,
    examples: ['Samsung Galaxy A17 5G', 'Samsung Galaxy A18 4G'],
    sources: [
      `${SAMSUNG}galaxy-a/galaxy-a17-5g-black-128gb-sm-a176bzkaeub/`,
      `${SAMSUNG}galaxy-a/galaxy-a18-black-128gb-sm-a185fzkdeub/`,
    ],
  },
  {
    gb: 6,
    examples: ['Samsung Galaxy A27 5G'],
    sources: [`${SAMSUNG}galaxy-a/galaxy-a27-5g-black-128gb-sm-a276bzkbeub/`],
  },
  {
    gb: 8,
    examples: ['Google Pixel 9a', 'Samsung Galaxy A56 5G', 'Samsung Galaxy A57 5G'],
    sources: [
      `${PIXEL}pixel_9a_specs`,
      `${SAMSUNG}galaxy-a/galaxy-a56-5g-awesome-lightgrey-256gb-sm-a566bzaceub/`,
      `${SAMSUNG}galaxy-a/galaxy-a57-5g-awesome-navy-256gb-sm-a576bdbdeub/`,
    ],
  },
  {
    gb: 12,
    examples: ['Samsung Galaxy S24 Ultra', 'Samsung Galaxy S25 Ultra', 'Google Pixel 10'],
    sources: [
      `${SAMSUNG}galaxy-s24-ultra/specs/`,
      `${SAMSUNG}galaxy-s25-ultra/specs/`,
      `${PIXEL}pixel_10_specs`,
    ],
  },
  {
    gb: 16,
    examples: ['Google Pixel 10 Pro'],
    sources: [`${PIXEL}pixel_10_pro_specs`],
  },
];

export const PHONE_TIPS: string[] = [
  'Keep the phone plugged in and cool for long jobs.',
  'Close other apps first so the model has more memory.',
  'For pictures, a phone with a Snapdragon NPU can use the NPU models.',
];

export function noteFor(id: string): ModelNote | undefined {
  return TEXT_NOTES[id] ?? WHISPER_NOTES[id] ?? LITERT_NOTES[id];
}
