/**
 * AuthService Unit Tests
 *
 * Tests for passphrase management: set, verify, check, remove, and change.
 * Uses react-native-keychain for secure storage (mocked in jest.setup.ts).
 */

// Override the global keychain mock to include ACCESSIBLE constant
jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(() => Promise.resolve(true)),
  getGenericPassword: jest.fn(() => Promise.resolve(false)),
  resetGenericPassword: jest.fn(() => Promise.resolve(true)),
  ACCESSIBLE: {
    WHEN_UNLOCKED: 'AccessibleWhenUnlocked',
    AFTER_FIRST_UNLOCK: 'AccessibleAfterFirstUnlock',
    ALWAYS: 'AccessibleAlways',
  },
}));

import { authService, PassphraseCheckUnavailable, PassphraseSaveFailed } from '../../../src/services/authService';
import * as Keychain from 'react-native-keychain';
import { EARLIER_AUTH_SERVICE } from '../../../src/services/earlierIds';

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ========================================================================
  // setPassphrase
  // ========================================================================
  describe('setPassphrase', () => {
    it('stores hashed passphrase in keychain and returns true', async () => {
      (Keychain.setGenericPassword as jest.Mock).mockResolvedValue(true);

      const result = await authService.setPassphrase('mySecret123');

      expect(result).toBe(true);
      expect(Keychain.setGenericPassword).toHaveBeenCalledTimes(1);
      expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
        'passphrase_hash',
        expect.any(String),
        expect.objectContaining({
          service: 'com.bth0mp.fieldkit.auth',
        }),
      );
    });

    it('returns false when keychain storage fails', async () => {
      (Keychain.setGenericPassword as jest.Mock).mockRejectedValue(
        new Error('Keychain unavailable'),
      );

      const result = await authService.setPassphrase('mySecret123');

      expect(result).toBe(false);
    });
  });

  // ========================================================================
  // verifyPassphrase
  // ========================================================================
  describe('verifyPassphrase', () => {
    it('returns true when passphrase matches stored hash', async () => {
      // First, capture the hash that setPassphrase stores
      let storedHash = '';
      (Keychain.setGenericPassword as jest.Mock).mockImplementation(
        (_key: string, hash: string) => {
          storedHash = hash;
          return Promise.resolve(true);
        },
      );

      await authService.setPassphrase('correctPassphrase');

      // Mock getGenericPassword to return the stored hash
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
        username: 'passphrase_hash',
        password: storedHash,
        service: 'com.bth0mp.fieldkit.auth',
      });

      const result = await authService.verifyPassphrase('correctPassphrase');

      expect(result).toBe(true);
    });

    it('returns false when passphrase does not match stored hash', async () => {
      let storedHash = '';
      (Keychain.setGenericPassword as jest.Mock).mockImplementation(
        (_key: string, hash: string) => {
          storedHash = hash;
          return Promise.resolve(true);
        },
      );

      await authService.setPassphrase('correctPassphrase');

      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
        username: 'passphrase_hash',
        password: storedHash,
        service: 'com.bth0mp.fieldkit.auth',
      });

      const result = await authService.verifyPassphrase('wrongPassphrase');

      expect(result).toBe(false);
    });

    it('returns false when no credentials are stored', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);

      const result = await authService.verifyPassphrase('anyPassphrase');

      expect(result).toBe(false);
    });

    it('says it could not check, not "wrong", when keychain retrieval fails', async () => {
      // A keychain that cannot be read is not a wrong passphrase: answering false charged the person an
      // attempt toward the lockout for typing the right one.
      (Keychain.getGenericPassword as jest.Mock).mockRejectedValue(
        new Error('Keychain error'),
      );

      await expect(authService.verifyPassphrase('anyPassphrase')).rejects.toBeInstanceOf(PassphraseCheckUnavailable);
    });
  });

  // ========================================================================
  // hasPassphrase
  // ========================================================================
  describe('hasPassphrase', () => {
    it('returns true when credentials exist in keychain', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
        username: 'passphrase_hash',
        password: 'somehash',
        service: 'com.bth0mp.fieldkit.auth',
      });

      const result = await authService.hasPassphrase();

      expect(result).toBe(true);
      expect(Keychain.getGenericPassword).toHaveBeenCalledWith({
        service: 'com.bth0mp.fieldkit.auth',
      });
    });

    it('returns false when no credentials exist', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);

      const result = await authService.hasPassphrase();

      expect(result).toBe(false);
    });

    it('returns false when keychain check fails', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockRejectedValue(
        new Error('Keychain error'),
      );

      const result = await authService.hasPassphrase();

      expect(result).toBe(false);
    });
  });

  // ========================================================================
  // removePassphrase
  // ========================================================================
  describe('removePassphrase', () => {
    it('resets keychain credentials and returns true', async () => {
      (Keychain.resetGenericPassword as jest.Mock).mockResolvedValue(true);

      const result = await authService.removePassphrase();

      expect(result).toBe(true);
      expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
        service: 'com.bth0mp.fieldkit.auth',
      });
    });

    it('also clears the entry an earlier version saved, and reports a failure of either', async () => {
      (Keychain.resetGenericPassword as jest.Mock).mockResolvedValue(true);
      expect(await authService.removePassphrase()).toBe(true);
      expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({ service: EARLIER_AUTH_SERVICE });

      (Keychain.resetGenericPassword as jest.Mock).mockClear();
      (Keychain.resetGenericPassword as jest.Mock).mockImplementation(({ service }: { service: string }) =>
        service === EARLIER_AUTH_SERVICE ? Promise.reject(new Error('locked')) : Promise.resolve(true));
      expect(await authService.removePassphrase()).toBe(false);
      expect(Keychain.resetGenericPassword).toHaveBeenCalledTimes(2);
    });

    it('returns false when keychain reset fails', async () => {
      (Keychain.resetGenericPassword as jest.Mock).mockRejectedValue(
        new Error('Keychain error'),
      );

      const result = await authService.removePassphrase();

      expect(result).toBe(false);
    });
  });

  // ========================================================================
  // changePassphrase
  // ========================================================================
  describe('changePassphrase', () => {
    it('changes passphrase when old passphrase is correct', async () => {
      // Set up initial passphrase
      let storedHash = '';
      (Keychain.setGenericPassword as jest.Mock).mockImplementation(
        (_key: string, hash: string) => {
          storedHash = hash;
          return Promise.resolve(true);
        },
      );

      await authService.setPassphrase('oldPass');

      // Mock getGenericPassword to return the stored hash for verification
      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
        username: 'passphrase_hash',
        password: storedHash,
        service: 'com.bth0mp.fieldkit.auth',
      });

      const result = await authService.changePassphrase('oldPass', 'newPass');

      expect(result).toBe(true);
      // setGenericPassword called twice: once for initial set, once for change
      expect(Keychain.setGenericPassword).toHaveBeenCalledTimes(2);
    });

    it('throws and stores nothing when the keychain cannot be read', async () => {
      (Keychain.getGenericPassword as jest.Mock).mockRejectedValue(new Error('Keychain error'));

      await expect(authService.changePassphrase('oldPass', 'newPass')).rejects.toBeInstanceOf(PassphraseCheckUnavailable);
      expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
    });

    it('throws, not "incorrect", when the new passphrase cannot be saved, and the old one still verifies', async () => {
      let stored = '';
      (Keychain.setGenericPassword as jest.Mock).mockImplementation((_k: string, hash: string) => {
        stored = hash;
        return Promise.resolve(true);
      });
      (Keychain.getGenericPassword as jest.Mock).mockImplementation(() =>
        Promise.resolve({ username: 'passphrase_hash', password: stored, service: 'com.bth0mp.fieldkit.auth' }),
      );
      await authService.setPassphrase('oldPass');

      (Keychain.setGenericPassword as jest.Mock).mockRejectedValue(new Error('Keychain write error'));
      await expect(authService.changePassphrase('oldPass', 'newPass')).rejects.toBeInstanceOf(PassphraseSaveFailed);

      expect(await authService.verifyPassphrase('oldPass')).toBe(true);
      expect(await authService.verifyPassphrase('newPass')).toBe(false);
    });

    it('returns false when old passphrase is incorrect', async () => {
      let storedHash = '';
      (Keychain.setGenericPassword as jest.Mock).mockImplementation(
        (_key: string, hash: string) => {
          storedHash = hash;
          return Promise.resolve(true);
        },
      );

      await authService.setPassphrase('oldPass');

      (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
        username: 'passphrase_hash',
        password: storedHash,
        service: 'com.bth0mp.fieldkit.auth',
      });

      const result = await authService.changePassphrase(
        'wrongOldPass',
        'newPass',
      );

      expect(result).toBe(false);
      // setGenericPassword called only once for the initial set, not for change
      expect(Keychain.setGenericPassword).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================================================
  // saved records (device-boundary Keychain fake)
  // ========================================================================
  describe('saved records', () => {
    const SERVICE = 'com.bth0mp.fieldkit.auth';
    const PASS = 'right passphrase';
    const fake = () => {
      const { keychainModule, wipeKeychain } = require('../../harness/keychainFake');
      wipeKeychain();
      const module = keychainModule();
      (Keychain.setGenericPassword as jest.Mock).mockImplementation(module.setGenericPassword);
      (Keychain.getGenericPassword as jest.Mock).mockImplementation(module.getGenericPassword);
      (Keychain.resetGenericPassword as jest.Mock).mockImplementation(module.resetGenericPassword);
    };
    const saved = async () => (await Keychain.getGenericPassword({ service: SERVICE })) as { password: string } | false;
    const put = (password: string) => Keychain.setGenericPassword('passphrase_hash', password, { service: SERVICE });
    const record = (iterations: number) => {
      const { pbkdf2 } = require('@noble/hashes/pbkdf2');
      const { sha256 } = require('@noble/hashes/sha2');
      const { bytesToHex } = require('@noble/hashes/utils');
      const salt = new Uint8Array(16).fill(7);
      return `pbkdf2-sha256$${iterations}$${bytesToHex(salt)}$${bytesToHex(pbkdf2(sha256, PASS, salt, { c: iterations, dkLen: 32 }))}`;
    };
    /** What an earlier version saved for the passphrase. */
    const oldHash = (passphrase: string) => {
      let hash = 0;
      for (let i = 0; i < passphrase.length; i++) {
        hash = ((hash << 5) - hash) + (passphrase.codePointAt(i) ?? 0);
        hash &= hash;
      }
      let extended = Math.abs(hash).toString(16);
      for (let i = 0; i < 1000; i++) {
        let temp = 0;
        for (let j = 0; j < extended.length; j++) {
          temp = ((temp << 5) - temp) + (extended.codePointAt(j) ?? 0);
          temp &= temp;
        }
        extended = Math.abs(temp).toString(16) + extended.slice(0, 8);
      }
      return extended;
    };

    beforeEach(() => {
      fake();
    });

    it.each([
      ['a bad field count', 'pbkdf2-sha256$1024$0707'],
      ['a non-hex salt', `pbkdf2-sha256$1024$zz07$${'a'.repeat(64)}`],
      ['zero iterations', `pbkdf2-sha256$0$0707$${'a'.repeat(64)}`],
      ['iterations above the ceiling', `pbkdf2-sha256$65537$0707$${'a'.repeat(64)}`],
    ])('does not unlock on a record with %s', async (_name, bad) => {
      await put(bad);
      await expect(authService.verifyPassphrase(PASS)).resolves.toBe(false);
      expect((await saved() as { password: string }).password).toBe(bad);
    });

    it('unlocks on a saved passphrase from an earlier version even when the rewrite fails, and leaves it as it was', async () => {
      await put(oldHash(PASS));
      (Keychain.setGenericPassword as jest.Mock).mockRejectedValueOnce(new Error('keychain write failed'));

      await expect(authService.verifyPassphrase(PASS)).resolves.toBe(true);
      expect((await saved() as { password: string }).password).toBe(oldHash(PASS));
    });

    it('rewrites a record with fewer iterations than now, and still unlocks', async () => {
      const old = record(1024);
      await put(old);

      await expect(authService.verifyPassphrase(PASS)).resolves.toBe(true);
      const now = (await saved() as { password: string }).password;
      expect(now).not.toBe(old);
      expect(now.split('$')[1]).toBe('2048');
      await expect(authService.verifyPassphrase(PASS)).resolves.toBe(true);
      await expect(authService.verifyPassphrase('other passphrase')).resolves.toBe(false);
    });
  });
});
