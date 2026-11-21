/**
 * Fake of @react-native-community/netinfo, the device boundary for connectivity. jest.setup.ts registers it as
 * the module's mock. The test and the screen must share one instance, so a test that resets modules requires
 * this file again after the reset.
 */
type Listener = (state: { isConnected: boolean | null }) => void;
export interface NetInfoConfiguration {
  reachabilityShouldRun?: () => boolean;
  shouldFetchWiFiSSID?: boolean;
}

const listeners = new Set<Listener>();
let connected: boolean | null = true;
let config: NetInfoConfiguration | undefined;

const NetInfo = {
  configure: (next: NetInfoConfiguration) => { config = next; },
  addEventListener: (listener: Listener) => {
    listeners.add(listener);
    listener({ isConnected: connected });
    return () => { listeners.delete(listener); };
  },
};

export const netInfoFake = {
  /** Reports a connection change to every registered listener. */
  setConnected(next: boolean): void {
    connected = next;
    listeners.forEach((listener) => listener({ isConnected: next }));
  },
  lastConfig(): NetInfoConfiguration | undefined { return config; },
};

export default NetInfo;
