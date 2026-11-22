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
    expect(url.searchParams.getAll('expand[]')).not.toContain('siblings');
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
      { id: 'a/vlm-GGUF', pipeline_tag: 'image-text-to-text' }, { id: 'a/img-GGUF', pipeline_tag: 'text-to-image' }]);
    const out = await huggingFaceService.browseModels('', { sort: 'trending', maxParamsB: 8 });
    expect(out.map(m => m.id)).toEqual(['a/chat-GGUF', 'a/vlm-GGUF']);
  });

  it('browse asks for ungated models, 100 rows for a ranked sort and 30 per publisher for newest', async () => {
    const hf = installHfApiFake();
    await huggingFaceService.browseModels('', { sort: 'downloads', maxParamsB: 8 });
    await huggingFaceService.browseModels('', { sort: 'newest', maxParamsB: 8 });
    const [ranked, ...publishers] = hf.requests();
    expect(ranked.searchParams.get('gated')).toBe('false');
    expect(ranked.searchParams.get('limit')).toBe('100');
    expect(publishers.length).toBe(NEW_RELEASE_PUBLISHERS.length);
    expect(publishers.every(u => u.searchParams.get('limit') === '30' && u.searchParams.get('gated') === 'false')).toBe(true);
  });

  it('lists leave the card data to the detail request', async () => {
    const hf = installHfApiFake();
    await huggingFaceService.browseModels('', { sort: 'likes', maxParamsB: 8 });
    expect(hf.requests()[0].searchParams.getAll('expand[]')).not.toContain('cardData');
  });

  it('an untagged row is kept only when it is tagged conversational', async () => {
    const hf = installHfApiFake();
    hf.setList(() => [
      { id: 'Serveurperso/YuE2-GGUF', tags: ['gguf', 'music-generation'] },
      { id: 'HauhauCS/Qwen3.5-9B-Uncensored-HauhauCS-Aggressive', tags: ['gguf', 'conversational'] },
    ]);
    const out = await huggingFaceService.browseModels('', { sort: 'trending', maxParamsB: 13 });
    expect(out.map(m => m.id)).toEqual(['HauhauCS/Qwen3.5-9B-Uncensored-HauhauCS-Aggressive']);
  });

  it('browse drops a row whose name states more billions than the phone allows', async () => {
    const hf = installHfApiFake();
    const chat = (id: string) => ({ id, pipeline_tag: 'text-generation' });
    hf.setList(() => [chat('Edge0/Edge0-145B-NVFP4'), chat('cdiamond/Qwen3.8-27B-iMatrix-NVFP4-MTP-GGUF'),
      chat('unsloth/gemma-4-12b-it-GGUF'), chat('LiquidAI/LFM3-1.7B-GGUF'), chat('nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-4GB'),
      chat('a/no-count-GGUF')]);
    const out = await huggingFaceService.browseModels('', { sort: 'downloads', maxParamsB: 13 });
    expect(out.map(m => m.id)).toEqual(['unsloth/gemma-4-12b-it-GGUF', 'LiquidAI/LFM3-1.7B-GGUF',
      'nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-4GB', 'a/no-count-GGUF']);
  });

  it('browse still shows at most 30 after filtering 100 rows', async () => {
    const hf = installHfApiFake();
    hf.setList(() => Array.from({ length: 100 }, (_, i) => ({ id: `a/m${i}-GGUF`, pipeline_tag: 'text-generation' })));
    const out = await huggingFaceService.browseModels('', { sort: 'downloads', maxParamsB: 13 });
    expect(out).toHaveLength(30);
  });

  it('new releases asks each publisher, merges newest first, and survives one failure', async () => {
    const hf = installHfApiFake();
    hf.setList(url => {
      const author = url.searchParams.get('author');
      if (author === 'bartowski') return new Error('boom');
      if (author === 'unsloth') return [{ id: 'unsloth/Old-GGUF', pipeline_tag: 'text-generation', createdAt: '2026-11-01T00:00:00.000Z' }];
      if (author === 'ggml-org') return [{ id: 'ggml-org/New-GGUF', pipeline_tag: 'text-generation', createdAt: '2026-11-20T00:00:00.000Z' }];
      return [];
    });
    const out = await huggingFaceService.browseModels('', { sort: 'newest', maxParamsB: 13 });
    expect(hf.requests().map(u => u.searchParams.get('author')).sort())
      .toEqual(['QuantFactory', 'bartowski', 'ggml-org', 'lmstudio-community', 'unsloth']);
    expect([...NEW_RELEASE_PUBLISHERS].sort()).toEqual(['QuantFactory', 'bartowski', 'ggml-org', 'lmstudio-community', 'unsloth']);
    expect(hf.requests().every(u => u.searchParams.get('sort') === 'createdAt')).toBe(true);
    expect(out.map(m => m.id)).toEqual(['ggml-org/New-GGUF', 'unsloth/Old-GGUF']);
  });

  it('browse drops a row with no model file at the top level', async () => {
    const hf = installHfApiFake();
    const chat = (id: string, siblings?: string[]) => ({ id, pipeline_tag: 'text-generation',
      ...(siblings ? { siblings: siblings.map(rfilename => ({ rfilename })) } : {}) });
    hf.setList(() => [
      chat('peasantsmith/GLM-5.3-Flash-Maya-GGUF', ['DFlash2/GLM-5.3-Flash-DFlash2-Q4_K_M.gguf',
        'Maya-L/GLM-5.3-Flash-Maya-L-IQ3_S-00001-of-00004.gguf', 'README.md']),
      chat('a/only-pictures-GGUF', ['mmproj-F16.gguf']),
      chat('a/good-GGUF', ['README.md', 'good-Q4_K_M.gguf']),
      chat('a/no-siblings-GGUF'),
    ]);
    const out = await huggingFaceService.browseModels('', { sort: 'downloads', maxParamsB: 13 });
    expect(out.map(m => m.id)).toEqual(['a/good-GGUF', 'a/no-siblings-GGUF']);
    expect(out.every(m => m.files.length === 0)).toBe(true);
    expect(hf.requests()[0].searchParams.getAll('expand[]')).toContain('siblings');
  });

  it('new releases drops a row with no model file at the top level', async () => {
    const hf = installHfApiFake();
    hf.setList(url => (url.searchParams.get('author') === 'unsloth' ? [
      { id: 'unsloth/Nested-GGUF', pipeline_tag: 'text-generation', createdAt: '2026-11-02T00:00:00.000Z',
        siblings: [{ rfilename: 'sub/Nested-Q4_K_M.gguf' }] },
      { id: 'unsloth/Good-GGUF', pipeline_tag: 'text-generation', createdAt: '2026-11-01T00:00:00.000Z',
        siblings: [{ rfilename: 'Good-Q4_K_M.gguf' }] },
    ] : []));
    const out = await huggingFaceService.browseModels('', { sort: 'newest', maxParamsB: 13 });
    expect(out.map(m => m.id)).toEqual(['unsloth/Good-GGUF']);
  });

  it('new releases rejects when every publisher fails', async () => {
    const hf = installHfApiFake();
    hf.setList(() => new Error('down'));
    await expect(huggingFaceService.browseModels('', { sort: 'newest', maxParamsB: 8 })).rejects.toThrow();
  });
});
