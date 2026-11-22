import React from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { Button } from './Button';
import { useChatsUnreadable, retryLoadingChats } from '../stores/chatStore';

/** Shown on the Chats list while the saved chats cannot be read; Try again reads them at once. */
export const ChatsUnreadableNotice: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const unreadable = useChatsUnreadable();
  if (!unreadable) return null;

  return (
    <View style={styles.notice} accessibilityRole="alert" testID="chats-unreadable-notice">
      <Icon name="alert-triangle" size={16} color={colors.error} style={styles.icon} />
      <View style={styles.body}>
        <Text style={styles.text}>
          Your saved chats could not be read. New chats will not be kept until they can be.
        </Text>
        <Button
          title="Try again"
          variant="outline"
          size="small"
          onPress={() => { retryLoadingChats().catch(() => {}); }}
          style={styles.button}
          testID="chats-unreadable-retry"
        />
      </View>
    </View>
  );
};

const createStyles = (colors: ThemeColors) => ({
  notice: {
    flexDirection: 'row' as const,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.errorBackground,
  },
  icon: {
    marginTop: 2,
    marginRight: SPACING.sm,
  },
  body: {
    flex: 1,
  },
  text: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.text,
  },
  button: {
    alignSelf: 'flex-start' as const,
    marginTop: SPACING.sm,
  },
});
