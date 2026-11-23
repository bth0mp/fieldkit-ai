import React from 'react';
import { Text } from 'react-native';
import { useThemedStyles } from '../theme';
import { createStyles } from './ModelCard.styles';
import { formatUpdatedAgo } from '../features/modelGuide/guide';
import type { RunAnswer } from '../services/runAnswer';
import { RunAnswerLine } from './RunAnswerLine';
import { OriginLine } from './OriginLine';

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

/** A compact card's detail lines, in order: run answer, Original, the numbers, then Good for (or labels). */
export const CompactStatLines: React.FC<{
  model: Parameters<typeof statsLine>[0] & Parameters<typeof likesUpdatedLine>[0];
  goodFor?: string;
  labels?: string[];
  runAnswer?: RunAnswer;
  origin?: string;
  testID?: string;
}> = ({ model, goodFor, labels, runAnswer, origin, testID }) => {
  const styles = useThemedStyles(createStyles);
  const stats = statsLine(model);
  const likesUpdated = likesUpdatedLine(model);
  const guideLine = goodFor ? `Good for: ${goodFor}` : labels?.join(' · ');
  return (
    <>
      {runAnswer && <RunAnswerLine runAnswer={runAnswer} testID={testID} />}
      <OriginLine origin={origin} testID={testID} />
      {!!stats && <Text style={styles.statsLine} testID={`${testID}-stats`}>{stats}</Text>}
      {!!likesUpdated && <Text style={styles.statsLine} testID={`${testID}-likes`}>{likesUpdated}</Text>}
      {!!guideLine && (
        <Text style={styles.statsLine} testID={`${testID}-${goodFor ? 'good-for' : 'labels'}`}>{guideLine}</Text>
      )}
    </>
  );
};
