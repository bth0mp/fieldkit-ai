import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { AnimatedPressable } from '../../../components/AnimatedPressable';
import { Card } from '../../../components/Card';
import { HomePlaceSheet } from '../../../components/HomePlaceSheet';
import { useThemedStyles } from '../../../theme';
import type { ThemeColors } from '../../../theme';
import { TYPOGRAPHY, SPACING } from '../../../constants';
import type { TodaySky } from '../../../features/home/todaySky';

type Props = {
  /** Today's sky for the home place, read by Home for its date line too; null while no place is set. */
  sky: TodaySky | null;
};

/** Home's Today card: sunrise, sunset and moonrise for the place typed in Settings, or a prompt to type one. */
export const TodayCard: React.FC<Props> = ({ sky }) => {
  const styles = useThemedStyles(createStyles);
  const [editing, setEditing] = useState(false);

  const sun = !sky ? '' : sky.sunAllDay
    ? `Sun ${sky.sunAllDay} all day`
    : [sky.sunrise && `sunrise ${sky.sunrise}`, sky.sunset && `sunset ${sky.sunset}`].filter(Boolean).join('  ');
  const moon = sky?.moonrise ? `moonrise ${sky.moonrise}` : 'No moonrise today';

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Today</Text>
      {sky ? (
        <View style={styles.rows}>
          <Text testID="today-sun" style={styles.line} numberOfLines={1}>{sun}</Text>
          <Text testID="today-moon" style={styles.line} numberOfLines={1}>{moon}</Text>
        </View>
      ) : (
        <AnimatedPressable testID="today-set-place" style={styles.set} hapticType="selection" accessibilityRole="button" onPress={() => setEditing(true)}>
          <Text style={styles.setText}>Set your place</Text>
        </AnimatedPressable>
      )}
      <HomePlaceSheet visible={editing} onClose={() => setEditing(false)} />
    </Card>
  );
};

const createStyles = (colors: ThemeColors) => ({
  card: { marginBottom: 20, gap: SPACING.sm },
  title: { ...TYPOGRAPHY.h3, color: colors.text },
  rows: { gap: SPACING.xs },
  line: { ...TYPOGRAPHY.body, color: colors.text },
  set: { minHeight: 44, justifyContent: 'center' as const },
  setText: { ...TYPOGRAPHY.body, color: colors.primary },
});
