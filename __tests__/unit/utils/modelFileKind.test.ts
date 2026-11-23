import { isHelperModelFile } from '../../../src/utils/modelFileKind';

describe('isHelperModelFile', () => {
  it.each([
    'mtp-gemma-4-E4B-it-Q8_0.gguf',
    'MTP_model-Q4_K_M.gguf',
    'MTP/mtp-model-Q8_0.gguf',
    'model-imatrix.gguf',
    'Spark-X2.6-4B-imatrix.gguf',
    'Qwen3.5-9B-draft-Q4_0.gguf',
    'draft_model.Q4.gguf',
    'models/Qwen3.5-9B.imatrix.gguf',
  ])('is true for %s', name => {
    expect(isHelperModelFile(name)).toBe(true);
  });

  it.each([
    'Qwen3-MTP-Q4_K_M.gguf',
    'mmproj-F16.gguf',
    'Overdraft-7B-Q4.gguf',
    'Qwen3.5-9B-Q4_K_M.gguf',
    'mtpfoo-Q4.gguf',
    'imatrixed-7B-Q4.gguf',
    'drafts/Qwen3.5-9B-Q4_K_M.gguf',
  ])('is false for %s', name => {
    expect(isHelperModelFile(name)).toBe(false);
  });
});
