/**
 * The place the user types in Settings, for sunrise, sunset and moonrise on Home. Nothing reads the phone's
 * location: the user types it. Only homePlaceService writes the store, which is the screens' read-only copy.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createHydrationGatedStorage } from '../../utils/hydrationGatedStorage';
import { positionOf } from '../../services/tools/coordinateTools';

export interface HomePlace { typed: string; lat: number; lon: number }

interface HomePlaceState { place: HomePlace | null }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const within = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;

/** The saved place when it is well formed; anything of another shape is left out, not trusted. */
function readPlace(saved: unknown): HomePlace | null {
  const place = isRecord(saved) ? saved.place : undefined;
  if (!isRecord(place) || typeof place.typed !== 'string' || !within(place.lat, 90) || !within(place.lon, 180)) return null;
  return { typed: place.typed, lat: place.lat, lon: place.lon };
}

const placeStorage = createHydrationGatedStorage<HomePlaceState>();

export const useHomePlaceStore = create<HomePlaceState>()(persist(
  (): HomePlaceState => ({ place: null }),
  {
    name: '@fieldkit/home_place',
    storage: placeStorage.storage,
    onRehydrateStorage: placeStorage.onRehydrateStorage(),
    merge: placeStorage.merge<HomePlaceState>((saved, current) => ({ ...current, place: readPlace(saved) })),
  },
));
placeStorage.attach(useHomePlaceStore);

export const homePlaceService = {
  /** Reads the typed text as a position and keeps it. Throws an Error written for the user when it can't. */
  set(typed: string): HomePlace {
    const trimmed = typed.trim();
    if (!trimmed) throw new Error('Type a place first.');
    const { lat, lon } = positionOf(trimmed);
    const place = { typed: trimmed, lat, lon };
    useHomePlaceStore.setState({ place });
    return place;
  },

  clear(): void {
    useHomePlaceStore.setState({ place: null });
  },
};
