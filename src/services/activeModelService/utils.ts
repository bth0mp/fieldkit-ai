/**
 * Standalone utility helpers for ActiveModelService.
 */

import { useAppStore } from '../../stores';
import { llmService } from '../llm';
import { liteRTService } from '../litert';
import { localDreamGeneratorService as onnxImageGeneratorService } from '../localDreamGenerator';

export interface SyncStateTarget {
  setLoadedTextModelId: (id: string | null) => void;
  setLoadedImageModelId: (id: string | null) => void;
  setLoadedImageModelThreads: (n: number | null) => void;
  loadedTextModelId: string | null;
  loadedImageModelId: string | null;
}

export async function syncWithNativeState(target: SyncStateTarget): Promise<void> {
  const store = useAppStore.getState();

  const textModelLoaded = llmService.isModelLoaded() || liteRTService.isModelLoaded();
  if (!textModelLoaded) {
    target.setLoadedTextModelId(null);
  } else if (!target.loadedTextModelId && store.activeModelId) {
    target.setLoadedTextModelId(store.activeModelId);
  }

  const imageModelLoaded = await onnxImageGeneratorService.isModelLoaded();
  if (!imageModelLoaded) {
    target.setLoadedImageModelId(null);
    target.setLoadedImageModelThreads(null);
  } else if (!target.loadedImageModelId && store.activeImageModelId) {
    target.setLoadedImageModelId(store.activeImageModelId);
  }
}
