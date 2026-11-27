import { Platform } from 'react-native';
import { tierRows, textEntries, imageEntries, whisperEntries, liteRtEntries } from '../../../../src/features/modelGuide/sections';
import { textPickFit, textPickFitLine, MEMORY_TIERS } from '../../../../src/features/modelGuide/guide';
import { RECOMMENDED_MODELS } from '../../../../src/constants/models';
import { IMAGE_NOTES } from '../../../../src/features/modelGuide/notes';

const originalOS = Platform.OS;
// The app ships on Android, whose memory fractions the labels are written for.
beforeAll(() => { Object.defineProperty(Platform, 'OS', { value: 'android' }); });
afterAll(() => { Object.defineProperty(Platform, 'OS', { value: originalOS }); });

const EXPECTED: Record<number, { runsWell: string[]; tight: string[] }> = {
  4: {
    runsWell: ['Qwen 3.5 0.8B', 'SmolVLM2 500M', 'SmolLM2 360M'],
    tight: ['Qwen 3.5 2B', 'SmolVLM2 2.2B', 'SmolVLM 2B'],
  },
  6: {
    runsWell: ['Qwen 3.5 2B', 'Qwen 3.5 0.8B', 'SmolVLM2 2.2B', 'SmolVLM 2B', 'SmolVLM2 500M', 'SmolLM2 360M'],
    tight: ['Gemma 4 E2B', 'SmolLM3 3B', 'Mistral 7B'],
  },
  8: {
    runsWell: ['Qwen 3.5 2B', 'Qwen 3.5 0.8B', 'SmolLM3 3B', 'SmolVLM2 2.2B', 'SmolVLM 2B'],
    tight: ['Gemma 4 E4B', 'Gemma 4 E2B', 'Qwen 3.5 9B', 'Mistral 7B'],
  },
  12: {
    runsWell: ['Gemma 4 E2B', 'Qwen 3.5 2B', 'Qwen 3.5 0.8B', 'SmolLM3 3B', 'SmolVLM2 2.2B', 'SmolVLM 2B', 'Mistral 7B'],
    tight: ['Gemma 4 E4B', 'Qwen 3.5 9B'],
  },
  16: {
    runsWell: ['Gemma 4 E4B', 'Gemma 4 E2B', 'Qwen 3.5 9B', 'Qwen 3.5 2B', 'Qwen 3.5 0.8B', 'SmolLM3 3B', 'SmolVLM2 2.2B', 'SmolVLM 2B', 'Mistral 7B'],
    tight: [],
  },
};

describe('modelGuide sections', () => {
  it('lists the five tiers, with the examples only where a tier has them', () => {
    expect(tierRows().map(r => r.gb)).toEqual([4, 6, 8, 12, 16]);
  });

  it('labels every tier with the models the app would load, largest first inside each family', () => {
    for (const row of tierRows()) {
      expect({ runsWell: row.runsWell, tight: row.tight }).toEqual(EXPECTED[row.gb]);
    }
  });

  it('writes each pick a Fits line from the same labels as the rows', () => {
    const lines = Object.fromEntries(textEntries().map(e => [e.name, e.fits]));
    expect(lines['Gemma 4 E2B']).toBe('12 GB and up; tight on 6 and 8 GB');
    expect(lines['Gemma 4 E4B']).toBe('16 GB and up; tight on 8 and 12 GB');
    expect(lines['Qwen 3.5 9B']).toBe('16 GB and up; tight on 8 and 12 GB');
    expect(lines['Qwen 3.5 0.8B']).toBe('4 GB and up');
    expect(lines['Qwen 3.5 2B']).toBe('6 GB and up; tight on 4 GB');
    expect(lines['SmolLM3 3B']).toBe('8 GB and up; tight on 6 GB');
    expect(lines['Mistral 7B']).toBe('12 GB and up; tight on 6 and 8 GB');
    expect(textEntries().find(e => e.name === 'SmolVLM2 500M')!.fitsLabel).toBe('Best on');
    expect(lines['SmolVLM2 500M']).toBe('4 and 6 GB phones');
    expect(textEntries().find(e => e.name === 'Qwen 3.5 2B')!.fitsLabel).toBe('Fits');
  });

  it('never disagrees between a row and a Fits line', () => {
    for (const pick of RECOMMENDED_MODELS) {
      const line = textPickFitLine(pick);
      for (const tier of MEMORY_TIERS) {
        const fit = textPickFit(pick, tier);
        const row = tierRows().find(r => r.gb === tier)!;
        expect(row.runsWell.includes(pick.name)).toBe(fit === 'runs-well');
        expect(row.tight.includes(pick.name)).toBe(fit === 'tight');
      }
      expect(line).toBeTruthy();
    }
  });

  it('has one image row per image note, with its note', () => {
    expect(imageEntries().map(e => [e.id, e.goodFor])).toEqual(IMAGE_NOTES.map(n => [n.name, n.goodFor]));
  });

  it('names the language of each Whisper size and sizes it by file or stated memory', () => {
    const fits = Object.fromEntries(whisperEntries().map(e => [e.name, e.fits]));
    expect(fits['Tiny (English only)']).toBe('4 GB and up');
    expect(fits['Tiny (many languages)']).toBe('4 GB and up');
    expect(fits['Small (many languages)']).toBe('4 GB and up');
    expect(fits['Large v3 Turbo (many languages)']).toBe('4 GB and up');
    expect(fits['Medium (English only)']).toBe('6 GB and up');
    expect(fits['Medium (many languages)']).toBe('6 GB and up');
    expect(fits['Large v3 (many languages)']).toBe('8 GB and up');
  });

  it('sizes LiteRT files by what the app charges to load them', () => {
    const fits = Object.fromEntries(liteRtEntries().map(e => [e.name, e.fits]));
    expect(fits['Gemma 4 E2B']).toBe('12 GB and up');
    expect(fits['Gemma 4 E4B']).toBe('12 GB and up');
  });
});
