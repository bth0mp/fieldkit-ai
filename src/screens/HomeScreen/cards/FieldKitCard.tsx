import React from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { Card } from '../../../components/Card';
import { AnimatedPressable } from '../../../components/AnimatedPressable';
import { useTheme, useThemedStyles } from '../../../theme';
import type { ThemeColors } from '../../../theme';
import { TYPOGRAPHY, SPACING } from '../../../constants';
import { KIT_ITEMS } from '../../KitScreen';

type KitRoute = (typeof KIT_ITEMS)[number]['screen'];

type Props = {
  onOpen: (screen: KitRoute) => void;
};

/** Home's Field kit card: one button per tool in the Field kit tab, each opening that tool. */
export const FieldKitCard: React.FC<Props> = ({ onOpen }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Field kit</Text>
      <View style={styles.buttons}>
        {KIT_ITEMS.map((item) => (
          <AnimatedPressable
            key={item.screen}
            testID={`home-kit-${item.short.toLowerCase()}`}
            accessibilityLabel={item.title}
            style={styles.button}
            hapticType="selection"
            onPress={() => onOpen(item.screen)}
          >
            <Icon name={item.icon} size={20} color={colors.primary} />
            <Text style={styles.buttonLabel} numberOfLines={1}>{item.short}</Text>
          </AnimatedPressable>
        ))}
      </View>
    </Card>
  );
};

const createStyles = (colors: ThemeColors) => ({
  card: { marginBottom: 20, gap: SPACING.md },
  title: { ...TYPOGRAPHY.h3, color: colors.text },
  buttons: { flexDirection: 'row' as const, gap: SPACING.sm },
  button: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center' as const,
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonLabel: { ...TYPOGRAPHY.bodySmall, color: colors.text },
});
