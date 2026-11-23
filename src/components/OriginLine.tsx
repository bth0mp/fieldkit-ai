import React from 'react';
import { Text } from 'react-native';
import { useThemedStyles } from '../theme';
import { createStyles } from './ModelCard.styles';

/** The Hugging Face page a converted model came from, as `owner/name`. */
export const OriginLine: React.FC<{ origin?: string; testID?: string }> = ({ origin, testID }) => {
  const styles = useThemedStyles(createStyles);
  if (!origin) return null;
  return <Text style={styles.statsLine} testID={`${testID}-origin`}>{`Original: ${origin}`}</Text>;
};
