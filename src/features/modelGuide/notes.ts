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

const GEMMA_NOT = 'Open-ended or highly complex tasks';

export const TEXT_NOTES: Record<string, ModelNote> = {
  'unsloth/gemma-4-E2B-it-GGUF': {
    goodFor: 'Chat, summaries, pictures and audio on a phone',
    notFor: GEMMA_NOT,
    source: `${HF}google/gemma-4-E2B-it`,
  },
  'unsloth/gemma-4-E4B-it-GGUF': {
    goodFor: 'Chat, summaries, pictures and audio; 4.5B effective',
    notFor: GEMMA_NOT,
    source: `${HF}google/gemma-4-E4B-it`,
  },
  'unsloth/Qwen3.5-0.8B-GGUF': {
    goodFor: 'Prototyping and task fine-tuning; 201 languages',
    notFor: 'Thinking mode; it can loop and not finish',
    source: `${HF}Qwen/Qwen3.5-0.8B`,
  },
  'unsloth/Qwen3.5-2B-GGUF': {
    goodFor: 'Prototyping and task fine-tuning; 201 languages',
    notFor: 'Thinking mode; it can loop and not finish',
    source: `${HF}Qwen/Qwen3.5-2B`,
  },
  'unsloth/Qwen3.5-9B-GGUF': {
    goodFor: 'Tool calling and agent tasks in 201 languages',
    notFor: 'Phones with less than 8 GB of memory',
    source: `${HF}Qwen/Qwen3.5-9B`,
  },
  'ggml-org/SmolLM3-3B-GGUF': {
    goodFor: 'Chat and tool calling in six languages',
    notFor: 'Pictures or audio; text only',
    source: `${HF}HuggingFaceTB/SmolLM3-3B`,
  },
  'bartowski/Mistral-7B-Instruct-v0.3-GGUF': {
    goodFor: 'Chat and function calling',
    notFor: 'Moderated output; it has no moderation built in',
    source: `${HF}mistralai/Mistral-7B-Instruct-v0.3`,
  },
  'ggml-org/SmolVLM2-500M-Video-Instruct-GGUF': {
    goodFor: 'Questions about images and video; 0.5B parameters',
    notFor: 'Making images or video; English only',
    source: `${HF}HuggingFaceTB/SmolVLM2-500M-Video-Instruct`,
  },
  'QuantFactory/SmolLM2-360M-Instruct-GGUF': {
    goodFor: 'Rewriting and summarizing text on small phones',
    notFor: 'Function calling; it mostly handles English',
    source: `${HF}HuggingFaceTB/SmolLM2-360M-Instruct`,
  },
  'ggml-org/SmolVLM-Instruct-GGUF': {
    goodFor: 'Tasks that mix images and text',
    notFor: 'Making images; English only',
    source: `${HF}HuggingFaceTB/SmolVLM-Instruct`,
  },
  'ggml-org/SmolVLM2-2.2B-Instruct-GGUF': {
    goodFor: 'Captions and questions about images and video',
    notFor: 'Making images or video; English only',
    source: `${HF}HuggingFaceTB/SmolVLM2-2.2B-Instruct`,
  },
};

/** Every Whisper card lists all the sizes in one table, so the tiny card is the source for the four small sizes. */
const WHISPER_TABLE = `${HF}openai/whisper-tiny`;
const WHISPER_HALLUCINATES = 'It can add words that were not spoken';
const WHISPER_RARE = 'Rarer languages; accuracy is lower there';
const whisperEn = (params: string): ModelNote => ({
  goodFor: `Transcribing English speech; ${params} parameters`,
  notFor: 'Other languages; this one is English only',
  source: WHISPER_TABLE,
});
const whisperMulti = (params: string): ModelNote => ({
  goodFor: `Transcribing and translating speech; ${params} parameters`,
  notFor: WHISPER_RARE,
  source: WHISPER_TABLE,
});

export const WHISPER_NOTES: Record<string, ModelNote> = {
  'tiny.en': whisperEn('39M'),
  'base.en': whisperEn('74M'),
  'small.en': whisperEn('244M'),
  'medium.en': whisperEn('769M'),
  tiny: whisperMulti('39M'),
  base: whisperMulti('74M'),
  small: whisperMulti('244M'),
  medium: whisperMulti('769M'),
  'large-v3-turbo': {
    goodFor: 'Large-v3 with fewer decoding layers; a bit lower quality',
    notFor: 'Real-time use out of the box',
    source: `${HF}openai/whisper-large-v3-turbo`,
  },
  'large-v3': {
    goodFor: 'Transcribing speech in 99 languages; 1550M parameters',
    notFor: WHISPER_HALLUCINATES,
    source: `${HF}openai/whisper-large-v3`,
  },
};

export const LITERT_NOTES: Record<string, ModelNote> = {
  'gemma-4-E2B-it.litertlm': {
    goodFor: 'Private chat on the phone, with GPU support',
    notFor: 'Chats longer than 32K tokens',
    source: `${HF}litert-community/gemma-4-E2B-it-litert-lm`,
  },
  'gemma-4-E4B-it.litertlm': {
    goodFor: 'Private chat on the phone, with GPU support',
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
