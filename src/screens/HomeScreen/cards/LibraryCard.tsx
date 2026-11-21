import React, { useEffect } from 'react';
import { Text, InteractionManager } from 'react-native';
import { Card } from '../../../components/Card';
import { useThemedStyles } from '../../../theme';
import type { ThemeColors } from '../../../theme';
import { TYPOGRAPHY, SPACING } from '../../../constants';
import { BUNDLED_GUIDES } from '../../../features/fieldGuides/fieldGuides';
import { guideLibraryService } from '../../../features/guideLibrary/guideLibraryService';
import { libraryCounts, useGuideLibraryStore } from '../../../features/guideLibrary/guideLibraryStore';
import { useKiwixStore } from '../../../services/kiwix/kiwixStore';
import { useProjectStore } from '../../../stores/projectStore';
import { CardRow } from './CardRow';

type Props = {
  onOpenGuides: () => void;
  onOpenKiwix: () => void;
  onOpenProjects: () => void;
};

/** Home's Your library card: guide counts, Kiwix files and projects. Reads what is saved on the phone only. */
export const LibraryCard: React.FC<Props> = ({ onOpenGuides, onOpenKiwix, onOpenProjects }) => {
  const styles = useThemedStyles(createStyles);
  const catalogue = useGuideLibraryStore((s) => s.catalogue);
  const guides = useGuideLibraryStore((s) => s.guides);
  const delisted = useGuideLibraryStore((s) => s.delisted);
  const kiwixCount = useKiwixStore((s) => Object.keys(s.files).length);
  const projectCount = useProjectStore((s) => s.projects.length);
  const { onPhone, taught } = libraryCounts({ catalogue, guides, delisted });

  // Reads the saved guide records from disk (no network), once Home has finished opening.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => { guideLibraryService.init(); });
    return () => task.cancel();
  }, []);

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Your library</Text>
      <CardRow
        testID="home-library-guides"
        label="Guides"
        value={`${onPhone} on phone, ${taught} taught`}
        note={`Plus ${BUNDLED_GUIDES.length} that come with the app`}
        onPress={onOpenGuides}
      />
      <CardRow
        testID="home-library-kiwix"
        label="Kiwix"
        value={`${kiwixCount} ${kiwixCount === 1 ? 'file' : 'files'}`}
        onPress={onOpenKiwix}
      />
      <CardRow testID="home-library-projects" label="Projects" value={`${projectCount}`} onPress={onOpenProjects} />
    </Card>
  );
};

const createStyles = (colors: ThemeColors) => ({
  card: { marginBottom: 20, gap: SPACING.sm },
  title: { ...TYPOGRAPHY.h3, color: colors.text },
});
