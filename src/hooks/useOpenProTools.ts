import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getRegisteredScreens } from '../navigation/screenRegistry';
import { RootStackParamList } from '../navigation/types';
import { PRO_TOOLS_SCREEN } from './useIsProActive';

/** True when the Pro Tools screen is registered (Pro module present). */
export function hasProToolsScreen(): boolean {
  return getRegisteredScreens().some(s => s.name === PRO_TOOLS_SCREEN);
}

/**
 * One callback for "open the Pro Tools destination", used everywhere the user can
 * reach pro tools (the chat quick-settings row and the Tools page header).
 *
 * When the Pro Tools screen (email/calendar + MCP servers) is registered, navigate
 * into it. Otherwise do nothing; callers only render the entry when it exists.
 *
 * Routing on the registered screen (not on a license flag) keeps this in step with
 * useIsProActive and the rest of the app's single definition of "Pro is active".
 */
export function useOpenProTools(): () => void {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return () => {
    if (hasProToolsScreen()) {
      navigation.navigate(PRO_TOOLS_SCREEN as any);
    }
  };
}
