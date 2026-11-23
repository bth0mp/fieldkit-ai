/**
 * useResidentRows — the manager sheet's per-row residency projection, read from the OWNING service
 * (modelResidencyManager: the accounting of what is actually in RAM). One place maps the sheet's
 * modality rows onto residency types — no engine branching in the view, and every sheet that shows it
 * inherits the projection with zero wiring.
 *
 * The manager holds a plain (non-reactive) Map with no subscription, so this polls getResidents()
 * while the sheet is visible — the same approach the In-Memory list used.
 */
import { useEffect, useState } from 'react';
import { modelResidencyManager } from '../../services/modelResidency';
import type { Resident, ResidentType } from '../../services/modelResidency/policy';

/** The manager sheet's modality rows. Defined HERE (the lower-level projection) rather than in
 *  ModelsManagerSheet so the hook doesn't import the component — that was a dependency cycle
 *  (ModelsManagerSheet → useResidentRows → ModelsManagerSheet). The sheet re-exports it. */
export type ModelRowType = 'text' | 'image' | 'voice' | 'speech';

/** Sheet row → residency type. Voice is the TTS output engine; Speech is the Whisper STT input. */
const ROW_RESIDENT_TYPE: Record<ModelRowType, ResidentType> = {
  text: 'text',
  image: 'image',
  voice: 'tts',
  speech: 'whisper',
};

/** Pure: pick the resident (if any) backing each sheet row. */
function residentsByRow(residents: Resident[]): Partial<Record<ModelRowType, Resident>> {
  const out: Partial<Record<ModelRowType, Resident>> = {};
  (Object.keys(ROW_RESIDENT_TYPE) as ModelRowType[]).forEach((row) => {
    const match = residents.find((r) => r.type === ROW_RESIDENT_TYPE[row]);
    if (match) out[row] = match;
  });
  return out;
}

export function useResidentRows(active: boolean): Partial<Record<ModelRowType, Resident>> {
  const [byRow, setByRow] = useState<Partial<Record<ModelRowType, Resident>>>(
    () => residentsByRow(modelResidencyManager.getResidents()),
  );
  useEffect(() => {
    if (!active) return;
    // Keeps the old object when no row changed, so a screen reading it does not re-render every 300 ms.
    const tick = () => setByRow(prev => {
      const next = residentsByRow(modelResidencyManager.getResidents());
      const rows = Object.keys(ROW_RESIDENT_TYPE) as ModelRowType[];
      return rows.every(row => prev[row]?.key === next[row]?.key && prev[row]?.sizeMB === next[row]?.sizeMB) ? prev : next;
    });
    tick();
    const id = setInterval(tick, 300);
    return () => clearInterval(id);
  }, [active]);
  return byRow;
}

/** Eject one row's resident via the owning service (its registered unload runs; lazy-reload on next use). */
export function ejectResident(resident: Resident): Promise<boolean> {
  return modelResidencyManager.evictByKey(resident.key);
}
