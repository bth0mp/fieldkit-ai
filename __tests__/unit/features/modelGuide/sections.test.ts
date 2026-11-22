import { tierRows, textEntries, imageEntries, whisperEntries, liteRtEntries } from '../../../../src/features/modelGuide/sections';

describe('modelGuide sections', () => {
  it('lists the five tiers, with the examples only where a tier has them', () => {
    const rows = tierRows();
    expect(rows.map(r => r.gb)).toEqual([4, 6, 8, 12, 16]);
    expect(rows.find(r => r.gb === 12)!.runsWell).toContain('Gemma 4 E4B');
    expect(rows.find(r => r.gb === 6)!.tight).toContain('Gemma 4 E4B');
    expect(rows.find(r => r.gb === 4)!.runsWell).not.toContain('Gemma 4 E4B');
  });

  it('gives each text pick its fit from its own minimum, and a range when it has a maximum', () => {
    const fits = Object.fromEntries(textEntries().map(e => [e.id, e.fits]));
    expect(fits['unsloth/gemma-4-E4B-it-GGUF']).toBe('6 GB and up');
    expect(fits['unsloth/Qwen3.5-0.8B-GGUF']).toBe('4 GB and up');
    expect(fits['ggml-org/SmolVLM2-500M-Video-Instruct-GGUF']).toBe('4 to 6 GB phones');
  });

  it('has no image rows while no image model has a note, and a fit for every file otherwise', () => {
    expect(imageEntries()).toEqual([]);
    for (const e of [...whisperEntries(), ...liteRtEntries()]) expect(e.fits).toMatch(/^\d+ GB and up$/);
  });

  it('names the language of each Whisper size, so Tiny and Tiny English read apart', () => {
    const names = whisperEntries().map(e => e.name);
    expect(names).toContain('Tiny (English only)');
    expect(names).toContain('Tiny (many languages)');
  });
});
