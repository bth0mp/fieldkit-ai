import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../../theme';
import { SPACING, TYPOGRAPHY } from '../../constants';
import type { ThemeColors } from '../../theme';
import type { NavigationProp } from './types';

/** Opens the offline "Which model?" guide. */
export const ModelGuideButton: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <TouchableOpacity testID="models-guide-button" style={styles.button} onPress={() => navigation.navigate('ModelGuide')}
      accessibilityRole="button" accessibilityLabel="Which model?">
      <Icon name="compass" size={16} color={colors.primary} />
      <Text style={styles.label}>Which model?</Text>
    </TouchableOpacity>
  );
};

const createStyles = (colors: ThemeColors) => ({
  button: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: SPACING.xs,
    minHeight: 44,
    paddingHorizontal: SPACING.lg,
  },
  label: { ...TYPOGRAPHY.body, color: colors.primary },
});
