import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { ragService } from '../../services/rag';
import { useProjectStore } from '../../stores/projectStore';
import { copyBundledAsset } from '../../utils/bundledAsset';
import logger from '../../utils/logger';
import { ensureCategoryProject, projectStoreHydrated } from '../library/libraryProjects';

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

const SYSTEM_PROMPT = `You are a field guide assistant running offline on the user's phone. Answer from the field guides in your knowledge base: give clear, numbered steps and name the guide you used. If the guides do not cover the question, say so before answering from general knowledge. For injuries and illness, say that this is first aid guidance, not a substitute for a medical professional, and that emergency services should be contacted when they can be reached.`;

const STATE_KEY = '@fieldkit/field_guides_seeded';

/** What earlier launches finished, so a guide or project the user deleted stays deleted. */
interface SeedState {
  projectCreated: boolean;
  /** Assets indexed into the project. */
  done: string[];
}

async function readState(): Promise<SeedState> {
  const raw = await AsyncStorage.getItem(STATE_KEY);
  return raw ? JSON.parse(raw) : { projectCreated: false, done: [] };
}

const saveState = (state: SeedState) => AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));

/** Creates the Field guides project unless it exists (createProject would add a second one with the same id). */
function createFieldGuidesProject(): void {
  const projects = useProjectStore.getState();
  if (projects.getProject(FIELD_GUIDES_PROJECT_ID)) return;
  projects.createProject({
    id: FIELD_GUIDES_PROJECT_ID,
    name: 'Field guides',
    description: 'Public-domain survival, first aid, sanitation and solar power guides',
    systemPrompt: SYSTEM_PROMPT,
    icon: '#84CC16', // Lime
  });
}

/**
 * If the Field guides project is missing, creates it. When the user had deleted it, every bundled guide is
 * marked as handled in the seed's saved state, so the first-launch seed does not re-add guides they removed;
 * when the seed never got as far as creating it, the seed adds the bundled guides on a later launch.
 */
export async function ensureFieldGuidesProject(): Promise<void> {
  await projectStoreHydrated();
  if (useProjectStore.getState().getProject(FIELD_GUIDES_PROJECT_ID)) return;
  const state = await readState();
  createFieldGuidesProject();
  const done = state.projectCreated ? FIELD_GUIDES.map(g => g.asset) : state.done;
  await saveState({ projectCreated: true, done });
}

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
