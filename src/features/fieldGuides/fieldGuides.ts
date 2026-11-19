import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { ragService } from '../../services/rag';
import { copyBundledAsset } from '../../utils/bundledAsset';
import logger from '../../utils/logger';
import { ensureCategoryProject } from '../library/libraryProjects';

/** The single project every guide sat in before the library projects (moveFieldGuides moves them out). */
export const FIELD_GUIDES_PROJECT_ID = 'field-guides';

/**
 * Public-domain US government guides shipped in android/app/src/main/assets/guides. Sources and licences are
 * credited in scripts/gen-notices.js (Open-source licenses screen). `name` is what the user and the model see.
 */
const FIELD_GUIDES = [
  { asset: 'atp-3-50-21-survival.pdf', name: 'Survival (US Army ATP 3-50.21).pdf', category: 'fieldcraft' },
  { asset: 'ships-medicine-chest.pdf', name: "Ship's Medicine Chest and Medical Aid at Sea (US Public Health Service).pdf", category: 'medical' },
  { asset: 'atp-4-02-11-first-aid.pdf', name: 'Casualty Response and First Aid (US Army ATP 4-02.11).pdf', category: 'medical' },
  { asset: 'tc-4-02-3-field-hygiene.pdf', name: 'Field Hygiene and Sanitation (US Army TC 4-02.3).pdf', category: 'water' },
  { asset: 'nrcs-tn28-solar-pumps.pdf', name: 'Solar-Powered Water Pump Systems (USDA NRCS Technical Note 28).pdf', category: 'power' },
  { asset: 'neets-1-direct-current.pdf', name: 'Matter, Energy and Direct Current (US Navy NEETS Module 1).pdf', category: 'power' },
];

/** Each bundled guide's library category, by the name the user and the model see. */
export const BUNDLED_GUIDE_CATEGORY_BY_NAME: Record<string, string> = Object.fromEntries(FIELD_GUIDES.map(g => [g.name, g.category]));

const STATE_KEY = '@fieldkit/field_guides_seeded';

/** What earlier launches finished, so a guide or project the user deleted stays deleted. */
interface SeedState {
  /** Assets indexed into their projects. */
  done: string[];
}

async function readState(): Promise<SeedState> {
  const raw = await AsyncStorage.getItem(STATE_KEY);
  return { done: raw ? JSON.parse(raw).done ?? [] : [] };
}

const saveState = (state: SeedState) => AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));

/** Copy one guide out of the app bundle. A partial copy (app killed mid-copy) never reaches `dest`. */
async function copyGuide(asset: string, dest: string): Promise<void> {
  if (await RNFS.exists(dest)) return;
  const part = `${dest}.part`;
  await copyBundledAsset(`guides/${asset}`, part);
  await RNFS.moveFile(part, dest);
}

/**
 * First-launch setup of the bundled field guides: indexes each guide into the knowledge base of its category's
 * library project. Runs on every launch but only does work for guides not yet seeded; a guide that fails is logged
 * and retried on the next launch. A seeded guide the user deletes later is not added again.
 */
export async function seedFieldGuides(): Promise<void> {
  const state = await readState();
  const todo = FIELD_GUIDES.filter(g => !state.done.includes(g.asset));
  if (todo.length === 0) return;

  const dir = `${RNFS.DocumentDirectoryPath}/field-guides`;
  await RNFS.mkdir(dir);
  for (const guide of todo) {
    try {
      const path = `${dir}/${guide.asset}`;
      // Throws before any project exists when this build ships no guides (iOS has none bundled).
      await copyGuide(guide.asset, path);
      const projectId = await ensureCategoryProject(guide.category);
      if (!(await ragService.getDocumentsByProject(projectId)).some(d => d.name === guide.name)) {
        const { size } = await RNFS.stat(path);
        await ragService.indexDocument({ projectId, filePath: path, fileName: guide.name, fileSize: Number(size), bundled: true });
      }
      state.done.push(guide.asset);
      await saveState(state);
    } catch (error) {
      logger.error(`[FieldGuides] ${guide.name} not indexed, retrying next launch`, error);
    }
  }
}
