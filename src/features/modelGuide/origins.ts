/**
 * The Hugging Face page of the model each downloadable file was converted from. The repos the app downloads from
 * (xororz/sd-mnn, xororz/sd-qnn, ggerganov/whisper.cpp) report no downloads of their own, so the original maker's
 * page is where numbers and notes come from. Only the maker's own account counts, not a re-upload account. A family
 * page counts when it lists that version.
 */
import type { WHISPER_MODELS } from '../../services/whisperModels';

/** Whisper id (`WHISPER_MODELS[].id`) to `owner/name`. */
export const WHISPER_ORIGINS: Record<(typeof WHISPER_MODELS)[number]['id'], string> = {
  'tiny.en': 'openai/whisper-tiny.en',
  'base.en': 'openai/whisper-base.en',
  'small.en': 'openai/whisper-small.en',
  'medium.en': 'openai/whisper-medium.en',
  tiny: 'openai/whisper-tiny',
  base: 'openai/whisper-base',
  small: 'openai/whisper-small',
  medium: 'openai/whisper-medium',
  'large-v3-turbo': 'openai/whisper-large-v3-turbo',
  'large-v3': 'openai/whisper-large-v3',
};

/** Image name, as the app derives it from the file name, to `owner/name`. */
export const IMAGE_ORIGINS: Record<string, string> = {
  AbsoluteReality: 'Lykon/AbsoluteReality',
  DreamShaperV8: 'Lykon/dreamshaper-8',
  NaiAnimeV2: 'NovelAI/nai-anime-v2',
  NeverEndingDreamV122: 'Lykon/NeverEnding-Dream',
  QteaMix: 'chenxluo/QteaMix',
  counterfeitV30: 'gsdf/Counterfeit-V3.0',
};

/** Image names with no original page, and why. */
export const NO_ORIGIN: Record<string, string> = {
  AnythingV5: 'Only re-uploads on Hugging Face, no page from the maker',
  ChilloutMix: 'Only re-uploads on Hugging Face, no page from the maker',
  'CrossKemono2.5': 'Only empty or unofficial pages on Hugging Face',
  CuteYukiMix: 'Only re-uploads on Hugging Face, no page from the maker',
  DarkSushiV4: 'Only re-uploads on Hugging Face, no page from the maker',
  HyperSpireV5: 'Only a page by the converter, which credits another site',
  MajicmixRealisticV7: 'Only re-uploads on Hugging Face, no page from the maker',
  MeinaMixV12: "The maker's pages stop at V11 and do not list V12",
  MistoonAnimeV3: 'Only re-uploads on Hugging Face, no page from the maker',
  RealisianV6: 'Only re-uploads on Hugging Face, no page from the maker',
  RealisticVisionHyper: "The maker's pages do not list a Hyper version",
  SweetMixV22Flat: 'Only re-uploads on Hugging Face, no page from the maker',
  superinvinciblev2: 'No page on Hugging Face',
  unStableIllusion: 'Only re-uploads on Hugging Face, no page from the maker',
};

export function originFor(kind: 'image' | 'whisper', key: string): string | undefined {
  const table: Record<string, string> = kind === 'image' ? IMAGE_ORIGINS : WHISPER_ORIGINS;
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}
