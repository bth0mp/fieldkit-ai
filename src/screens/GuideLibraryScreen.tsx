import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SectionList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { Button } from '../components/Button';
import { formatBytes } from '../utils/formatBytes';
import type { Catalogue, GuideCategory, GuideEntry } from '../features/guideLibrary/catalogue';
import { useGuideLibraryStore, type GuidePhase, type GuideState } from '../features/guideLibrary/guideLibraryStore';
import { guideLibraryService } from '../features/guideLibrary/guideLibraryService';
import { createStyles } from './GuideLibraryScreen.styles';

type Styles = ReturnType<typeof createStyles>;
const NONE: GuideState = { phase: 'none' };
/** Phases in which the guide's file is on the phone. */
const ON_PHONE: GuidePhase[] = ['downloaded', 'teaching', 'taught'];

interface GuideSection { key: string; category: GuideCategory; data: GuideEntry[] }

/** Catalogue categories in order, each with its guides matching `query` (title or publisher). Empty ones are left out. */
function sectionsFor(catalogue: Catalogue, query: string): GuideSection[] {
  const q = query.trim().toLowerCase();
  const matches = (g: GuideEntry) => !q || g.title.toLowerCase().includes(q) || g.publisher.toLowerCase().includes(q);
  return catalogue.categories
    .map(category => ({ key: category.id, category, data: catalogue.guides.filter(g => g.category === category.id && matches(g)) }))
    .filter(s => s.data.length > 0);
}

interface RowProps { entry: GuideEntry; state: GuideState; expanded: boolean; onToggle: () => void; styles: Styles }

const GuideRow: React.FC<RowProps> = ({ entry, state, expanded, onToggle, styles }) => {
  const { colors } = useTheme();
  const { id } = entry;
  const hasFile = ON_PHONE.includes(state.phase);
  return (
    <TouchableOpacity style={styles.row} onPress={onToggle} testID={`guide-row-${id}`}>
      <View style={styles.rowHeader}>
        <View style={styles.rowContent}>
          <Text style={styles.rowTitle}>{entry.title}</Text>
          <Text style={styles.rowMeta}>{`${entry.publisher} · ${formatBytes(entry.bytes)} · ${entry.licence}`}</Text>
        </View>
        {state.phase === 'none' && (
          <Button title="Download" size="small" variant="outline" testID={`guide-download-${id}`}
            onPress={() => { guideLibraryService.download(id); }} />
        )}
        {state.phase === 'downloading' && <Text style={styles.progress}>{`${Math.round((state.progress ?? 0) * 100)}%`}</Text>}
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </View>
      {hasFile && (
        <View style={styles.actions}>
          <Button title="Open" size="small" variant="outline" testID={`guide-open-${id}`}
            onPress={() => { guideLibraryService.open(id); }} />
          {state.phase === 'downloaded' && (
            <Button title="Remove" size="small" variant="ghost" testID={`guide-remove-${id}`}
              onPress={() => { guideLibraryService.remove(id); }} />
          )}
        </View>
      )}
      {state.error && <Text style={styles.error}>{state.error}</Text>}
      {expanded && (
        <>
          <Text style={styles.details}>{`${entry.year} · ${entry.pages} pages`}</Text>
          <Text style={styles.details} selectable>{entry.licenceNote}</Text>
          <Text style={styles.details} selectable>{entry.url}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

/** Checked public-domain and CC BY guides by category: download, open in the PDF viewer, remove. */
export const GuideLibraryScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const catalogue = useGuideLibraryStore(s => s.catalogue);
  const guides = useGuideLibraryStore(s => s.guides);
  const refreshing = useGuideLibraryStore(s => s.refreshing);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    guideLibraryService.init().then(() => guideLibraryService.refresh());
  }, []);

  const sections = useMemo(() => sectionsFor(catalogue, query), [catalogue, query]);
  const states = Object.values(guides);
  const downloaded = states.filter(g => ON_PHONE.includes(g.phase)).length;
  const taught = states.filter(g => g.phase === 'taught').length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Guide library</Text>
        <TouchableOpacity
          testID="guide-library-refresh"
          onPress={() => { guideLibraryService.refresh(); }}
          disabled={refreshing}
          accessibilityState={{ busy: refreshing, disabled: refreshing }}
          style={styles.headerButton}
        >
          {refreshing ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Icon name="refresh-cw" size={18} color={colors.text} />}
        </TouchableOpacity>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        ListHeaderComponent={
          <>
            <TextInput
              testID="guide-library-search"
              style={styles.search}
              placeholder="Search guides"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            <Text style={styles.summary}>{`${catalogue.guides.length} guides · ${downloaded} downloaded · ${taught} taught`}</Text>
          </>
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{`${section.category.name} (${section.data.length})`}</Text>}
        renderItem={({ item }) => (
          <GuideRow entry={item} state={guides[item.id] ?? NONE} expanded={open === item.id} styles={styles}
            onToggle={() => setOpen(open === item.id ? null : item.id)} />
        )}
      />
    </SafeAreaView>
  );
};
