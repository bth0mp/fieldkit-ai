/**
 * The only file that knows the ids an earlier version saved things under. A person who updates keeps the
 * app lock, saved server keys, downloaded models and downloads: each is read under its new id first and,
 * when that is empty, under the earlier one, then moved.
 */
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import type { StateStorage } from 'zustand/middleware';
import logger from '../utils/logger';
import { LITERT_PARENT_ID } from './curatedLiteRTRegistry';

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

export const EARLIER_LITERT_PARENT_ID = 'offgrid/litert-recommended';
/** The author an earlier version saved for the curated LiteRT models. */
export const EARLIER_LITERT_AUTHOR = 'offgrid';
// The id at the start of a JSON string (after its opening quote) or after a colon inside one, and followed
// by the rest of the id or the end of the string. Text that merely quotes the id (a backslash before the
// quote, as JSON escapes it) is left alone.
const EARLIER_LITERT_ID_IN_JSON = /(^|[^\\])(["':])offgrid\/litert-recommended(?=["/])/g;

/**
 * Rename the curated LiteRT model id inside a saved JSON string (values, keys, ids joined by a colon).
 * Saved data is read through this, so it need not be rewritten: the next normal save writes the new id.
 * A multi-megabyte chat string is searched with `includes` first and is returned as it came when the
 * id is not in it.
 */
export function renameEarlierModelIds(raw: string): string {
  if (!raw.includes(EARLIER_LITERT_PARENT_ID)) return raw;
  return raw.replace(EARLIER_LITERT_ID_IN_JSON, (_match, before: string, mark: string) => `${before}${mark}${LITERT_PARENT_ID}`);
}

/** The same for a value that is not a string yet (a row from the native download database). */
export function renameEarlierModelIdsIn<T>(value: T): T {
  const raw = JSON.stringify(value);
  const renamed = raw === undefined ? raw : renameEarlierModelIds(raw);
  return renamed === raw ? value : (JSON.parse(renamed) as T);
}

/** A saved-state storage that renames the earlier model id in what it reads. Writes go straight through. */
export function renamingStorage(base: StateStorage = AsyncStorage): StateStorage {
  return {
    getItem: async name => {
      const value = await base.getItem(name);
      return typeof value === 'string' ? renameEarlierModelIds(value) : value;
    },
    setItem: (name, value) => base.setItem(name, value),
    removeItem: name => base.removeItem(name),
  };
}

// What earlier versions left on the phone that nothing reads any more: Keychain entries of a licence check
// that no longer exists, and the developer logs of debug builds.
export const EARLIER_LEFTOVER_SERVICES = ['off-grid-pro-license', 'off-grid-device-fingerprint'];
export const EARLIER_LOG_FILES = ['offgrid-debug.log', 'offgrid-wire.log'];
const LEFTOVERS_CLEARED_KEY = '@fieldkit/earlier_ids_cleared';

/**
 * Clear those leftovers, once. Best effort and off the boot path: a step that fails is logged and the
 * whole thing is tried again at the next launch, because the flag is set only when every step worked.
 */
export async function clearEarlierLeftovers(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(LEFTOVERS_CLEARED_KEY)) return;
    for (const service of EARLIER_LEFTOVER_SERVICES) {
      await Keychain.resetGenericPassword({ service });
    }
    for (const name of EARLIER_LOG_FILES) {
      const path = `${RNFS.DocumentDirectoryPath}/${name}`;
      if (await RNFS.exists(path)) await RNFS.unlink(path);
    }
    await AsyncStorage.setItem(LEFTOVERS_CLEARED_KEY, '1');
  } catch (error) {
    logger.warn('[EarlierIds] Could not clear what an earlier version left; trying again next launch', error);
  }
}
