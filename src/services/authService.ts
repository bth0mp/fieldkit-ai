import * as Keychain from 'react-native-keychain';
import logger from '../utils/logger';
import { EARLIER_AUTH_SERVICE, readKeychainEntry } from './earlierIds';

const SERVICE_NAME = 'com.bth0mp.fieldkit.auth';
const PASSPHRASE_KEY = 'passphrase_hash';

class AuthService {
  private hashPassphrase(passphrase: string): string {
    // Simple hash - in production, consider using bcrypt via native module
    // We use a deterministic hash since we're comparing hashes
    let hash = 0;
    for (let i = 0; i < passphrase.length; i++) {
      const char = passphrase.codePointAt(i) ?? 0;
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    // Add some complexity with multiple rounds
    const baseHash = Math.abs(hash).toString(16);
    let extendedHash = baseHash;
    for (let i = 0; i < 1000; i++) {
      let tempHash = 0;
      for (let j = 0; j < extendedHash.length; j++) {
        const char = extendedHash.codePointAt(j) ?? 0;
        tempHash = ((tempHash << 5) - tempHash) + char;
        tempHash = tempHash & tempHash;
      }
      extendedHash = Math.abs(tempHash).toString(16) + extendedHash.slice(0, 8);
    }
    return extendedHash;
  }

  async setPassphrase(passphrase: string): Promise<boolean> {
    try {
      const hash = this.hashPassphrase(passphrase);
      await Keychain.setGenericPassword(PASSPHRASE_KEY, hash, {
        service: SERVICE_NAME,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED,
      });
    } catch (error) {
      logger.error('Failed to set passphrase:', error);
      return false;
    }
    // The new entry wins on read, so an earlier one that cannot be cleared now does no harm.
    try {
      await Keychain.resetGenericPassword({ service: EARLIER_AUTH_SERVICE });
    } catch (error) {
      logger.warn('Could not clear the earlier passphrase entry:', error);
    }
    return true;
  }

  /**
   * Whether the passphrase is right. Throws PassphraseCheckUnavailable when the keychain cannot be read:
   * that is not a wrong passphrase, so it must not count toward a lockout, and it never unlocks.
   */
  async verifyPassphrase(passphrase: string): Promise<boolean> {
    let credentials: Awaited<ReturnType<typeof Keychain.getGenericPassword>>;
    try {
      credentials = await readKeychainEntry(SERVICE_NAME, EARLIER_AUTH_SERVICE, Keychain.ACCESSIBLE.WHEN_UNLOCKED);
    } catch (error) {
      logger.error('Failed to verify passphrase:', error);
      throw new PassphraseCheckUnavailable();
    }
    if (!credentials) {
      return false;
    }
    return this.hashPassphrase(passphrase) === credentials.password;
  }

  async hasPassphrase(): Promise<boolean> {
    try {
      const credentials = await readKeychainEntry(SERVICE_NAME, EARLIER_AUTH_SERVICE, Keychain.ACCESSIBLE.WHEN_UNLOCKED);
      return credentials !== false;
    } catch (error) {
      logger.error('Failed to check passphrase:', error);
      return false;
    }
  }

  /** Clears the entry under both services, so a removed lock cannot come back from the earlier one. */
  async removePassphrase(): Promise<boolean> {
    let removed = true;
    for (const service of [SERVICE_NAME, EARLIER_AUTH_SERVICE]) {
      try {
        await Keychain.resetGenericPassword({ service });
      } catch (error) {
        logger.error('Failed to remove passphrase:', error);
        removed = false;
      }
    }
    return removed;
  }

  async changePassphrase(oldPassphrase: string, newPassphrase: string): Promise<boolean> {
    const isValid = await this.verifyPassphrase(oldPassphrase);
    if (!isValid) {
      return false;
    }
    if (!(await this.setPassphrase(newPassphrase))) {
      throw new PassphraseSaveFailed();
    }
    return true;
  }
}

export const authService = new AuthService();

/** The keychain could not be read, so the passphrase could not be checked (not a wrong passphrase). */
export class PassphraseCheckUnavailable extends Error {
  constructor() {
    super("Couldn't check your passphrase. Try again.");
    this.name = 'PassphraseCheckUnavailable';
  }
}

/** The keychain refused the new passphrase; the old one is still stored (not a wrong current passphrase). */
export class PassphraseSaveFailed extends Error {
  constructor() {
    super("Couldn't save your new passphrase. Try again.");
    this.name = 'PassphraseSaveFailed';
  }
}
