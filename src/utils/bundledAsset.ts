import { Platform } from 'react-native';
import RNFS from 'react-native-fs';

/**
 * Copy a file shipped inside the app to a real path. `assetPath` is relative to the Android assets folder
 * (android/app/src/main/assets); on iOS the file sits flat in the main bundle under its base name.
 */
export async function copyBundledAsset(assetPath: string, destPath: string): Promise<void> {
  if (Platform.OS === 'android') {
    await RNFS.copyFileAssets(assetPath, destPath);
  } else {
    await RNFS.copyFile(`${RNFS.MainBundlePath}/${assetPath.split('/').pop()}`, destPath);
  }
}
