/**
 * One context-budget policy for generation, conversation compaction and the Max Tokens sliders.
 * Of the context, 55% is for the prompt, 40% for the reply, and the remaining 5% covers chat-template,
 * tool-schema and multimodal overhead.
 */
export const CONTEXT_PROMPT_BUDGET_RATIO = 0.55;
const CONTEXT_OUTPUT_BUDGET_RATIO = 0.40;

const MIN_MAX_TOKENS = 64;
const MAX_MAX_TOKENS = 8192;

/**
 * The most a reply may write: 40% of the context, in steps of 64, up to 8K. Both Max Tokens sliders stop
 * here and generation sends no more than this as n_predict, so the number shown is the number used.
 */
export function maxTokensCeiling(contextLength: number): number {
  const share = Math.min(MAX_MAX_TOKENS, Math.floor(contextLength * CONTEXT_OUTPUT_BUDGET_RATIO));
  return Math.max(MIN_MAX_TOKENS, Math.floor(share / MIN_MAX_TOKENS) * MIN_MAX_TOKENS);
}

/** A saved Max Tokens as the sliders show it: a value above the maximum is shown at the maximum. The saved number is not rewritten. */
export function boundedMaxTokens(saved: number, contextLength: number): number {
  return Math.min(saved, maxTokensCeiling(contextLength));
}
