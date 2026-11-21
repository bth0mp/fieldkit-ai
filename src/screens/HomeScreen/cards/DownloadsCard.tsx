import React from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { AnimatedPressable } from '../../../components/AnimatedPressable';
import { Card } from '../../../components/Card';
import { useTheme, useThemedStyles } from '../../../theme';
import type { ThemeColors } from '../../../theme';
import { TYPOGRAPHY, SPACING } from '../../../constants';
import { useDownloads } from '../../../hooks/useDownloads';
import { downloadSummary, type DownloadSummary } from '../../../features/home/downloadSummary';
import { useGuideLibraryStore } from '../../../features/guideLibrary/guideLibraryStore';
import { CardBar } from './CardBar';

type Props = {
  onOpen: (screen: DownloadSummary['opens']) => void;
};

/** Home's Downloads card: what is downloading, with one bar for the lot. Absent when nothing downloads. */
export const DownloadsCard: React.FC<Props> = ({ onOpen }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { active } = useDownloads();
  const guides = useGuideLibraryStore((s) => s.guides);
  const batch = useGuideLibraryStore((s) => s.batch);
  const summary = downloadSummary(active, { guides, batch });
  if (!summary) return null;

  return (
    <AnimatedPressable testID="home-downloads" hapticType="selection" onPress={() => onOpen(summary.opens)}>
      <Card style={styles.card}>
        <View style={styles.line}>
          <Icon name="download" size={16} color={colors.textMuted} />
          <Text style={styles.title} numberOfLines={1}>{summary.title}</Text>
          {summary.count ? <Text style={styles.count} numberOfLines={1}>{summary.count}</Text> : null}
        </View>
        <View
          testID="home-downloads-bar"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(summary.fraction * 100) }}
        >
          <CardBar fraction={summary.fraction} />
        </View>
      </Card>
    </AnimatedPressable>
  );
};

const createStyles = (colors: ThemeColors) => ({
  card: { marginBottom: 20, gap: SPACING.sm },
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.sm },
  title: { ...TYPOGRAPHY.body, color: colors.text, flex: 1 },
  count: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted },
});
