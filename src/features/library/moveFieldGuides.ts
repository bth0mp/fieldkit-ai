/**
 * Before the library projects, every guide sat in one Field guides project. This moves each of its documents
 * (embeddings and all, nothing is indexed again) into its category's project and then deletes the project; its
 * chats are unfiled, as any deleted project's are. Runs once: a failure leaves the flag unset and the next
 * launch tries again.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ragService } from '../../services/rag';
import { useProjectStore } from '../../stores/projectStore';
import { BUNDLED_GUIDE_CATEGORY_BY_NAME, FIELD_GUIDES_PROJECT_ID } from '../fieldGuides/fieldGuides';
import { GUIDE_LIBRARY_DIR } from '../guideLibrary/guideLibraryDisk';
import { useGuideLibraryStore } from '../guideLibrary/guideLibraryStore';
import { ensureCategoryProject, projectStoreHydrated } from './libraryProjects';

const MOVED_KEY = '@fieldkit/field_guides_moved';

function categoryOf(doc: { name: string; path: string }): string {
  const bundled = BUNDLED_GUIDE_CATEGORY_BY_NAME[doc.name];
  if (bundled) return bundled;
  const prefix = `${GUIDE_LIBRARY_DIR}/`;
  if (doc.path.startsWith(prefix) && doc.path.endsWith('.pdf')) {
    const id = doc.path.slice(prefix.length, -'.pdf'.length);
    const entry = useGuideLibraryStore.getState().catalogue.guides.find(g => g.id === id);
    if (entry) return entry.category;
  }
  return 'general';
}

export async function moveOffFieldGuidesProject(): Promise<void> {
  if (await AsyncStorage.getItem(MOVED_KEY) === '1') return;
  await projectStoreHydrated();
  if (useProjectStore.getState().getProject(FIELD_GUIDES_PROJECT_ID)) {
    for (const doc of await ragService.getDocumentsByProject(FIELD_GUIDES_PROJECT_ID)) {
      await ragService.moveDocument(doc.id, await ensureCategoryProject(categoryOf(doc)));
    }
    useProjectStore.getState().deleteProject(FIELD_GUIDES_PROJECT_ID);
  }
  await AsyncStorage.setItem(MOVED_KEY, '1');
}
