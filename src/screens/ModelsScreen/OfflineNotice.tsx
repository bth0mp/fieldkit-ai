import React from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../../theme';
import { useOffline } from '../../services/networkStatus';
import { createStyles } from './styles';

/** Says the numbers and search need a connection, while the device reports none. */
export const OfflineNotice: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const offline = useOffline();
  if (!offline) return null;
  return (
    <View style={styles.offlineNotice}>
      <Icon name="wifi-off" size={14} color={colors.textMuted} />
      <Text testID="models-offline-notice" accessibilityLiveRegion="polite" style={styles.offlineNoticeText}>Needs a connection to search, sort or show download numbers.</Text>
    </View>
  );
};
