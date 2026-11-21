import { useMemo } from 'react';
import { useHomePlaceStore } from '../../../features/home/homePlace';
import { todaySky, type TodaySky } from '../../../features/home/todaySky';

/** Today's sky for the home place, worked out again each time Home gains focus; null with no place. */
export function useTodaySky(focusTrigger: number): TodaySky | null {
  const place = useHomePlaceStore((s) => s.place);
  // focusTrigger is only the cue to read the clock again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (place ? todaySky(place, new Date()) : null), [place, focusTrigger]);
}
