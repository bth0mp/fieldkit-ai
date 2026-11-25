/**
 * Harness self-test: the RAM size and platform a test passes to bootHome reach the app. The app reads them at its
 * device leaves (react-native-device-info, DeviceMemoryModule, Platform), so the real hardwareService in the module
 * registry the app booted in must report what the test asked for, not the boundary's 12 GB Android default.
 */
import { bootHome } from './modelsApp';
import { resetDeviceMemory } from './deviceMemory';

jest.mock('@react-navigation/native', () => jest.requireActual('@react-navigation/native'));
jest.mock('../../src/hooks/useFocusTrigger', () => ({ useFocusTrigger: () => 0 }));

afterEach(() => resetDeviceMemory());

describe('bootHome harness: device RAM and platform', () => {
  it.each([
    { totalGB: 6, platform: 'ios' },
    { totalGB: 10.82, platform: 'android' },
  ] as const)('the app reads $totalGB GB on $platform', async ({ totalGB, platform }) => {
    await bootHome({ totalGB, platform });

    const { hardwareService } = require('../../src/services/hardware');
    const { Platform } = require('react-native');
    expect(hardwareService.getTotalMemoryGB()).toBeCloseTo(totalGB, 2);
    expect(hardwareService.getAvailableMemoryGB()).toBeCloseTo(totalGB / 2, 2);
    expect(Platform.OS).toBe(platform);
  });
});
