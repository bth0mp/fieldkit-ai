import { huggingFaceService, NEW_RELEASE_PUBLISHERS, type BrowseSort } from '../../../src/services/huggingface';
import { installHfApiFake } from '../../harness/hfApiFake';

describe('huggingFaceService browse and stats fields', () => {
  it('asks for every field the card shows, on lists and on details', async () => {
    const hf = installHfApiFake();
    hf.setList(() => [{ id: 'unsloth/Qwen3.5-2B-GGUF', author: 'unsloth', downloads: 547232, downloadsAllTime: 2572970,
      likes: 180, lastModified: '2026-03-02T14:07:35.000Z', createdAt: '2026-02-28T10:00:00.000Z', tags: ['gguf'], pipeline_tag: 'image-text-to-text' }]);
    const [m] = await huggingFaceService.searchModels('qwen');
    const url = hf.requests()[0];
    expect(url.searchParams.getAll('expand[]')).toEqual(expect.arrayContaining(
      ['author', 'downloads', 'downloadsAllTime', 'likes', 'lastModified', 'createdAt', 'tags', 'pipeline_tag']));
    expect(url.searchParams.getAll('expand[]')).not.toContain('gguf');
    expect(m).toMatchObject({ downloads: 547232, downloadsAllTime: 2572970, likes: 180,
      lastModified: '2026-03-02T14:07:35.000Z', createdAt: '2026-02-28T10:00:00.000Z', pipelineTag: 'image-text-to-text' });
  });

  it('getModelDetails expands downloadsAllTime and still returns the gguf files', async () => {
    const hf = installHfApiFake();
    hf.setDetails({ 'unsloth/Qwen3.5-2B-GGUF': { id: 'unsloth/Qwen3.5-2B-GGUF', downloads: 1, downloadsAllTime: 9,
      siblings: [{ rfilename: 'Qwen3.5-2B-Q4_K_M.gguf' }] } });
    const m = await huggingFaceService.getModelDetails('unsloth/Qwen3.5-2B-GGUF');
    expect(hf.requests()[0].searchParams.getAll('expand[]')).toEqual(expect.arrayContaining(['downloadsAllTime', 'siblings', 'cardData']));
    expect(m.downloadsAllTime).toBe(9);
    expect(m.files.map(f => f.name)).toEqual(['Qwen3.5-2B-Q4_K_M.gguf']);
  });

  it.each([['trending', 'trendingScore'], ['downloads', 'downloads'], ['likes', 'likes']] as ReadonlyArray<readonly [BrowseSort, string]>)(
    'browse %s sorts on Hugging Face with the size limit', async (sort, hfSort) => {
      const hf = installHfApiFake();
      await huggingFaceService.browseModels('qwen', { sort, maxParamsB: 13 });
      const url = hf.requests()[0];
      expect(url.searchParams.get('sort')).toBe(hfSort);
      expect(url.searchParams.get('direction')).toBe('-1');
      expect(url.searchParams.get('num_parameters')).toBe('min:0,max:13B');
      expect(url.searchParams.get('search')).toBe('qwen');
      expect(url.searchParams.get('filter')).toBe('gguf');
    });

  it('browse keeps chat and vision models and drops other pipelines', async () => {
    const hf = installHfApiFake();
    hf.setList(() => [{ id: 'a/tts-GGUF', pipeline_tag: 'text-to-speech' }, { id: 'a/chat-GGUF', pipeline_tag: 'text-generation' },
      { id: 'a/vlm-GGUF', pipeline_tag: 'image-text-to-text' }, { id: 'a/untagged-GGUF' }, { id: 'a/img-GGUF', pipeline_tag: 'text-to-image' }]);
    const out = await huggingFaceService.browseModels('', { sort: 'trending', maxParamsB: 8 });
    expect(out.map(m => m.id)).toEqual(['a/chat-GGUF', 'a/vlm-GGUF', 'a/untagged-GGUF']);
  });

  it('new releases asks each publisher, merges newest first, and survives one failure', async () => {
    const hf = installHfApiFake();
    hf.setList(url => {
      const author = url.searchParams.get('author');
      if (author === 'bartowski') return new Error('boom');
      if (author === 'unsloth') return [{ id: 'unsloth/Old-GGUF', createdAt: '2026-11-01T00:00:00.000Z' }];
      if (author === 'ggml-org') return [{ id: 'ggml-org/New-GGUF', createdAt: '2026-11-20T00:00:00.000Z' }];
      return [];
    });
    const out = await huggingFaceService.browseModels('', { sort: 'newest', maxParamsB: 13 });
    expect(hf.requests().map(u => u.searchParams.get('author')).sort())
      .toEqual(['QuantFactory', 'bartowski', 'ggml-org', 'lmstudio-community', 'unsloth']);
    expect([...NEW_RELEASE_PUBLISHERS].sort()).toEqual(['QuantFactory', 'bartowski', 'ggml-org', 'lmstudio-community', 'unsloth']);
    expect(hf.requests().every(u => u.searchParams.get('sort') === 'createdAt')).toBe(true);
    expect(out.map(m => m.id)).toEqual(['ggml-org/New-GGUF', 'unsloth/Old-GGUF']);
  });

  it('new releases rejects when every publisher fails', async () => {
    const hf = installHfApiFake();
    hf.setList(() => new Error('down'));
    await expect(huggingFaceService.browseModels('', { sort: 'newest', maxParamsB: 8 })).rejects.toThrow();
  });
});
