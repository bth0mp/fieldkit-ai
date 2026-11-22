/**
 * File sizes in bytes for each recommended text pick, read from each repo's Hugging Face file list on 2026-11-21.
 * They only feed the guide's "Runs well" and "Tight" labels; nothing here is downloaded or checked at load time.
 * usual: the file the app offers first. vision: its picture projector file, 0 when the pick has none.
 * smallest: the smallest model file in the repo.
 */
export interface PickSizes {
  usual: number;
  vision: number;
  smallest: number;
}

export const PICK_SIZES: Record<string, PickSizes> = {
  'unsloth/gemma-4-E2B-it-GGUF': { usual: 3106738272, vision: 985654080, smallest: 2290860128 },
  'unsloth/gemma-4-E4B-it-GGUF': { usual: 4977171584, vision: 990372672, smallest: 3545083008 },
  'unsloth/Qwen3.5-0.8B-GGUF': { usual: 532517120, vision: 204987232, smallest: 338227456 },
  'unsloth/Qwen3.5-2B-GGUF': { usual: 1280835840, vision: 668227264, smallest: 768270592 },
  'unsloth/Qwen3.5-9B-GGUF': { usual: 5680522464, vision: 918166080, smallest: 3190613216 },
  'ggml-org/SmolLM3-3B-GGUF': { usual: 1915305312, vision: 0, smallest: 1915305312 },
  'bartowski/Mistral-7B-Instruct-v0.3-GGUF': { usual: 4372812000, vision: 0, smallest: 1615319264 },
  'ggml-org/SmolVLM2-500M-Video-Instruct-GGUF': { usual: 436808704, vision: 108785184, smallest: 436808704 },
  'QuantFactory/SmolLM2-360M-Instruct-GGUF': { usual: 270590592, vision: 0, smallest: 218673792 },
  'ggml-org/SmolVLM-Instruct-GGUF': { usual: 1112242368, vision: 592521344, smallest: 1112242368 },
  'ggml-org/SmolVLM2-2.2B-Instruct-GGUF': { usual: 1112602656, vision: 592523200, smallest: 1112602656 },
};
