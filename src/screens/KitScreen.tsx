import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { useFocusTrigger } from '../hooks/useFocusTrigger';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { RootStackParamList, MainTabParamList } from '../navigation/types';

type NavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'KitTab'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const KIT_ITEMS = [
  { icon: 'book-open', title: 'Guide library', desc: 'Free guides to download and use offline', screen: 'GuideLibrary' as const, testID: 'kit-guide-library' },
  { icon: 'zap', title: 'Quick reference', desc: 'Signals, codes and scales at a glance', screen: 'QuickReference' as const, testID: 'kit-quick-reference' },
  { icon: 'hash', title: 'Calculators', desc: 'Units, grid references, sun and moon, distance, dates', screen: 'Calculators' as const, testID: 'kit-calculators' },
  { icon: 'check-square', title: 'Checklists', desc: 'Your own packing and check lists', screen: 'Checklists' as const, testID: 'kit-checklists' },
];

export const KitScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const focusTrigger = useFocusTrigger();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Field kit</Text>
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.navSection}>
          {KIT_ITEMS.map((item, index, arr) => (
            <AnimatedListItem
              key={item.screen}
              index={index}
              staggerMs={40}
              trigger={focusTrigger}
              testID={item.testID}
              style={[styles.navItem, index === arr.length - 1 && styles.navItemLast]}
              onPress={() => navigation.navigate(item.screen)}
            >
              <View style={styles.navItemIcon}>
                <Icon name={item.icon} size={16} color={colors.textSecondary} />
              </View>
              <View style={styles.navItemContent}>
                <Text style={styles.navItemTitle}>{item.title}</Text>
                <Text style={styles.navItemDesc}>{item.desc}</Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textMuted} />
            </AnimatedListItem>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, minHeight: 60,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface, ...shadows.small, zIndex: 1,
  },
  title: { ...TYPOGRAPHY.h2, color: colors.text },
  scrollView: { flex: 1 },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.xxl },
  navSection: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginBottom: SPACING.lg,
    overflow: 'hidden' as const,
    ...shadows.small,
  },
  navItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navItemLast: { borderBottomWidth: 0 },
  navItemIcon: {
    width: 28, height: 28, borderRadius: 6, backgroundColor: 'transparent',
    alignItems: 'center' as const, justifyContent: 'center' as const, marginRight: SPACING.md,
  },
  navItemContent: { flex: 1 },
  navItemTitle: { ...TYPOGRAPHY.body, fontWeight: '400' as const, color: colors.text },
  navItemDesc: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted, marginTop: 2 },
});
