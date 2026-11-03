import React from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { useChatStore } from '../stores';
import { useActionApprovalStore } from '../stores/actionApprovalStore';
import { actionApprovalService } from '../services/actions/actionApprovalService';
import { Button } from './Button';
import { Card } from './Card';

/**
 * The approval card above the composer: a tool call that sends or writes waits here for the user's tap.
 * Shows the first waiting request of the open conversation; a read-only projection of
 * useActionApprovalStore that hands the tap to actionApprovalService.
 */
export const ActionApprovalCard: React.FC = () => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const activeConversationId = useChatStore(s => s.activeConversationId);
  const head = useActionApprovalStore(s => s.pending.find(p => p.conversationId === activeConversationId));
  if (!head) return null;
  const decide = (decision: 'approved' | 'declined') => actionApprovalService.resolve({ id: head.id, decision });

  return (
    <Card style={styles.card} testID="approval-card">
      <View style={styles.headerRow}>
        <Icon name="shield" size={14} color={colors.primary} />
        <Text style={styles.title} numberOfLines={2}>{head.summary.title}</Text>
      </View>
      {head.summary.lines.length > 0 && <Text style={styles.lines}>{head.summary.lines.join('\n')}</Text>}
      <View style={styles.actionsRow}>
        <Button
          title="Decline"
          variant="secondary"
          size="small"
          icon={<Icon name="x" size={14} color={colors.text} />}
          onPress={() => decide('declined')}
          testID="approval-decline"
        />
        <Button
          title="Approve"
          variant="primary"
          size="small"
          icon={<Icon name="check" size={14} color={colors.primary} />}
          onPress={() => decide('approved')}
          testID="approval-approve"
        />
      </View>
    </Card>
  );
};

const createStyles = (colors: ThemeColors) => ({
  card: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING.sm,
  },
  title: {
    ...TYPOGRAPHY.h3,
    color: colors.text,
    flex: 1,
  },
  lines: {
    ...TYPOGRAPHY.bodySmall,
    color: colors.textSecondary,
    marginTop: SPACING.xs,
  },
  actionsRow: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
});
