/**
 * BOUNDARY: the system photo picker and camera (react-native-image-picker).
 *
 * The picker is a screen of its own: while it is open the app goes to the background, and when the person chooses (or
 * cancels) the app comes back. A test scripts that with `whileImagePickerOpen`, which runs after the picker is called
 * and before it answers, and so can fire AppState `background` and `active` at the boundary.
 *
 *   jest.mock('react-native-image-picker', () => require('../../harness/imagePickerFake').imagePickerModule());
 */
export type PickedAsset = { uri: string; type?: string; fileName?: string; width?: number; height?: number };

type Script = () => void | Promise<void>;
type State = { whileOpen: Script | null; asset: PickedAsset };

function state(): State {
  const g = globalThis as unknown as { __IMAGE_PICKER_FAKE__?: State };
  g.__IMAGE_PICKER_FAKE__ ??= {
    whileOpen: null,
    asset: { uri: 'file:///mock/image.jpg', type: 'image/jpeg', fileName: 'image.jpg', width: 1024, height: 768 },
  };
  return g.__IMAGE_PICKER_FAKE__;
}

/** Runs once, while the next picker is open, before the person's choice comes back. */
export function whileImagePickerOpen(script: Script): void {
  state().whileOpen = script;
}

export function resetImagePicker(): void {
  state().whileOpen = null;
}

async function open() {
  const script = state().whileOpen;
  state().whileOpen = null;
  await script?.();
  return { assets: [state().asset] };
}

export function imagePickerModule() {
  return {
    launchImageLibrary: jest.fn(open),
    launchCamera: jest.fn(open),
  };
}
