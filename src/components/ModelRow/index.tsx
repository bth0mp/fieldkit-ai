import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../../theme';
import { SPACING } from '../../constants';
import { createModelRowStyles } from './styles';

export interface ModelRowProps {
  /** Model display name (title line). */
  name: string;
  /** Primary meta, e.g. the formatted size ("2.41 GB"). */
  size: string;
  /** Secondary meta, e.g. the quant or engine ("Q4_0", "LiteRT"). */
  quant?: string;
  /** Show the Vision badge. */
  isVision?: boolean;
  /** Optional RAM-fit hint under the meta row (home sheet shows this; chat omits it). */
  ramHint?: string;
  /** Highlight as the active/selected model. */
  isActive?: boolean;
  /** Show the trailing checkmark (currently loaded). */
  isLoaded?: boolean;
  /** This model is being loaded right now — show a trailing spinner on the row itself. */
  loading?: boolean;
  /** Accent: text models use the primary (emerald) accent, image models the info accent. */
  variant?: 'text' | 'image';
  /** The model lives on a remote server: a cloud mark follows the name (id `${testID}-remote`). */
  remote?: boolean;
  /** Trailing status text, e.g. "In use". */
  status?: string;
  /** Trailing button (id `${testID}-action`, label "<label> <name>"); disabled with the row. */
  action?: { label: string; onPress: () => void };
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
}

/**
 * The one local-model row used by every model picker (chat + home). Purely
 * presentational — callers map their model shape to these props — so the two sheets
 * render an identical card and can't drift into differential designs.
 */
export const ModelRow: React.FC<ModelRowProps> = ({
  name, size, quant, isVision, ramHint, isActive, isLoaded, loading, variant = 'text', remote, status, action, disabled, onPress, testID,
}) => {
  const styles = useThemedStyles(createModelRowStyles);
  const { colors } = useTheme();
  const isImage = variant === 'image';
  const title = (
    <Text
      style={[styles.name, remote && styles.nameBesideMark, isActive && (isImage ? styles.nameSelectedImage : styles.nameSelectedText)]}
      numberOfLines={1}
    >
      {name}
    </Text>
  );
  return (
    <TouchableOpacity
      style={[styles.row, isActive && (isImage ? styles.rowSelectedImage : styles.rowSelectedText)]}
      onPress={onPress}
      disabled={disabled || !onPress}
      testID={testID}
    >
      <View style={styles.info}>
        {remote ? (
          <View style={styles.nameRow}>
            {title}
            <Icon name="cloud" size={14} color={colors.primary} testID={`${testID}-remote`} />
          </View>
        ) : title}
        <View style={styles.meta}>
          <Text style={styles.metaText}>{size}</Text>
          {!!quant && (
            <>
              <Text style={styles.separator}>•</Text>
              <Text style={styles.metaMuted}>{quant}</Text>
            </>
          )}
          {isVision && (
            <>
              <Text style={styles.separator}>•</Text>
              <View style={styles.visionBadge}>
                <Icon name="eye" size={10} color={colors.info} />
                <Text style={styles.visionBadgeText}>Vision</Text>
              </View>
            </>
          )}
        </View>
        {!!ramHint && <Text style={styles.ramHint}>{ramHint}</Text>}
      </View>
      {!!status && <Text style={styles.status}>{status}</Text>}
      {loading ? (
        <ActivityIndicator testID="model-row-loading" size="small" color={isImage ? colors.info : colors.primary} />
      ) : isLoaded ? (
        <View style={[styles.checkmark, isImage ? styles.checkmarkImage : styles.checkmarkText]}>
          <Icon name="check" size={16} color={colors.background} />
        </View>
      ) : null}
      {action && (
        <TouchableOpacity
          style={styles.action}
          onPress={action.onPress}
          disabled={disabled}
          hitSlop={{ top: SPACING.sm, bottom: SPACING.sm, left: SPACING.sm, right: SPACING.sm }}
          accessibilityRole="button"
          accessibilityLabel={`${action.label} ${name}`}
          testID={`${testID}-action`}
        >
          <Text style={styles.actionText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};
