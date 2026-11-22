import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertQueue, AlertState, dismissAlert, enqueueAlert, shownAlert } from '../utils/alertState';

/**
 * A screen's alert slot that never loses an alert: the same `alertState` / `setAlertState` pair as a
 * `useState<AlertState>`, but an alert raised while another is on screen waits its turn.
 *
 * `setAlertState(showAlert(...))` queues the alert. `setAlertState(hideAlert())` closes the alert
 * on screen. Closing is by the alert that was on screen, so a button that closes its alert before the
 * sheet's own close runs does not also close the next alert waiting.
 *
 * `alertKey` changes when a different alert comes to the front, and stays as it was when the queue
 * empties. Put it as the `key` of the screen's `CustomAlert`: each alert then gets its own sheet, so one
 * that was closed by Done, Back or a swipe is replaced by the next instead of the sheet staying shut
 * while the parent still asks for it open. The last alert keeps its sheet and slides out.
 */
export function useAlertQueue(): {
  alertState: AlertState;
  setAlertState: (next: AlertState) => void;
  alertKey: number;
} {
  const [queue, setQueue] = useState<AlertQueue>([]);
  const alertState = shownAlert(queue);
  const frontAlert = queue[0];
  const keys = useRef({ ids: new WeakMap<AlertState, number>(), next: 0, last: 0 });
  if (frontAlert) {
    const { ids } = keys.current;
    if (!ids.has(frontAlert)) ids.set(frontAlert, (keys.current.next += 1));
    keys.current.last = ids.get(frontAlert) as number;
  }
  const onScreen = useRef(alertState);
  useEffect(() => { onScreen.current = alertState; }, [alertState]);

  const setAlertState = useCallback((next: AlertState) => {
    if (next.visible) {
      setQueue(waiting => enqueueAlert(waiting, next));
      return;
    }
    const closed = onScreen.current;
    setQueue(waiting => dismissAlert(waiting, closed));
  }, []);

  return { alertState, setAlertState, alertKey: keys.current.last };
}
