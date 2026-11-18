import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import { ragService } from '../../services/rag';
import { useProjectStore } from '../../stores/projectStore';
import { copyBundledAsset } from '../../utils/bundledAsset';
import logger from '../../utils/logger';

export const FIELD_GUIDES_PROJECT_ID = 'field-guides';

/**
 * Public-domain US government guides shipped in android/app/src/main/assets/guides. Sources and licences are
 * credited in scripts/gen-notices.js (Open-source licenses screen). `name` is what the user and the model see.
 */
const FIELD_GUIDES = [
  { asset: 'atp-3-50-21-survival.pdf', name: 'Survival (US Army ATP 3-50.21).pdf' },
  { asset: 'ships-medicine-chest.pdf', name: "Ship's Medicine Chest and Medical Aid at Sea (US Public Health Service).pdf" },
  { asset: 'atp-4-02-11-first-aid.pdf', name: 'Casualty Response and First Aid (US Army ATP 4-02.11).pdf' },
  { asset: 'tc-4-02-3-field-hygiene.pdf', name: 'Field Hygiene and Sanitation (US Army TC 4-02.3).pdf' },
  { asset: 'nrcs-tn28-solar-pumps.pdf', name: 'Solar-Powered Water Pump Systems (USDA NRCS Technical Note 28).pdf' },
  { asset: 'neets-1-direct-current.pdf', name: 'Matter, Energy and Direct Current (US Navy NEETS Module 1).pdf' },
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

async function projectStoreHydrated(): Promise<void> {
  const persist = useProjectStore.persist;
  if (persist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    const unsubscribe = persist.onFinishHydration(() => { unsubscribe(); resolve(); });
  });
}

/** Copy one guide out of the app bundle. A partial copy (app killed mid-copy) never reaches `dest`. */
async function copyGuide(asset: string, dest: string): Promise<void> {
  if (await RNFS.exists(dest)) return;
  const part = `${dest}.part`;
  await copyBundledAsset(`guides/${asset}`, part);
  await RNFS.moveFile(part, dest);
}

/**
 * First-launch setup of the bundled field guides: creates the Field guides project and indexes each guide
 * into its knowledge base. Runs on every launch but only does work for guides not yet indexed; a guide that
 * fails is logged and retried on the next launch.
 */
export async function seedFieldGuides(): Promise<void> {
  const state = await readState();
  const todo = FIELD_GUIDES.filter(g => !state.done.includes(g.asset));
  if (todo.length === 0) return;

  await projectStoreHydrated();
  const dir = `${RNFS.DocumentDirectoryPath}/field-guides`;
  await RNFS.mkdir(dir);
  const projects = useProjectStore.getState();
  if (!projects.getProject(FIELD_GUIDES_PROJECT_ID)) {
    if (state.projectCreated) return; // the user deleted the project
    // Throws before any project exists when this build ships no guides (iOS has none bundled).
    await copyGuide(todo[0].asset, `${dir}/${todo[0].asset}`);
    projects.createProject({
      id: FIELD_GUIDES_PROJECT_ID,
      name: 'Field guides',
      description: 'Public-domain survival, first aid, sanitation and solar power guides',
      systemPrompt: SYSTEM_PROMPT,
      icon: '#84CC16', // Lime
    });
    state.projectCreated = true;
    await saveState(state);
  }

  const indexed = new Set((await ragService.getDocumentsByProject(FIELD_GUIDES_PROJECT_ID)).map(d => d.name));
  for (const guide of todo) {
    try {
      if (!indexed.has(guide.name)) {
        const path = `${dir}/${guide.asset}`;
        await copyGuide(guide.asset, path);
        const { size } = await RNFS.stat(path);
        await ragService.indexDocument({ projectId: FIELD_GUIDES_PROJECT_ID, filePath: path, fileName: guide.name, fileSize: Number(size), bundled: true });
      }
      state.done.push(guide.asset);
      await saveState(state);
    } catch (error) {
      logger.error(`[FieldGuides] ${guide.name} not indexed, retrying next launch`, error);
    }
  }
}
