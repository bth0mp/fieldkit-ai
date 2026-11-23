/**
 * useFocusTrigger Hook Tests
 *
 * - The trigger is 1 from the first focus on and never changes again
 * - Leaving and re-entering a tab does not re-render the screen
 * - A screen that mounts unfocused gets 1 when it first gains focus
 */

import { renderHook, act } from '@testing-library/react-native';

type Listener = () => void;
let mockFocused = true;
let mockListeners: Record<string, Set<Listener>> = {};
const mockNavigation = {
  isFocused: () => mockFocused,
  addListener: (event: string, cb: Listener) => {
    (mockListeners[event] ??= new Set()).add(cb);
    return () => mockListeners[event].delete(cb);
  },
};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
}));

import { useFocusTrigger } from '../../../src/hooks/useFocusTrigger';

const emit = (event: string) => act(() => { mockListeners[event]?.forEach(cb => cb()); });

describe('useFocusTrigger', () => {
  beforeEach(() => {
    mockFocused = true;
    mockListeners = {};
  });

  it('is 1 at once on a screen that is already focused', () => {
    const { result } = renderHook(() => useFocusTrigger());
    expect(result.current).toBe(1);
  });

  it('does not render again when the tab is left and re-entered', () => {
    let renders = 0;
    const { result } = renderHook(() => { renders += 1; return useFocusTrigger(); });
    const after = renders;
    emit('blur');
    emit('focus');
    emit('blur');
    emit('focus');
    expect(renders).toBe(after);
    expect(result.current).toBe(1);
  });

  it('is 0 on a screen that mounts unfocused, then 1 from its first focus on', () => {
    mockFocused = false;
    let renders = 0;
    const { result } = renderHook(() => { renders += 1; return useFocusTrigger(); });
    expect(result.current).toBe(0);
    emit('focus');
    expect(result.current).toBe(1);
    const after = renders;
    emit('blur');
    emit('focus');
    expect(renders).toBe(after);
    expect(result.current).toBe(1);
  });
});
