import React from 'react';
import { View } from 'react-native';
import { useThemedStyles } from '../../../theme';
import type { ThemeColors } from '../../../theme';

type Props = {
  /** How full the bar is, from 0 to 1; anything outside is held to that range. */
  fraction: number;
};

/** The thin progress bar Home's cards share: storage used on the Phone card, items ticked on a list. */
export const CardBar: React.FC<Props> = ({ fraction }) => {
  const styles = useThemedStyles(createStyles);
  const clamped = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.round(clamped * 100)}%` }]} />
    </View>
  );
};

const createStyles = (colors: ThemeColors) => ({
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' as const },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
});
