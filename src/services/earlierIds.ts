/**
 * The only file that knows the ids an earlier version saved things under. A person who updates keeps the
 * app lock, saved server keys, downloaded models and downloads: each is read under its new id first and,
 * when that is empty, under the earlier one, then moved.
 */
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import logger from '../utils/logger';

export const EARLIER_AUTH_SERVICE = 'ai.offgridmobile.auth';
export const EARLIER_SERVERS_SERVICE = 'ai.offgridmobile.servers';
export const EARLIER_ACTIVE_DOWNLOADS_KEY = '@offgrid/active_downloads';
export const EARLIER_QUEUED_DOWNLOADS_KEY = '@offgrid/queued_downloads';

/**
 * Read a Keychain entry by its service. When that has none, take the one an earlier version saved under
 * `earlierService`: store it under `service` (same username, password and accessibility), then clear the
 * earlier one. A read that throws is passed on, so a caller that must fail closed still does. A failed
 * store or reset is not the reader's error: the entry is returned and the move is tried at the next read.
 * When both exist the new one wins.
 */
export async function readKeychainEntry(
  service: string,
  earlierService: string,
  accessible: Keychain.SetOptions['accessible'],
): Promise<false | Keychain.UserCredentials> {
  const current = await Keychain.getGenericPassword({ service });
  if (current) return current;
  const earlier = await Keychain.getGenericPassword({ service: earlierService });
  if (!earlier) return false;
  try {
    await Keychain.setGenericPassword(earlier.username, earlier.password, { service, accessible });
  } catch (error) {
    logger.warn('[EarlierIds] Could not move a Keychain entry to its new service; trying again next time', error);
    return earlier;
  }
  try {
    await Keychain.resetGenericPassword({ service: earlierService });
  } catch (error) {
    logger.warn('[EarlierIds] Moved a Keychain entry but could not clear the earlier one', error);
  }
  return earlier;
}

/**
 * Read an AsyncStorage value by its key. When that has none, take the one an earlier version saved under
 * `earlierKey`: store it under `key` and remove the earlier one. A failed move is not the reader's error;
 * the value is returned and the move is tried at the next read. When both exist the new one wins.
 */
export async function readMovedItem(key: string, earlierKey: string): Promise<string | null> {
  const current = await AsyncStorage.getItem(key);
  if (current) return current;
  const earlier = await AsyncStorage.getItem(earlierKey);
  if (!earlier) return null;
  try {
    await AsyncStorage.setItem(key, earlier);
    await AsyncStorage.removeItem(earlierKey);
  } catch (error) {
    logger.warn('[EarlierIds] Could not move a saved value to its new key; trying again next time', error);
  }
  return earlier;
}

/** Remove a saved value under its key and the one an earlier version used. */
export async function removeMovedItem(key: string, earlierKey: string): Promise<void> {
  await AsyncStorage.removeItem(key);
  await AsyncStorage.removeItem(earlierKey);
}

// What earlier versions left on the phone that nothing reads any more: Keychain entries of a licence check
// that no longer exists, and the developer logs of debug builds.
const LEFTOVER_SERVICES = ['off-grid-pro-license', 'off-grid-device-fingerprint'];
const LEFTOVER_LOG_FILES = ['offgrid-debug.log', 'offgrid-wire.log'];
const LEFTOVERS_CLEARED_KEY = '@fieldkit/earlier_ids_cleared';

/**
 * Clear those leftovers, once. Best effort and off the boot path: a step that fails is logged and the
 * whole thing is tried again at the next launch, because the flag is set only when every step worked.
 */
export async function clearEarlierLeftovers(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(LEFTOVERS_CLEARED_KEY)) return;
    for (const service of LEFTOVER_SERVICES) {
      await Keychain.resetGenericPassword({ service });
    }
    for (const name of LEFTOVER_LOG_FILES) {
      const path = `${RNFS.DocumentDirectoryPath}/${name}`;
      if (await RNFS.exists(path)) await RNFS.unlink(path);
    }
    await AsyncStorage.setItem(LEFTOVERS_CLEARED_KEY, '1');
  } catch (error) {
    logger.warn('[EarlierIds] Could not clear what an earlier version left; trying again next launch', error);
  }
}
