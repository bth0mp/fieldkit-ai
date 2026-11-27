import * as Keychain from 'react-native-keychain';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import logger from '../utils/logger';
import { EARLIER_AUTH_SERVICE, readKeychainEntry } from './earlierIds';

const SERVICE_NAME = 'com.bth0mp.fieldkit.auth';
const PASSPHRASE_KEY = 'passphrase_hash';

const RECORD_PREFIX = 'pbkdf2-sha256$';
// A saved record carries its own count, so raising this rehashes at the next unlock.
// ponytail: pure-JS PBKDF2 on Hermes costs about 0.15 ms an iteration (4.9 s for 32768 on an emulator release
// build), and the JS thread is frozen meanwhile, so 2048 (about 0.3 s) is the ceiling. The lock gates the screen,
// not the data (chats are stored unencrypted), so more iterations buy little. Move to native PBKDF2
// (SecretKeyFactory / CommonCrypto) if the passphrase ever encrypts data.
const PBKDF2_ITERATIONS = 2048;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
// A saved count above this is treated as tampered, so a bad record cannot hang the JS thread.
const MAX_ITERATIONS = 65536;

class AuthService {
  /** The full record to store: `pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>`. */
  private hashPassphrase(passphrase: string, salt: Uint8Array, iterations: number): string {
    const key = pbkdf2(sha256, passphrase, salt, { c: iterations, dkLen: KEY_BYTES });
    return `${RECORD_PREFIX}${iterations}$${bytesToHex(salt)}$${bytesToHex(key)}`;
  }

  private newSalt(): Uint8Array {
    const salt = new Uint8Array(SALT_BYTES);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      return crypto.getRandomValues(salt);
    }
    // ponytail: a salt must be unique, not secret, so Math.random bytes will do where Hermes has no crypto.getRandomValues.
    for (let i = 0; i < SALT_BYTES; i++) salt[i] = Math.floor(Math.random() * 256);
    return salt;
  }

  /** The count and salt of a saved record, or null when it does not parse. */
  private parseRecord(record: string): { iterations: number; salt: Uint8Array } | null {
    const parts = record.split('$');
    if (parts.length !== 4 || !/^\d+$/.test(parts[1]) || !/^([0-9a-f]{2})+$/.test(parts[2]) || !/^[0-9a-f]{64}$/.test(parts[3])) {
      return null;
    }
    const iterations = Number(parts[1]);
    if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) return null;
    return { iterations, salt: hexToBytes(parts[2]) };
  }

  /** The hash earlier versions saved. Kept as it was, only to check those saved records once. */
  private legacyHash(passphrase: string): string {
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
      const hash = this.hashPassphrase(passphrase, this.newSalt(), PBKDF2_ITERATIONS);
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
    const saved = credentials.password;
    if (!saved.startsWith(RECORD_PREFIX)) {
      // Saved by an earlier version: one check with the old hash, then it is replaced.
      if (this.legacyHash(passphrase) !== saved) return false;
      await this.upgradeRecord(passphrase);
      return true;
    }
    const parsed = this.parseRecord(saved);
    if (!parsed) return false;
    if (this.hashPassphrase(passphrase, parsed.salt, parsed.iterations) !== saved) return false;
    if (parsed.iterations < PBKDF2_ITERATIONS) await this.upgradeRecord(passphrase);
    return true;
  }

  /** Rewrite the saved record with the current hash. A failed rewrite is logged; the person is still let in. */
  private async upgradeRecord(passphrase: string): Promise<void> {
    if (!(await this.setPassphrase(passphrase))) {
      logger.warn('Could not move the saved passphrase to the current hash; it stays as it was');
    }
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
