import { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';

/**
 * Returns a number that changes the first time the screen gains focus, and never again.
 * Pass it as `trigger` to AnimatedEntry / AnimatedListItem.
 *
 * A trigger that changed on every focus would replay the staggered fade of every row on each tab visit, so a
 * list you have already seen would look half-empty for a moment each time you came back. This one changes once,
 * and a list you have already seen is shown at once.
 *
 * It listens for the first focus instead of reading useIsFocused, which re-renders the whole screen on every
 * tab switch, in and out.
 */
export function useFocusTrigger(): number {
  const navigation = useNavigation();
  const [trigger, setTrigger] = useState(() => (navigation.isFocused?.() ?? true ? 1 : 0));
  useEffect(() => {
    if (trigger === 1) return undefined;
    return navigation.addListener('focus', () => setTrigger(1));
  }, [navigation, trigger]);
  return trigger;
}
