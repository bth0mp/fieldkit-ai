import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

let configured = false;

/** Keeps NetInfo off the network and off the Wi-Fi name, which needs location on Android. Runs once. */
function configureNetInfo(): void {
  if (configured) return;
  configured = true;
  NetInfo.configure({ reachabilityShouldRun: () => false, shouldFetchWiFiSSID: false });
}

/** True only while the device reports that it has no connection. An unknown state counts as online. */
export function useOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    configureNetInfo();
    return NetInfo.addEventListener((state) => setOffline(state.isConnected === false));
  }, []);
  return offline;
}
