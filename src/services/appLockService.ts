/**
 * Decides whether leaving the app locks it.
 *
 * Pickers, the camera, permission prompts, the share sheet and document viewers are screens the app opens itself.
 * The app marks that it is about to open one; a background event right after the mark is that screen opening, not the
 * person leaving, so it does not lock. If they then stay away for a long time the app locks on return. Every other
 * background event locks at once.
 */

/** A background event within this long of a mark is the marked system screen opening. */
const SYSTEM_SCREEN_START_MS = 3000;
/** Away longer than this (a minute) behind a system screen, and the app locks on return. */
const SYSTEM_SCREEN_MAX_AWAY_MS = 60 * 1000;

class AppLockService {
  private markedAt: number | null = null;
  private leftAt: number | null = null;

  /** Marks that the app is about to open a system screen. Call it right before the call that opens one. */
  openingSystemScreen(): void {
    this.markedAt = Date.now();
  }

  /**
   * The picker or permission request the app opened has answered, so a background event from here on is the person
   * leaving. Clears the start mark only: the time the app left stays, so returning after a long time still locks.
   * Call it after an awaited picker or permission request, never after Share.share, viewDocument or a form the
   * system opens in another app (those answer before the app leaves).
   */
  systemScreenClosed(): void {
    this.markedAt = null;
  }

  /** True when the app must lock now. False only for a marked system screen; it then remembers when it left. */
  leftForeground(now: number = Date.now()): boolean {
    const marked = this.markedAt !== null && now - this.markedAt <= SYSTEM_SCREEN_START_MS;
    if (!marked) {
      this.markedAt = null;
      this.leftAt = null;
      return true;
    }
    this.leftAt = now;
    return false;
  }

  /** True when the app left for a marked system screen more than the allowed time ago. Clears the mark either way. */
  returnedToForeground(now: number = Date.now()): boolean {
    const leftAt = this.leftAt;
    this.markedAt = null;
    this.leftAt = null;
    return leftAt !== null && now - leftAt > SYSTEM_SCREEN_MAX_AWAY_MS;
  }
}

export const appLockService = new AppLockService();
