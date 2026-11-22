/**
 * Boots the real app on Home and opens the Models screen through the Phone card, with Hugging Face faked at
 * `global.fetch` (installed before render: the Text tab fetches its picks on mount) and the phone's RAM set.
 * The two jest.mock lines (real navigation, no focus trigger) stay in each test file, because jest hoists them.
 */
import { installNativeBoundary, requireRTL, GB } from './nativeBoundary';
import { createDownloadedModel } from '../utils/factories';
import { installHfApiFake, type HfApiFake } from './hfApiFake';
import { setDeviceMemory } from './deviceMemory';

const TIMEOUT = { timeout: 4000 };

export interface ModelsAppOptions {
  totalGB: number;
  platform?: 'android' | 'ios';
  hf?: (hf: HfApiFake) => void;
}

export async function openModelsFromHome(opts: ModelsAppOptions) {
  const boundary = installNativeBoundary({ llama: true, fs: true });
  const hf = installHfApiFake();
  opts.hf?.(hf);
  setDeviceMemory({ platform: opts.platform ?? 'android', totalGB: opts.totalGB, availGB: opts.totalGB / 2 });
  const AsyncStorage = require('@react-native-async-storage/async-storage').default
    ?? require('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
  const { useAppStore } = require('../../src/stores');
  const { hardwareService } = require('../../src/services/hardware');

  // Boot leaves onboarding done and one text model downloaded (the app opens the model download screen without one).
  const fileName = 'ggml-small.gguf';
  const filePath = `${boundary.fs!.DocumentDirectoryPath}/models/${fileName}`;
  boundary.fs!.seedFile(filePath, 500 * 1024 * 1024);
  const model = createDownloadedModel({ id: 'm', name: 'Test Model', engine: 'llama', filePath, fileName, fileSize: 2 * GB });
  await AsyncStorage.setItem('@local_llm/downloaded_models', JSON.stringify([model]));
  await hardwareService.refreshMemoryInfo();
  useAppStore.setState({
    hasCompletedOnboarding: true,
    downloadedModels: [model],
    // The onboarding tour is not under test; its spotlights would sit over the controls.
    checklistDismissed: true,
    shownSpotlights: { input: true, voiceHint: true, imageSettings: true },
  });

  const React = require('react');
  const rtl = requireRTL();
  const { NavigationContainer } = require('@react-navigation/native');
  const { AppNavigator } = require('../../src/navigation/AppNavigator');
  const ui = rtl.render(React.createElement(NavigationContainer, null, React.createElement(AppNavigator)));
  await rtl.waitFor(() => expect(ui.getByTestId('home-screen')).toBeTruthy(), TIMEOUT);
  rtl.fireEvent.press(ui.getByTestId('home-phone-models'));
  await rtl.waitFor(() => expect(ui.getByTestId('models-screen')).toBeTruthy(), TIMEOUT);
  return { rtl, ui, hf };
}
