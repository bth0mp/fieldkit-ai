import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { PulsatingIcon } from '../../components/onboarding/PulsatingIcon';
import { useTheme, useThemedStyles } from '../../theme';
import type { ThemeColors } from '../../theme';
import { TYPOGRAPHY, SPACING } from '../../constants';
import { BRAND } from '../../config/branding';
import { formatDay } from '../../features/home/todaySky';
import { useOffline } from '../../services/networkStatus';

const createStyles = (colors: ThemeColors) => ({
  header: {
    paddingHorizontal: 20,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    backgroundColor: colors.background,
  },
  nameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.sm,
  },
  searchButton: {
    marginLeft: 'auto' as const,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: colors.text,
  },
  detailRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.sm,
  },
  date: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textMuted,
  },
  offline: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.xs,
  },
  offlineText: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textMuted,
  },
});

type Props = {
  /** The instant Home's sky was worked out for, so the date and the sunset time agree. */
  now: Date;
  sunset: string | null;
  /** True once the page has scrolled: the date line and the Offline label step aside. */
  slim: boolean;
  showIcon: boolean;
  onOpenOnboarding: () => void;
  onOpenSearch: () => void;
};

/** Home's top bar: the app name, then the date and an Offline label while the phone has no connection. */
export const HomeHeader: React.FC<Props> = ({ now, sunset, slim, showIcon, onOpenOnboarding, onOpenSearch }) => {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const offline = useOffline();
  return (
    <View style={styles.header} testID="home-header">
      <View style={styles.nameRow}>
        <Text style={styles.title}>{BRAND.name}</Text>
        {showIcon && <PulsatingIcon onPress={onOpenOnboarding} />}
        <TouchableOpacity testID="home-search-button" style={styles.searchButton} onPress={onOpenSearch}
          accessibilityRole="button" accessibilityLabel="Search">
          <Icon name="search" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
      {!slim && (
        <View style={styles.detailRow}>
          <Text testID="home-date" style={styles.date}>
            {sunset ? `${formatDay(now)} · sunset ${sunset}` : formatDay(now)}
          </Text>
          {offline && (
            <View style={styles.offline}>
              <Icon name="wifi-off" size={14} color={colors.textMuted} />
              <Text testID="home-offline" style={styles.offlineText}>Offline</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};
