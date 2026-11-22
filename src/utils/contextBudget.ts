/**
 * One context-budget policy for generation, conversation compaction and the Max Tokens sliders.
 * Of the context, 55% is for the prompt, 40% for the reply, and the remaining 5% covers chat-template,
 * tool-schema and multimodal overhead.
 */
export const CONTEXT_PROMPT_BUDGET_RATIO = 0.55;
export const CONTEXT_OUTPUT_BUDGET_RATIO = 0.40;

const MIN_MAX_TOKENS = 64;
const MAX_MAX_TOKENS = 8192;

/** The highest Max Tokens either settings slider offers: the context the reply is written into, up to 8K. */
export function maxTokensSliderMax(contextLength: number): number {
  return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, contextLength));
}

/** A saved Max Tokens as the sliders show it: a value above the maximum is shown at the maximum. The saved number is not rewritten. */
export function boundedMaxTokens(saved: number, contextLength: number): number {
  return Math.min(saved, maxTokensSliderMax(contextLength));
}
