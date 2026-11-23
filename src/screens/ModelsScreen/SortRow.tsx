import React from 'react';
import { Text, ScrollView, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../../theme';
import { SPACING } from '../../constants';
import { createStyles } from './styles';

interface SortRowOption<K extends string> {
  key: K;
  label: string;
  icon: string;
}

interface SortRowProps<K extends string> {
  options: SortRowOption<K>[];
  /** The chosen option; undefined while none is (the list keeps its own order). */
  selected: K | undefined;
  onSelect: (key: K) => void;
  /** Each chip's testID is `${testIDPrefix}-${key}`. */
  testIDPrefix: string;
}

/** Inside the row's own padding, so the 36 dp chips take a 48 dp touch. */
const SORT_HIT_SLOP = { top: SPACING.sm, bottom: SPACING.sm };

export function SortRow<K extends string>({ options, selected, onSelect, testIDPrefix }: SortRowProps<K>) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.sortRow} contentContainerStyle={styles.sortRowContent}>
      {options.map(option => (
        <TouchableOpacity key={option.key} testID={`${testIDPrefix}-${option.key}`} hitSlop={SORT_HIT_SLOP} accessibilityLabel={option.label} style={[styles.filterChip, selected === option.key && styles.filterChipActive]} onPress={() => onSelect(option.key)} accessibilityRole="button" accessibilityState={{ selected: selected === option.key }}>
          <Icon name={option.icon} size={12} color={selected === option.key ? colors.primary : colors.textSecondary} />
          <Text style={[styles.filterChipText, selected === option.key && styles.filterChipTextActive]}>{option.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
