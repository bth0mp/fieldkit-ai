import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import MaterialIcon from 'react-native-vector-icons/MaterialIcons';
import { useThemedStyles, useTheme } from '../theme';
import type { ThemeColors } from '../theme';
import { createStyles } from './ModelCard.styles';
import { huggingFaceService } from '../services/huggingface';
import { ModelCredibility } from '../types';
import { triggerHaptic } from '../utils/haptics';
import { formatUpdatedAgo } from '../features/modelGuide/guide';
import type { RunAnswer } from '../services/runAnswer';
import { RunAnswerLine } from './RunAnswerLine';

interface CredibilityInfo {
  color: string;
  label: string;
}

// ── Compact header (name + author tag + optional downloads + description + type badges) ──

export interface RecommendedConfig {
  pillLabel?: string;
  /** An extra descriptive line for a curated/recommended model (e.g. "Up to 2x
   *  faster than CPU via GPU"). Rendered as part of the SAME common description
   *  line as every other card — not a separately coloured/positioned highlight. */
  highlightText?: string;
  // When provided, replaces the default modelType/paramCount/RAM chips in
  // compact mode. Lets curated entries surface custom badges (e.g. "Vision",
  // "GPU") instead of the auto-derived ones.
  chips?: string[];
}

/**
 * The ONE description string a card shows: the model's description plus any
 * recommended highlight line, deduped (a curated entry whose description IS its
 * highlight must not print twice) and joined. Rendered identically on every card
 * in the common muted description slot — no special-case colour or position.
 */
function cardDescription(description?: string, highlightText?: string): string | undefined {
  const parts = [description, highlightText].filter((v): v is string => !!v);
  const unique = parts.filter((v, i) => parts.indexOf(v) === i);
  return unique.length ? unique.join(' ') : undefined;
}

interface CompactModelCardContentProps {
  model: {
    name: string;
    author: string;
    description?: string;
    downloads?: number;
    downloadsAllTime?: number;
    likes?: number;
    lastModified?: string;
    modelType?: 'text' | 'vision' | 'code';
    paramCount?: number;
    minRamGB?: number;
  };
  /** One "Good for" phrase from the hand-written notes; labels are shown only when there is none. */
  goodFor?: string;
  labels?: string[];
  testID?: string;
  credibility?: ModelCredibility;
  credibilityInfo: CredibilityInfo | null;
  isTrending?: boolean;
  recommended?: RecommendedConfig;
  /** Model can run on the GPU/NPU (LiteRT or Q4_0/Q8_0 GGUF) → show the badge. */
  supportsAcceleration?: boolean;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// The number lines a card shows. Each part appears only when the model has it (a count of -1 or 0 means "not
// fetched" or "none"), and no line is returned when it would be empty.
function statsLine(m: { downloads?: number; downloadsAllTime?: number }): string | null {
  if (!m.downloads || m.downloads <= 0) return null;
  const allTime = m.downloadsAllTime && m.downloadsAllTime > 0 ? ` · ${formatNumber(m.downloadsAllTime)} all time` : '';
  return `${formatNumber(m.downloads)} ${m.downloads === 1 ? 'download' : 'downloads'} this month${allTime}`;
}

function likesUpdatedLine(m: { likes?: number; lastModified?: string }): string | null {
  const likes = m.likes && m.likes > 0 ? `${formatNumber(m.likes)} ${m.likes === 1 ? 'like' : 'likes'}` : null;
  const parts = [likes, formatUpdatedAgo(m.lastModified, new Date())].filter((p): p is string => !!p);
  return parts.length ? parts.join(' · ') : null;
}

type ModelType = 'text' | 'vision' | 'code';

function modelTypeLabel(modelType: ModelType): string {
  if (modelType === 'vision') return 'Vision';
  if (modelType === 'code') return 'Code';
  return 'Text';
}

function modelTypeBadgeStyle(
  styles: ReturnType<typeof createStyles>,
  modelType: ModelType,
) {
  if (modelType === 'vision') return styles.visionBadge;
  if (modelType === 'code') return styles.codeBadge;
  return null;
}

function modelTypeTextStyle(
  styles: ReturnType<typeof createStyles>,
  modelType: ModelType,
) {
  if (modelType === 'vision') return styles.visionText;
  if (modelType === 'code') return styles.codeText;
  return null;
}

const CompactStatLines: React.FC<{
  model: Parameters<typeof statsLine>[0] & Parameters<typeof likesUpdatedLine>[0];
  goodFor?: string;
  labels?: string[];
  testID?: string;
}> = ({ model, goodFor, labels, testID }) => {
  const styles = useThemedStyles(createStyles);
  const stats = statsLine(model);
  const likesUpdated = likesUpdatedLine(model);
  const guideLine = goodFor ? `Good for: ${goodFor}` : labels?.join(' · ');
  return (
    <>
      {!!stats && <Text style={styles.statsLine} testID={`${testID}-stats`}>{stats}</Text>}
      {!!likesUpdated && <Text style={styles.statsLine} testID={`${testID}-likes`}>{likesUpdated}</Text>}
      {!!guideLine && (
        <Text style={styles.statsLine} testID={`${testID}-${goodFor ? 'good-for' : 'labels'}`}>{guideLine}</Text>
      )}
    </>
  );
};

export const CompactModelCardContent: React.FC<CompactModelCardContentProps> = ({
  model,
  goodFor,
  labels,
  testID,
  credibility,
  credibilityInfo,
  isTrending,
  recommended,
  supportsAcceleration,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const description = cardDescription(model.description, recommended?.highlightText);

  return (
    <>
      <View style={styles.compactTopRow}>
        <View style={styles.compactNameGroup}>
          <Text style={[styles.name, styles.compactName, recommended && styles.compactNameRecommended]} numberOfLines={1}>
            {model.name}
          </Text>
          <View style={styles.authorTag}>
            <Text style={styles.authorTagText}>{model.author}</Text>
          </View>
          {credibilityInfo && (
            <View style={[styles.credibilityBadge, { backgroundColor: `${credibilityInfo.color}25` }]}>
              {credibility?.source === 'lmstudio' && (
                <Text style={[styles.credibilityIcon, { color: credibilityInfo.color }]}>★</Text>
              )}
              <Text style={[styles.credibilityText, { color: credibilityInfo.color }]}>
                {credibilityInfo.label}
              </Text>
            </View>
          )}
          {(isTrending || recommended) && <MaterialIcon name="whatshot" size={14} color={colors.trending} />}
          {recommended && (
            <View style={styles.recommendedPill}>
              <Text style={styles.recommendedPillText}>{recommended.pillLabel ?? 'Recommended'}</Text>
            </View>
          )}
        </View>
      </View>
      {/* One common description line for EVERY compact card: model description +
          any recommended highlight, same slot (under the name), same muted style. */}
      {!!description && (
        <Text style={styles.descriptionCompact} numberOfLines={2}>
          {description}
        </Text>
      )}
      <CompactStatLines model={model} goodFor={goodFor} labels={labels} testID={testID} />
      {recommended?.chips && recommended.chips.length > 0 ? (
        <View style={[styles.infoRow, styles.infoRowCompact]}>
          {recommended.chips.map(chip => (
            <View key={chip} style={styles.recommendedChip}>
              <Text style={styles.recommendedChipText}>{chip}</Text>
            </View>
          ))}
        </View>
      ) : (model.modelType || model.paramCount || supportsAcceleration) && (
        <View style={[styles.infoRow, styles.infoRowCompact]}>
          {/* Capability badge: this model can run on the GPU/NPU (a LiteRT model or a
              Q4_0/Q8_0 GGUF). K-quants silently fall back to CPU, so they get no badge. */}
          {supportsAcceleration && (
            <View style={styles.accelBadge} testID="npu-gpu-badge">
              <Text style={styles.accelBadgeText}>NPU/GPU</Text>
            </View>
          )}
          {model.modelType && (
            <View style={[styles.infoBadge, modelTypeBadgeStyle(styles, model.modelType)]}>
              <Text style={[styles.infoText, modelTypeTextStyle(styles, model.modelType)]}>
                {modelTypeLabel(model.modelType)}
              </Text>
            </View>
          )}
          {model.paramCount && (
            <View style={styles.infoBadge}>
              <Text style={styles.infoText}>{model.paramCount}B params</Text>
            </View>
          )}
          {model.minRamGB && (
            <View style={styles.infoBadge}>
              <Text style={styles.infoText}>{model.minRamGB}GB+ RAM</Text>
            </View>
          )}
        </View>
      )}
    </>
  );
};

// ── Standard (non-compact) header ──

interface StandardModelCardContentProps {
  model: {
    name: string;
    author: string;
    description?: string;
  };
  credibility?: ModelCredibility;
  credibilityInfo: CredibilityInfo | null;
  isActive?: boolean;
  recommended?: RecommendedConfig;
  /** Model can run on the GPU/NPU (LiteRT or Q4_0/Q8_0 GGUF) → show the badge. */
  supportsAcceleration?: boolean;
  /** One "Good for" phrase; the line shows only when it is passed. */
  goodFor?: string;
  testID?: string;
}

export const StandardModelCardContent: React.FC<StandardModelCardContentProps> = ({
  model,
  credibility,
  credibilityInfo,
  isActive,
  recommended,
  supportsAcceleration,
  goodFor,
  testID,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const description = cardDescription(model.description, recommended?.highlightText);

  return (
    <>
      <Text style={styles.name}>{model.name}</Text>
      <View style={styles.authorRow}>
        <View style={styles.authorTag}>
          <Text style={styles.authorTagText}>{model.author}</Text>
        </View>
        {credibilityInfo && (
          <View style={[styles.credibilityBadge, { backgroundColor: `${credibilityInfo.color}25` }]}>
            {credibility?.source === 'lmstudio' && (
              <Text style={[styles.credibilityIcon, { color: credibilityInfo.color }]}>★</Text>
            )}
            {credibility?.source === 'official' && (
              <Text style={[styles.credibilityIcon, { color: credibilityInfo.color }]}>✓</Text>
            )}
            {credibility?.source === 'verified-quantizer' && (
              <Text style={[styles.credibilityIcon, { color: credibilityInfo.color }]}>◆</Text>
            )}
            <Text style={[styles.credibilityText, { color: credibilityInfo.color }]}>
              {credibilityInfo.label}
            </Text>
          </View>
        )}
        {isActive && (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>
        )}
        {recommended && (
          <>
            <MaterialIcon name="whatshot" size={14} color={colors.trending} />
            <View style={styles.recommendedPill}>
              <Text style={styles.recommendedPillText}>{recommended.pillLabel ?? 'Recommended'}</Text>
            </View>
          </>
        )}
        {/* GPU/NPU capability badge — a LiteRT or Q4_0/Q8_0 quant this device can accelerate. */}
        {supportsAcceleration && (
          <View style={styles.accelBadge} testID="npu-gpu-badge">
            <Text style={styles.accelBadgeText}>NPU/GPU</Text>
          </View>
        )}
      </View>
      {!!description && (
        <Text style={styles.description} numberOfLines={2}>
          {description}
        </Text>
      )}
      {!!goodFor && <Text style={styles.statsLine} testID={`${testID}-good-for`}>{`Good for: ${goodFor}`}</Text>}
    </>
  );
};

// ── Info badges row (size, quant, vision, compatibility) ──

interface ModelInfoBadgesProps {
  fileSize: number;
  sizeRange: { min: number; max: number; count: number } | null;
  quantInfo: { quality: string; recommended: boolean } | null;
  quantization: string | undefined;
  isVisionModel: boolean;
  needsRepair: boolean;
  isRepairingVision?: boolean;
  isCompatible: boolean;
  incompatibleReason: string | undefined;
  /** When given, replaces the "Too large" badge with the run answer line. */
  runAnswer?: RunAnswer;
  testID?: string;
}

export const ModelInfoBadges: React.FC<ModelInfoBadgesProps> = ({
  fileSize,
  sizeRange,
  quantInfo,
  quantization,
  isVisionModel,
  needsRepair,
  isRepairingVision = false,
  isCompatible,
  incompatibleReason,
  runAnswer,
  testID,
}) => {
  const styles = useThemedStyles(createStyles);

  return (
    <>
      <View style={styles.infoRow}>
        {fileSize > 0 && (
          <View style={styles.infoBadge}>
            <Text style={styles.infoText}>{huggingFaceService.formatFileSize(fileSize)}</Text>
          </View>
        )}
        {sizeRange && (
          <View style={[styles.infoBadge, styles.sizeBadge]}>
            <Text style={styles.infoText}>
              {sizeRange.min === sizeRange.max
                ? huggingFaceService.formatFileSize(sizeRange.min)
                : `${huggingFaceService.formatFileSize(sizeRange.min)} - ${huggingFaceService.formatFileSize(sizeRange.max)}`}
            </Text>
          </View>
        )}
        {sizeRange && (
          <View style={styles.infoBadge}>
            <Text style={styles.infoText}>
              {sizeRange.count} {sizeRange.count === 1 ? 'file' : 'files'}
            </Text>
          </View>
        )}
        {/* Any non-empty quantization renders as a label; llama quants get the green highlight via quantInfo. */}
        {!!quantization && (
          <View style={[styles.infoBadge, quantInfo?.recommended && styles.recommendedBadge]}>
            <Text style={[styles.infoText, quantInfo?.recommended && styles.recommendedText]}>
              {quantization}
            </Text>
          </View>
        )}
        {/* The quality chip needs quantInfo, so non-llama quant strings get no phantom chip. */}
        {quantInfo && (
          <View style={styles.infoBadge}>
            <Text style={styles.infoText}>{quantInfo.quality}</Text>
          </View>
        )}
        {isVisionModel && !needsRepair && (
          <View style={styles.visionBadge}>
            <Text style={styles.visionText}>Vision</Text>
          </View>
        )}
        {isVisionModel && needsRepair && (
          <View style={styles.warningBadge}>
            <Text style={styles.warningText}>{isRepairingVision ? 'Repairing...' : 'Needs repair'}</Text>
          </View>
        )}
        {!isCompatible && !runAnswer && (
          <View style={styles.warningBadge}>
            <Text style={styles.warningText}>{incompatibleReason ?? 'Too large'}</Text>
          </View>
        )}
      </View>
      {runAnswer && <RunAnswerLine runAnswer={runAnswer} testID={testID} />}
    </>
  );
};

// ── Action icon buttons (download / select / delete) ──

interface ModelCardActionsProps {
  isDownloaded: boolean | undefined;
  isDownloading: boolean | undefined;
  isActive: boolean | undefined;
  isCompatible: boolean;
  incompatibleReason: string | undefined;
  testID: string | undefined;
  onDownload: (() => void) | undefined;
  onSelect: (() => void) | undefined;
  /** Use is shown but cannot be pressed (a model is loading). */
  selectDisabled?: boolean;
  onDelete: (() => void) | undefined;
  onRepairVision: (() => void) | undefined;
  isRepairingVision?: boolean;
  onCancel: (() => void) | undefined;
  /** Names the Use button for a screen reader. */
  modelName?: string;
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

function ActionButton({ icon, color, haptic, onPress, disabled, testID, styles }: {
  icon: string; color: string; haptic: string; onPress: () => void;
  disabled?: boolean; testID?: string; styles: ReturnType<typeof createStyles>;
}) {
  return (
    <TouchableOpacity
      style={styles.iconButton}
      onPress={() => { triggerHaptic(haptic as any); onPress(); }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      testID={testID}
    >
      <Icon name={icon} size={16} color={color} />
    </TouchableOpacity>
  );
}

function DownloadedActions({ isActive, testID, colors, styles, onSelect, selectDisabled, onDelete, onRepairVision, isRepairingVision, modelName }: Readonly<{
  isActive?: boolean; testID?: string; colors: ThemeColors; styles: any; modelName?: string;
  onSelect?: () => void; selectDisabled?: boolean; onDelete?: () => void; onRepairVision?: () => void; isRepairingVision?: boolean;
}>) {
  const tid = (s: string) => testID ? `${testID}-${s}` : undefined;
  if (!onSelect && !onDelete && !onRepairVision) return <Icon name="check-circle" size={16} color={colors.primary} testID={tid('downloaded')} />;
  return (
    <>
      {isRepairingVision ? (
        <View style={styles.iconButton} testID={tid('repairing-vision')}>
          <ActivityIndicator size="small" color={colors.warning} />
        </View>
      ) : (
        onRepairVision && <ActionButton icon="tool" color={colors.warning} haptic="impactLight" onPress={onRepairVision} testID={tid('repair-vision')} styles={styles} />
      )}
      {!isActive && onSelect && (
        <TouchableOpacity
          style={[styles.useButton, selectDisabled && styles.useButtonDisabled]}
          onPress={() => { triggerHaptic('selection'); onSelect(); }}
          disabled={selectDisabled}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`Use ${modelName}`}
          testID={tid('use')}
        >
          <Text style={styles.useButtonText}>Use</Text>
        </TouchableOpacity>
      )}
      {onDelete && <ActionButton icon="trash-2" color={colors.error} haptic="notificationWarning" onPress={onDelete} styles={styles} />}
    </>
  );
}

export const ModelCardActions: React.FC<ModelCardActionsProps> = ({
  isDownloaded, isDownloading, isActive, isCompatible,
  testID, onDownload, onSelect, selectDisabled, onDelete, onRepairVision, isRepairingVision, onCancel, modelName,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const tid = (suffix: string) => testID ? `${testID}-${suffix}` : undefined;

  if (isDownloading && onCancel) {
    return <ActionButton icon="x" color={colors.error} haptic="notificationWarning" onPress={onCancel} testID={tid('cancel')} styles={styles} />;
  }
  if (!isDownloaded && onDownload) {
    return <ActionButton icon="download" color={colors.primary} haptic="impactLight" onPress={onDownload} disabled={!isCompatible} testID={tid('download')} styles={styles} />;
  }
  if (isDownloaded) {
    return <DownloadedActions isActive={isActive} testID={testID} colors={colors} styles={styles} modelName={modelName} onSelect={onSelect} selectDisabled={selectDisabled} onDelete={onDelete} onRepairVision={onRepairVision} isRepairingVision={isRepairingVision} />;
  }
  return null;
};


