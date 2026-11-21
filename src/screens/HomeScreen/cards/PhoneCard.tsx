import React, { useEffect, useState } from 'react';
import { View, Text, InteractionManager } from 'react-native';
import { Card } from '../../../components/Card';
import { useThemedStyles } from '../../../theme';
import type { ThemeColors } from '../../../theme';
import { TYPOGRAPHY, SPACING } from '../../../constants';
import { hardwareService } from '../../../services/hardware';
import { CardRow } from './CardRow';

type Props = {
  /** Bumps each time Home comes into focus; the storage is read again then. */
  focusTrigger: number;
  /** Text models downloaded to the phone. */
  downloadedModelCount: number;
  /** Image models downloaded to the phone. */
  imageModelCount: number;
  imageCount: number;
  onOpenModels: () => void;
  onOpenGallery: () => void;
};

type Storage = { freeBytes: number; totalBytes: number };

/** Home's Phone card: free storage with a bar, downloaded models and the image gallery. */
export const PhoneCard: React.FC<Props> = ({
  focusTrigger, downloadedModelCount, imageModelCount, imageCount, onOpenModels, onOpenGallery,
}) => {
  const styles = useThemedStyles(createStyles);
  const [storage, setStorage] = useState<Storage | null>(null);

  // Read after Home has finished opening. A phone that cannot say leaves the storage line out.
  useEffect(() => {
    let current = true;
    const task = InteractionManager.runAfterInteractions(() => {
      hardwareService.getStorage()
        .then((s) => { if (current) setStorage(s); })
        .catch(() => { if (current) setStorage(null); });
    });
    return () => { current = false; task.cancel(); };
  }, [focusTrigger]);

  const used = storage && storage.totalBytes > 0
    ? Math.min(1, Math.max(0, (storage.totalBytes - storage.freeBytes) / storage.totalBytes))
    : 0;

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Phone</Text>
      {storage && (
        <View style={styles.storage}>
          <Text testID="home-phone-storage" style={styles.storageText} numberOfLines={1}>
            {`${hardwareService.formatBytes(storage.freeBytes)} free of ${hardwareService.formatBytes(storage.totalBytes)}`}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(used * 100)}%` }]} />
          </View>
        </View>
      )}
      <CardRow testID="home-phone-models" label="Models" value={`${downloadedModelCount + imageModelCount} downloaded`} onPress={onOpenModels} />
      {(imageModelCount > 0 || imageCount > 0) && (
        <CardRow
          testID="home-phone-gallery"
          label="Gallery"
          value={`${imageCount} ${imageCount === 1 ? 'image' : 'images'}`}
          onPress={onOpenGallery}
        />
      )}
    </Card>
  );
};

const createStyles = (colors: ThemeColors) => ({
  card: { marginBottom: 20, gap: SPACING.sm },
  title: { ...TYPOGRAPHY.h3, color: colors.text },
  storage: { gap: SPACING.xs },
  storageText: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' as const },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
});
