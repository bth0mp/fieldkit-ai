import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabBarButtonProps, BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { SPACING } from '../constants';
import { useAppStore } from '../stores';
import { useActiveTextModel } from '../hooks/useActiveTextModel';
import { triggerHaptic } from '../utils/haptics';
import type { MainTabParamList, RootStackParamList } from './types';

type NavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'NewChatTab'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const SIZE = 56;

/**
 * The raised round New chat button in the middle of the tab bar. With a text or image model active it opens a
 * new chat; otherwise it opens the Models screen, where Use opens the new chat. It replaces the tab's own button,
 * so the tab itself is never focused.
 */
export const NewChatTabButton: React.FC<BottomTabBarButtonProps> = () => {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { modelId } = useActiveTextModel();
  const activeImageModelId = useAppStore((s) => s.activeImageModelId);

  const hasModel = !!modelId || !!activeImageModelId;

  const onPress = () => {
    triggerHaptic('selection');
    if (hasModel) navigation.navigate('Chat', {});
    else navigation.navigate('Models', { initialTab: 'text', afterUse: 'newChat' });
  };

  return (
    <View style={styles.slot}>
      <TouchableOpacity
        testID="new-chat-button"
        style={styles.button}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="New chat"
        accessibilityHint={hasModel ? undefined : 'Opens Models to choose a model first'}
      >
        <Icon name="plus" size={26} color={colors.background} />
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => ({
  slot: {
    flex: 1,
    alignItems: 'center' as const,
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    marginTop: -SPACING.xl,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.primary,
    borderWidth: SPACING.xs,
    borderColor: colors.surface,
    ...shadows.medium,
  },
});
