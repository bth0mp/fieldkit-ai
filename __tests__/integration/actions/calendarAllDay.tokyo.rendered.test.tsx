/**
 * @jest-environment <rootDir>/__tests__/harness/timeZoneEnvironment.js
 * @jest-environment-options {"timeZone": "Asia/Tokyo"}
 */
// All-day calendar events on a phone east of UTC (UTC+9). The cases are in allDayCalendarCases.
import { allDayCalendarCases } from './allDayCalendarCases';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

// Rendered chat suites take seconds per test; the first one also pays the first render.
jest.setTimeout(40000);

describe('all-day calendar events in Tokyo', () => {
  allDayCalendarCases(-540);
});
