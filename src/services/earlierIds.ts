/**
 * The only file that knows the ids an earlier version saved things under. A person who updates keeps the
 * app lock, saved server keys, downloaded models and downloads: each is read under its new id first and,
 * when that is empty, under the earlier one, then moved.
 */
import * as Keychain from 'react-native-keychain';
import logger from '../utils/logger';

export const EARLIER_AUTH_SERVICE = 'ai.offgridmobile.auth';
export const EARLIER_SERVERS_SERVICE = 'ai.offgridmobile.servers';

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
