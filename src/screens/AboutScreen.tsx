import React from 'react';
import { View, Text, TouchableOpacity, Linking, ScrollView, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { SPACING, TYPOGRAPHY } from '../constants';
import { AnimatedListItem } from '../components/AnimatedListItem';
import { useFocusTrigger } from '../hooks/useFocusTrigger';
import { BRAND } from '../config/branding';
import { RootStackParamList } from '../navigation/types';
import packageJson from '../../package.json';

export const AboutScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const focusTrigger = useFocusTrigger();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* App identity */}
        <View style={styles.heroSection}>
          <Image source={require('../assets/logo.png')} style={staticStyles.appIcon} />
          <Text style={styles.appName}>{BRAND.name}</Text>
          <Text style={styles.version}>Version {packageJson.version}</Text>
          <Text style={styles.description}>
            Local AI that runs entirely on your phone. No cloud, no telemetry, nothing leaves the device.
          </Text>
        </View>

        <View style={styles.navSection}>
          <AnimatedListItem
            index={0}
            staggerMs={40}
            trigger={focusTrigger}
            style={styles.navItem}
            onPress={() => Linking.openURL(BRAND.repoUrl)}
          >
            <View style={styles.navItemIcon}>
              <Icon name="github" size={16} color={colors.textSecondary} />
            </View>
            <View style={styles.navItemContent}>
              <Text style={styles.navItemTitle}>Source Code</Text>
              <Text style={styles.navItemDesc}>View the source on GitHub</Text>
            </View>
            <Icon name="external-link" size={14} color={colors.textMuted} />
          </AnimatedListItem>
          <AnimatedListItem
            index={1}
            staggerMs={40}
            trigger={focusTrigger}
            style={[styles.navItem, styles.navItemLast]}
            testID="about-open-source-licenses"
            onPress={() => navigation.navigate('OpenSourceLicenses')}
          >
            <View style={styles.navItemIcon}>
              <Icon name="file-text" size={16} color={colors.textSecondary} />
            </View>
            <View style={styles.navItemContent}>
              <Text style={styles.navItemTitle}>Open-source licenses</Text>
              <Text style={styles.navItemDesc}>Software and models this app includes</Text>
            </View>
            <Icon name="chevron-right" size={16} color={colors.textMuted} />
          </AnimatedListItem>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const staticStyles = StyleSheet.create({
  appIcon: { width: 72, height: 72, borderRadius: 16, marginBottom: SPACING.md },
});

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.small,
    zIndex: 1,
  },
  backButton: { width: 36, padding: SPACING.xs },
  headerTitle: { ...TYPOGRAPHY.h2, color: colors.text },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  heroSection: {
    alignItems: 'center' as const,
    paddingVertical: SPACING.xxl,
    marginBottom: SPACING.xl,
  },
  appName: {
    ...TYPOGRAPHY.h1,
    color: colors.text,
    marginBottom: SPACING.xs,
  },
  version: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
    marginBottom: SPACING.md,
  },
  description: {
    ...TYPOGRAPHY.body,
    color: colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 22,
    paddingHorizontal: SPACING.md,
  },
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
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: SPACING.md,
  },
  navItemContent: { flex: 1 },
  navItemTitle: { ...TYPOGRAPHY.body, color: colors.text },
  navItemDesc: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted, marginTop: 2 },
});
