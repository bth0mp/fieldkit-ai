import React from 'react';
import { Text } from 'react-native';
import { useThemedStyles, useTheme } from '../theme';
import { createStyles } from './ModelCard.styles';
import type { RunAnswer } from '../services/runAnswer';

/** One line saying whether the model runs on this phone, coloured by the verdict. */
export const RunAnswerLine: React.FC<{ runAnswer: RunAnswer; testID?: string }> = ({ runAnswer, testID }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const color = { runs: colors.success, tight: colors.warning, wont: colors.error }[runAnswer.verdict];
  return <Text style={[styles.statsLine, { color }]} testID={`${testID}-run`}>{runAnswer.text}</Text>;
};
