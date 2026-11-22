import {
  MemoryTier,
  MEMORY_TIERS,
  memoryTierGB,
  maxParamsForTier,
  textPickFit,
  fileFitsTier,
  smallestFittingTier,
  autoLabels,
  formatUpdatedAgo,
} from '../../../../src/features/modelGuide/guide';

const GB = 1024 ** 3;

describe('model guide helpers', () => {
  it.each([[0, 4], [3, 4], [4, 4], [5.5, 6], [7.3, 8], [8, 8], [10.82, 12], [12, 12], [14.5, 16], [16, 16], [23, 16]])(
    'memoryTierGB(%p) = %p', (gb, tier) => expect(memoryTierGB(gb)).toBe(tier));

  it('lists the five tiers in order', () => {
    expect(MEMORY_TIERS).toEqual([4, 6, 8, 12, 16]);
  });

  it.each([[4, 3], [6, 4], [8, 8], [12, 13], [16, 30]] as const)(
    'maxParamsForTier(%p) = %p', (t, p) => expect(maxParamsForTier(t)).toBe(p));

  it('text pick fit', () => {
    const smol = { minRam: 3, maxRam: 6 }, e4b = { minRam: 6 }, q9 = { minRam: 8 };
    expect([4, 6, 8].map(t => textPickFit(smol, t as MemoryTier))).toEqual(['runs-well', 'runs-well', null]);
    expect([4, 6, 12].map(t => textPickFit(e4b, t as MemoryTier))).toEqual([null, 'tight', 'runs-well']);
    expect([6, 8, 12].map(t => textPickFit(q9, t as MemoryTier))).toEqual([null, 'tight', 'runs-well']);
  });

  it('file fit uses the load budget at 90% of the tier', () => {
    expect(fileFitsTier(1.5 * GB, 4)).toBe(true);
    expect(fileFitsTier(2 * GB, 4)).toBe(false);
    expect(fileFitsTier(5 * GB, 8)).toBe(false);
    expect(fileFitsTier(5 * GB, 12)).toBe(true);
    expect(smallestFittingTier(2 * GB)).toBe(6);
    expect(smallestFittingTier(40 * GB)).toBeNull();
  });

  it('labels', () => {
    expect(autoLabels({ name: 'Qwen2.5-Coder-1.5B-Instruct-GGUF', tags: ['gguf'], paramCount: 1.5 })).toEqual(['Coding', 'Small, fast']);
    expect(autoLabels({ name: 'gemma-4-E4B-it-GGUF', pipelineTag: 'image-text-to-text', paramCount: 4 })).toEqual(['Vision']);
    expect(autoLabels({ name: 'Llama-3.2-1B-Instruct-GGUF', paramCount: 1 })).toEqual(['Small, fast']);
    expect(autoLabels({ name: 'SmolVLM-256M', tags: ['code'], pipelineTag: 'image-text-to-text', paramCount: 0.256 })).toEqual(['Vision', 'Coding']);
    expect(autoLabels({ name: 'encoder-3B-GGUF', paramCount: 3 })).toEqual([]);
    expect(autoLabels({ name: 'CodeLlama-7B-GGUF' })).toEqual(['Coding']);
  });

  it('labels names in millions as small, but not a billions name that mentions a million', () => {
    expect(autoLabels({ name: 'SmolLM2-360M-Instruct-GGUF' })).toEqual(['Small, fast']);
    expect(autoLabels({ name: 'gemma-3-270m-it-GGUF' })).toEqual(['Small, fast']);
    expect(autoLabels({ name: 'Foo-9B-Context-1M-GGUF' })).toEqual([]);
    expect(autoLabels({ name: 'Foo-9B-Context-1M-GGUF', paramCount: 9 })).toEqual([]);
  });

  it('labels coder families as Coding, and never decoder or encoder', () => {
    for (const name of ['StarCoder2-3B-GGUF', 'WizardCoder-15B-GGUF', 'starcoder2-15b', 'Qwen2.5-Coder-14B', 'CodeLlama-34B']) {
      expect(autoLabels({ name })).toContain('Coding');
    }
    for (const name of ['t5-decoder-14B', 'Encoder-14B-GGUF', 'ModernBERT-encoder-14B', 'DECODER-14B']) {
      expect(autoLabels({ name })).not.toContain('Coding');
    }
    expect(autoLabels({ name: 'Foo-14B', tags: ['coder'] })).toEqual(['Coding']);
    expect(autoLabels({ name: 'Foo-14B', tags: ['code'] })).toEqual(['Coding']);
  });

  it('does not repeat Vision on a card that shows the Vision badge', () => {
    const m = { name: 'gemma-4-E4B-it-GGUF', pipelineTag: 'image-text-to-text', paramCount: 4 };
    expect(autoLabels({ ...m, modelType: 'vision' })).toEqual([]);
    expect(autoLabels(m)).toEqual(['Vision']);
  });

  it('updated ago', () => {
    const now = new Date('2026-11-21T12:00:00Z');
    const ago = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
    expect(formatUpdatedAgo(ago(0.5), now)).toBe('updated today');
    expect(formatUpdatedAgo(ago(1), now)).toBe('updated yesterday');
    expect(formatUpdatedAgo(ago(3), now)).toBe('updated 3 days ago');
    expect(formatUpdatedAgo(ago(45), now)).toBe('updated 1 month ago');
    expect(formatUpdatedAgo(ago(70), now)).toBe('updated 2 months ago');
    expect(formatUpdatedAgo(ago(400), now)).toBe('updated 1 year ago');
    expect(formatUpdatedAgo(ago(800), now)).toBe('updated 2 years ago');
    expect(formatUpdatedAgo(undefined, now)).toBeNull();
    expect(formatUpdatedAgo('not a date', now)).toBeNull();
  });
});
