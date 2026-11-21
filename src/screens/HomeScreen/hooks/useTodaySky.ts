import { useMemo } from 'react';
import { useHomePlaceStore } from '../../../features/home/homePlace';
import { todaySky, type TodaySky } from '../../../features/home/todaySky';

export interface TodayClock {
  /** The instant the sky was worked out for; the header's date line uses it too, so the two never disagree. */
  now: Date;
  /** Today's sky for the home place; null while no place is set. */
  sky: TodaySky | null;
}

/** Today's sky for the home place, worked out again each time Home gains focus. */
export function useTodaySky(focusTrigger: number): TodayClock {
  const place = useHomePlaceStore((s) => s.place);
  // focusTrigger is only the cue to read the clock again.
  return useMemo(() => {
    const now = new Date();
    return { now, sky: place ? todaySky(place, now) : null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, focusTrigger]);
}
