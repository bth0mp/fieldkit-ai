/**
 * Boots the real app on Home and opens the Models screen through the Phone card, with Hugging Face faked at
 * `global.fetch` (installed before render: the Text tab fetches its picks on mount) and the phone's RAM and platform
 * seeded at the native boundary (half the RAM is free).
 * The two jest.mock lines (real navigation, no focus trigger) stay in each test file, because jest hoists them.
 */
import { installNativeBoundary, requireRTL, GB } from './nativeBoundary';
import { createDownloadedModel, createONNXImageModel } from '../utils/factories';
import type { DownloadedModel, ONNXImageModel } from '../../src/types';
import { installHfApiFake, type HfApiFake } from './hfApiFake';

// The whole app boots in each of these tests: the first takes longer than Jest's 10 s default on a slow machine.
jest.setTimeout(40000);

const TIMEOUT = { timeout: 4000 };

export interface ModelsAppOptions {
  totalGB: number;
  platform?: 'android' | 'ios';
  hf?: (hf: HfApiFake) => void;
  /** Downloaded text models (a file and a record each); default is one model, 'm'. */
  models?: Partial<DownloadedModel>[];
  /** Downloaded image models; default none. */
  imageModels?: Partial<ONNXImageModel>[];
}

/** Boots the real app on Home. `nav` is the container ref, for tests that push or read routes. */
export async function bootHome(opts: ModelsAppOptions) {
  // The RAM sensor and the platform are device leaves: the boundary seeds them, and the app's own hardwareService reads them.
  const ram = { platform: opts.platform ?? 'android', totalBytes: Math.round(opts.totalGB * GB), availBytes: Math.round(opts.totalGB * GB / 2) };
  const boundary = installNativeBoundary({ llama: true, fs: true, ram });
  const hf = installHfApiFake();
  opts.hf?.(hf);
  const AsyncStorage = require('@react-native-async-storage/async-storage').default
    ?? require('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
  const { useAppStore } = require('../../src/stores');
  const { hardwareService } = require('../../src/services/hardware');

  // Boot leaves onboarding done and one text model downloaded (the app opens the model download screen without one).
  const seeds: Partial<DownloadedModel>[] = opts.models ?? [{ id: 'm', name: 'Test Model', fileName: 'ggml-small.gguf' }];
  const downloaded = seeds.map(seed => {
    const fileName = seed.fileName ?? `${seed.id}.gguf`;
    const filePath = `${boundary.fs!.DocumentDirectoryPath}/models/${fileName}`;
    boundary.fs!.seedFile(filePath, 500 * 1024 * 1024);
    const model = createDownloadedModel({ engine: 'llama', fileSize: 2 * GB, ...seed, filePath, fileName });
    return 'downloadedAt' in seed ? { ...model, downloadedAt: seed.downloadedAt } as DownloadedModel : model;
  });
  const imageModels = (opts.imageModels ?? []).map(seed => createONNXImageModel(seed));
  await AsyncStorage.setItem('@local_llm/downloaded_models', JSON.stringify(downloaded));
  // The Models screen reads image models back from storage, and drops one whose folder is missing.
  for (const model of imageModels) boundary.fs!.seedFile(model.modelPath, 1);
  await AsyncStorage.setItem('@local_llm/downloaded_image_models', JSON.stringify(imageModels));
  await hardwareService.refreshMemoryInfo();
  useAppStore.setState({
    hasCompletedOnboarding: true,
    downloadedModels: downloaded,
    downloadedImageModels: imageModels,
    // The onboarding tour is not under test; its spotlights would sit over the controls.
    checklistDismissed: true,
    shownSpotlights: { input: true, voiceHint: true, imageSettings: true },
  });

  const React = require('react');
  const rtl = requireRTL();
  const { NavigationContainer, createNavigationContainerRef } = require('@react-navigation/native');
  const { AppNavigator } = require('../../src/navigation/AppNavigator');
  const nav = createNavigationContainerRef();
  const ui = rtl.render(React.createElement(NavigationContainer, { ref: nav }, React.createElement(AppNavigator)));
  await rtl.waitFor(() => expect(ui.getByTestId('home-screen')).toBeTruthy(), TIMEOUT);
  return { rtl, ui, hf, boundary, nav };
}

export async function openModelsFromHome(opts: ModelsAppOptions) {
  const { rtl, ui, hf, boundary, nav } = await bootHome(opts);
  rtl.fireEvent.press(ui.getByTestId('home-phone-models'));
  await rtl.waitFor(() => expect(ui.getByTestId('models-screen')).toBeTruthy(), TIMEOUT);
  return { rtl, ui, hf, boundary, nav };
}
