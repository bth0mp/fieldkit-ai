import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useHomePlaceStore } from '../../../features/home/homePlace';
import { todaySky, type TodaySky } from '../../../features/home/todaySky';

export interface TodayClock {
  /** The instant the sky was worked out for; the header's date line uses it too, so the two never disagree. */
  now: Date;
  /** Today's sky for the home place; null while no place is set. */
  sky: TodaySky | null;
  /** Changes each time the clock is read again, for cards that re-read something of their own then. */
  tick: number;
}

/** Past local midnight by a moment, so the timer never fires on the old day. */
const MIDNIGHT_SLACK_MS = 500;

/**
 * Today's sky for the home place. The clock is read again when Home regains focus, when the app returns to the
 * foreground, and at the next local midnight, so a Home left open overnight shows the new day.
 */
export function useTodaySky(): TodayClock {
  const place = useHomePlaceStore((s) => s.place);
  const isFocused = useIsFocused();
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const wasFocused = useRef(isFocused);
  useEffect(() => {
    if (isFocused && !wasFocused.current) refresh();
    wasFocused.current = isFocused;
  }, [isFocused, refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);

  // One timer to the next local midnight, set again after every read of the clock.
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const timer = setTimeout(refresh, midnight - now.getTime() + MIDNIGHT_SLACK_MS);
    return () => clearTimeout(timer);
  }, [tick, refresh]);

  return useMemo(() => {
    const now = new Date();
    return { now, sky: place ? todaySky(place, now) : null, tick };
    // tick is only the cue to read the clock again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, tick]);
}
