/**
 * useModelChoice Hook Unit Tests
 *
 * A model that will not unload is reported to the screen. The native engines swallow a context that refuses to
 * release, so the failure cannot be reached from the device boundary; the service is faked here.
 */

import { renderHook, act } from '@testing-library/react-native';
import { useModelChoice } from '../../../src/hooks/useModelChoice';

const mockDropTextModel = jest.fn();
const mockDropImageModel = jest.fn();
jest.mock('../../../src/services/modelChoice', () => ({
  chooseTextModel: jest.fn(),
  chooseRemoteTextModel: jest.fn(),
  chooseImageModel: jest.fn(),
  dropTextModel: (...args: unknown[]) => mockDropTextModel(...args),
  dropImageModel: (...args: unknown[]) => mockDropImageModel(...args),
}));

jest.mock('../../../src/hooks/useModelLoadingState', () => ({
  useModelLoadingState: () => ({ text: false, image: false }),
}));

describe('useModelChoice drop', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([['text', () => mockDropTextModel], ['image', () => mockDropImageModel]] as const)(
    'reports "Failed to unload model" when the %s model will not unload',
    async (kind, mockFor) => {
      mockFor().mockRejectedValueOnce(new Error('release failed'));
      const onError = jest.fn();
      const onChosen = jest.fn();
      const { result } = renderHook(() => useModelChoice({ onChosen, onError }));
      await act(async () => { await result.current.drop(kind); });
      expect(onError).toHaveBeenCalledWith('Failed to unload model');
      expect(onChosen).not.toHaveBeenCalled();
    },
  );
});
