/**
 * The library is one project per category: each holds that category's field guides and Kiwix files, and a chat
 * in it reads only those. Categories are the guide catalogue's, plus two for Kiwix files that no guide uses.
 */
import { useProjectStore } from '../../stores/projectStore';
import { useGuideLibraryStore } from '../guideLibrary/guideLibraryStore';
import type { GuideCategory } from '../guideLibrary/catalogue';

const LIBRARY_PROJECT_PREFIX = 'library-';

const EXTRA_CATEGORIES: GuideCategory[] = [
  { id: 'travel', name: 'Hiking and travel' },
  { id: 'general', name: 'General reference' },
];

const LIBRARY_SYSTEM_PROMPT = `You are a field guide assistant running offline on the user's phone. Answer from this project's field guides and Kiwix files: give clear, numbered steps and name the guide or article you used. If they do not cover the question, say so before answering from general knowledge. For injuries and illness, say that this is first aid guidance, not a substitute for a medical professional, and that emergency services should be contacted when they can be reached.`;

export const libraryProjectId = (categoryId: string) => `${LIBRARY_PROJECT_PREFIX}${categoryId}`;

export const isLibraryProject = (projectId: string | undefined): boolean => !!projectId?.startsWith(LIBRARY_PROJECT_PREFIX);

export function libraryCategories(): GuideCategory[] {
  const fromCatalogue = useGuideLibraryStore.getState().catalogue.categories;
  return [...fromCatalogue, ...EXTRA_CATEGORIES.filter(extra => !fromCatalogue.some(c => c.id === extra.id))];
}

const categoryName = (categoryId: string): string =>
  libraryCategories().find(c => c.id === categoryId)?.name ?? categoryId;

export async function projectStoreHydrated(): Promise<void> {
  const persist = useProjectStore.persist;
  if (persist.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    const unsubscribe = persist.onFinishHydration(() => { unsubscribe(); resolve(); });
  });
}

/** The category's project id, after creating the project if it is missing (the user just put something in it). */
export async function ensureCategoryProject(categoryId: string): Promise<string> {
  await projectStoreHydrated();
  const id = libraryProjectId(categoryId);
  const projects = useProjectStore.getState();
  if (!projects.getProject(id)) {
    const name = categoryName(categoryId);
    projects.createProject({ id, name, description: `Field guides and Kiwix files for ${name}`, systemPrompt: LIBRARY_SYSTEM_PROMPT, icon: '#84CC16' });
  }
  return id;
}

export const libraryProjectIds = (): string[] =>
  useProjectStore.getState().projects.map(p => p.id).filter(isLibraryProject);
