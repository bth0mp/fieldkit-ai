/**
 * Vision projector naming shapes seen on Hugging Face: the on-disk name keeps only the projector's own
 * precision, the projector pairs for every common shape, and a projector already on the phone under the
 * name older versions gave it is still found for its model.
 */
import { mmProjBelongsToModel, pickMmProjForDownload, pickMmProjForModel } from '../../../src/services/mmproj';
import { mmProjLocalName } from '../../../src/services/modelManager/download';

describe('mmProjLocalName keeps only the projector precision', () => {
  it('drops a model name the repo put after "mmproj" (ggml-org shape)', () => {
    const name = mmProjLocalName('SmolVLM-256M-Instruct-Q8_0.gguf', 'mmproj-SmolVLM-256M-Instruct-f16.gguf');
    expect(name).toBe('smolvlm-256m-instruct-mmproj-f16.gguf');
    expect(mmProjBelongsToModel('SmolVLM-256M-Instruct-Q8_0.gguf', name)).toBe(true);
  });

  it('takes the trailing precision, not a precision-like token inside the model name', () => {
    expect(mmProjLocalName('Foo-Q4_K_M.gguf', 'mmproj-Foo-F16-Instruct-Q8_0.gguf')).toBe('foo-mmproj-Q8_0.gguf');
  });

  it('falls back to a bare name when the source has no precision', () => {
    expect(mmProjLocalName('Foo-Q4_K_M.gguf', 'mmproj-model.gguf')).toBe('foo-mmproj.gguf');
  });
});

describe('pickMmProjForDownload pairs the remaining real-world projector shapes', () => {
  it('the literal mmproj-model-<precision> placeholder is generic to the repo', () => {
    expect(pickMmProjForDownload('gemma-3-4b-it-Q4_K_M.gguf', ['mmproj-model-f16.gguf'])).toBe('mmproj-model-f16.gguf');
    expect(pickMmProjForDownload('ggml-model-Q4_K_M.gguf', ['mmproj-model-f16.gguf'])).toBe('mmproj-model-f16.gguf');
  });

  it('the UD- dynamic-quant packaging does not make a model different from its projector', () => {
    expect(mmProjBelongsToModel(
      'Mistral-Small-3.1-24B-Instruct-2503-UD-IQ2_M.gguf',
      'mmproj-Mistral-Small-3.1-24B-Instruct-2503-Q8_0.gguf',
    )).toBe(true);
  });

  it('moondream text-model weights match the mmproj of the same base', () => {
    expect(mmProjBelongsToModel('moondream2-text-model-f16.gguf', 'moondream2-mmproj-f16.gguf')).toBe(true);
  });

  it('still refuses another variant of the model (E2B is not E4B)', () => {
    expect(pickMmProjForDownload('gemma-4-E2B-it-Q4_K_M.gguf', ['gemma-4-E4B-it-mmproj-F16.gguf'])).toBeUndefined();
  });
});

describe('a projector downloaded under the old name is still found', () => {
  it('old name with the model name repeated after mmproj', () => {
    const oldName = 'smolvlm-256m-instruct-mmproj-SmolVLM-256M-Instruct-f16.gguf';
    expect(mmProjBelongsToModel('SmolVLM-256M-Instruct-Q8_0.gguf', oldName)).toBe(true);
    expect(pickMmProjForModel('SmolVLM-256M-Instruct-Q4_K_M.gguf', [oldName])).toBe(oldName);
  });

  it('old name with the model placeholder', () => {
    const oldName = 'gemma-3-4b-it-mmproj-model-f16.gguf';
    expect(mmProjBelongsToModel('gemma-3-4b-it-Q4_K_M.gguf', oldName)).toBe(true);
  });

  it('is not loosened: another model or variant still does not own it', () => {
    const oldName = 'gemma-4-e2b-it-mmproj-gemma-4-E2B-it-f16.gguf';
    expect(mmProjBelongsToModel('gemma-4-E4B-it-Q4_K_M.gguf', oldName)).toBe(false);
    expect(mmProjBelongsToModel('gemma-4-E2B-it-Q4_K_M.gguf', oldName)).toBe(true);
    expect(pickMmProjForModel('gemma-4-E4B-it-Q4_K_M.gguf', [oldName])).toBeUndefined();
  });
});
