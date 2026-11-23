/**
 * An app store saved by an older version still carries five fields the app no longer has
 * (a paid-licence flag and four promo flags). Opening the app on that saved state must
 * hydrate cleanly: the five fields are dropped and everything else the user saved stays.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppStore } from '../../../src/stores/appStore';
import { resetStores } from '../../utils/testHelpers';

const STORAGE_KEY = 'local-llm-app-storage';
const REMOVED_FIELDS = [
  'hasRegisteredPro',
  'devProDisabled',
  'proBannerDismissed',
  'desktopPromoDismissed',
  'proAhaTriggeredBy',
];

describe('appStore hydrating an older saved state', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
  });

  it('drops the five removed fields and keeps the rest of the saved state', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          hasCompletedOnboarding: true,
          activeModelId: 'm-1',
          settings: { temperature: 0.37, maxTokens: 3000 },
          hasRegisteredPro: true,
          devProDisabled: false,
          proBannerDismissed: true,
          desktopPromoDismissed: true,
          proAhaTriggeredBy: 'chat',
        },
        version: 0,
      }),
    );

    await useAppStore.persist.rehydrate();

    const state = useAppStore.getState() as unknown as Record<string, unknown>;
    for (const field of REMOVED_FIELDS) {
      expect(field in state).toBe(false);
    }
    expect(state.hasCompletedOnboarding).toBe(true);
    expect(state.activeModelId).toBe('m-1');
    const settings = state.settings as { temperature: number; maxTokens: number; topP: number };
    expect(settings.temperature).toBe(0.37);
    expect(settings.maxTokens).toBe(3000);
    // A setting the old state never saved falls back to its default.
    expect(typeof settings.topP).toBe('number');
  });
});
