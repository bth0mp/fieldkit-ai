import React from 'react';
import { View, Text } from 'react-native';
import { AnimatedPressable } from '../../../components/AnimatedPressable';
import { Card } from '../../../components/Card';
import { useThemedStyles } from '../../../theme';
import type { ThemeColors } from '../../../theme';
import { TYPOGRAPHY, SPACING } from '../../../constants';
import { recentlyChanged, useChecklistStore } from '../../../features/checklists/checklistStore';
import { CardBar } from './CardBar';

type Props = {
  /** Opens the Checklists screen, on one list when given its id. */
  onOpen: (listId?: string) => void;
};

/** Home's Checklists card: the three lists changed most recently, each with how many items are ticked. */
export const ChecklistsCard: React.FC<Props> = ({ onOpen }) => {
  const styles = useThemedStyles(createStyles);
  const lists = useChecklistStore((s) => s.lists);
  const shown = recentlyChanged(lists, 3);

  return (
    <Card style={styles.card}>
      <AnimatedPressable style={styles.titleRow} hapticType="selection" accessibilityRole="button" onPress={() => onOpen()}>
        <Text style={styles.title}>Checklists</Text>
      </AnimatedPressable>
      {shown.length === 0 && (
        <AnimatedPressable testID="home-checklists-empty" style={styles.empty} hapticType="selection" onPress={() => onOpen()}>
          <Text style={styles.emptyText}>No lists yet. Start from a ready-made kit list.</Text>
        </AnimatedPressable>
      )}
      {shown.map((list, index) => {
        const done = list.items.filter((item) => item.done).length;
        return (
          <AnimatedPressable
            key={list.id}
            testID={`home-checklist-${index}`}
            style={styles.row}
            hapticType="selection"
            onPress={() => onOpen(list.id)}
          >
            <View style={styles.line}>
              <Text style={styles.name} numberOfLines={1}>{list.name}</Text>
              <Text style={styles.count} numberOfLines={1}>{`${done} of ${list.items.length}`}</Text>
            </View>
            <CardBar fraction={list.items.length > 0 ? done / list.items.length : 0} />
          </AnimatedPressable>
        );
      })}
    </Card>
  );
};

const createStyles = (colors: ThemeColors) => ({
  card: { marginBottom: 20, gap: SPACING.sm },
  titleRow: { minHeight: 44, justifyContent: 'center' as const },
  title: { ...TYPOGRAPHY.h3, color: colors.text },
  empty: { minHeight: 44, justifyContent: 'center' as const },
  emptyText: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted },
  row: { minHeight: 44, justifyContent: 'center' as const, gap: SPACING.xs },
  line: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.md },
  name: { ...TYPOGRAPHY.body, color: colors.text, flex: 1, minWidth: 0 },
  count: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted },
});
