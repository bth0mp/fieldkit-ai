import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SectionList, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { Button } from '../components/Button';
import { CustomAlert, showAlert, hideAlert, initialAlertState, type AlertState } from '../components/CustomAlert';
import { formatBytes } from '../utils/formatBytes';
import type { Catalogue, GuideCategory, GuideEntry } from '../features/guideLibrary/catalogue';
import {
  isOnPhone, libraryCounts, offersTeach, rowEntry, stateOf, useGuideLibraryStore, type GuideState,
} from '../features/guideLibrary/guideLibraryStore';
import { guideLibraryService, SLOW_SEARCH_TAUGHT_GUIDES } from '../features/guideLibrary/guideLibraryService';
import { useKiwixStore } from '../services/kiwix/kiwixStore';
import type { RootStackParamList } from '../navigation/types';
import { createStyles } from './GuideLibraryScreen.styles';

type Styles = ReturnType<typeof createStyles>;
const NONE: GuideState = { phase: 'none' };

/** `title` is the heading as shown. `delisted` marks the "No longer listed" group. */
interface GuideSection { key: string; title: string; delisted: boolean; data: GuideEntry[] }

/**
 * Catalogue categories in order, then the downloaded guides the catalogue no longer lists, each with its guides
 * as `shown` (see rowEntry) matching `query` (title, publisher or id). Empty ones are left out.
 */
interface SectionsInput { catalogue: Catalogue; delisted: GuideEntry[]; query: string; shown: (g: GuideEntry) => GuideEntry }
function sectionsFor({ catalogue, delisted, query, shown }: SectionsInput): GuideSection[] {
  const q = query.trim().toLowerCase();
  const matches = (g: GuideEntry) => !q || [g.title, g.publisher, g.id].some(s => s.toLowerCase().includes(q));
  const listed = catalogue.categories.map((category: GuideCategory) => {
    const data = catalogue.guides.filter(g => g.category === category.id).map(shown).filter(matches);
    return { key: category.id, title: `${category.name} (${data.length})`, delisted: false, data };
  });
  const gone = { key: 'no-longer-listed', title: 'No longer listed', delisted: true, data: delisted.filter(matches) };
  return [...listed, gone].filter(s => s.data.length > 0);
}

/** The removal question for a guide: what goes, and what the user loses with it. */
function removalMessage(entry: GuideEntry, state: GuideState, delisted: boolean): string {
  let message = `"${entry.title}" will be deleted from your phone.`;
  if (state.phase === 'taught') message += ' The assistant will stop using it.';
  if (delisted) message += " It is no longer in the library, so you won't be able to download it again.";
  return message;
}

/**
 * The "Assistant knows this" switch for a downloaded guide that has a text layer. While the guide is being taught
 * the switch gives way to the work: this guide being learned, or waiting behind the one that is.
 */
const TeachControl: React.FC<{ entry: GuideEntry; state: GuideState; styles: Styles }> = ({ entry, state, styles }) => {
  const { colors } = useTheme();
  const learning = useGuideLibraryStore(s => s.learning === entry.id);
  if (state.phase === 'teaching') {
    return (
      <View style={styles.teach} testID={`guide-teaching-${entry.id}`}>
        <Text style={styles.teachLabel}>{learning ? 'Learning this guide…' : 'Waiting to learn'}</Text>
        <ActivityIndicator size="small" color={colors.textMuted} />
      </View>
    );
  }
  return (
    <View style={styles.teach}>
      <Text style={styles.teachLabel}>Assistant knows this</Text>
      <Switch
        testID={`guide-teach-${entry.id}`}
        accessibilityLabel={`Assistant knows ${entry.title}`}
        value={state.phase === 'taught'}
        onValueChange={on => { if (on) guideLibraryService.teach(entry.id); else guideLibraryService.unteach(entry.id); }}
        trackColor={{ false: colors.border, true: colors.primary }}
      />
    </View>
  );
};

/** `delisted`: the catalogue no longer lists this downloaded guide, so it cannot be downloaded or taught anew. */
interface RowProps {
  entry: GuideEntry; state: GuideState; delisted: boolean; expanded: boolean;
  onToggle: () => void; onRemove: () => void; styles: Styles;
}

const GuideRow: React.FC<RowProps> = ({ entry, state, delisted, expanded, onToggle, onRemove, styles }) => {
  const { colors } = useTheme();
  const { id, title } = entry;
  const hasFile = isOnPhone(state);
  const showTeach = offersTeach(entry, state, !delisted);
  return (
    <TouchableOpacity style={styles.row} onPress={onToggle} testID={`guide-row-${id}`}
      accessibilityRole="button" accessibilityState={{ expanded }}>
      <View style={styles.rowHeader}>
        <View style={styles.rowContent}>
          <Text style={styles.rowTitle}>{title}</Text>
          <Text style={styles.rowMeta}>{`${entry.publisher} · ${formatBytes(entry.bytes)} · ${entry.licence}`}</Text>
        </View>
        {state.phase === 'none' && !delisted && (
          <Button title="Download" size="small" variant="outline" testID={`guide-download-${id}`} accessibilityLabel={`Download ${title}`}
            onPress={() => { guideLibraryService.download(id); }} />
        )}
        {state.phase === 'downloading' && <Text style={styles.progress}>{`${Math.round((state.progress ?? 0) * 100)}%`}</Text>}
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </View>
      {delisted && <Text style={[styles.teachLabel, styles.scanned]}>Removed from the library. Your copy still works.</Text>}
      {/* Said before downloading too, so the user knows a guide that is scanned, or listed read only because part of
          its text is unreadable, can be read but not taught. */}
      {!entry.hasText && <Text style={[styles.teachLabel, styles.scanned]}>Read only. The assistant can't learn this guide.</Text>}
      {showTeach && <TeachControl entry={entry} state={state} styles={styles} />}
      {hasFile && (
        <View style={styles.actions}>
          <Button title="Open" size="small" variant="outline" testID={`guide-open-${id}`} accessibilityLabel={`Open ${title}`}
            onPress={() => { guideLibraryService.open(id); }} />
          {(state.phase === 'downloaded' || state.phase === 'taught') && (
            <Button title="Remove" size="small" variant="ghost" testID={`guide-remove-${id}`} accessibilityLabel={`Remove ${title}`}
              onPress={onRemove} />
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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const catalogue = useGuideLibraryStore(s => s.catalogue);
  const guides = useGuideLibraryStore(s => s.guides);
  const delisted = useGuideLibraryStore(s => s.delisted);
  const saved = useGuideLibraryStore(s => s.saved);
  const refreshing = useGuideLibraryStore(s => s.refreshing);
  const kiwixCount = useKiwixStore(s => Object.keys(s.files).length);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);

  useEffect(() => {
    guideLibraryService.init().then(() => guideLibraryService.refresh());
  }, []);
  // Back from another screen: the user may have deleted a taught guide's document or the project there.
  useFocusEffect(useCallback(() => { guideLibraryService.reconcile(); }, []));

  const sections = useMemo(
    () => sectionsFor({ catalogue, delisted, query, shown: g => rowEntry(saved, g, stateOf(guides, g.id)) }),
    [catalogue, delisted, query, saved, guides],
  );
  const { total, onPhone, taught } = useMemo(() => libraryCounts({ catalogue, guides, delisted }), [catalogue, guides, delisted]);

  // A removed guide may not be downloadable again (offline, or no longer listed), so the user confirms first.
  const confirmRemove = (entry: GuideEntry, state: GuideState, isDelisted: boolean) => setAlertState(showAlert(
    'Remove guide?',
    removalMessage(entry, state, isDelisted),
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { guideLibraryService.remove(entry.id); } },
    ],
  ));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}
          accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Guide library</Text>
        <TouchableOpacity
          testID="guide-library-refresh"
          onPress={() => { guideLibraryService.refresh(); }}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh guide list"
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
            <TouchableOpacity style={[styles.row, styles.kiwixRow]} testID="guide-library-open-kiwix" accessibilityRole="button"
              onPress={() => navigation.navigate('KiwixFiles')}>
              <View style={styles.rowHeader}>
                <Icon name="archive" size={16} color={colors.textSecondary} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowTitle}>Kiwix files</Text>
                  <Text style={styles.rowMeta}>{`${kiwixCount} added`}</Text>
                </View>
                <Icon name="chevron-right" size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.row, styles.kiwixRow]} testID="guide-library-open-quick-reference" accessibilityRole="button"
              onPress={() => navigation.navigate('QuickReference')}>
              <View style={styles.rowHeader}>
                <Icon name="zap" size={16} color={colors.textSecondary} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowTitle}>Quick reference</Text>
                  <Text style={styles.rowMeta}>Distress signals, radio alphabet, Morse and wind force</Text>
                </View>
                <Icon name="chevron-right" size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
            <Text style={styles.summary}>{`${total} ${total === 1 ? 'guide' : 'guides'} · ${onPhone} downloaded · ${taught} taught`}</Text>
            {taught >= SLOW_SEARCH_TAUGHT_GUIDES && (
              <Text style={styles.note}>The assistant searches every guide it has learned. More guides make answers slower.</Text>
            )}
          </>
        }
        ListEmptyComponent={query.trim() ? <Text style={styles.empty}>No guides match your search.</Text> : null}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item, section }) => {
          const state = stateOf(guides, item.id) ?? NONE;
          return (
            <GuideRow entry={item} state={state} delisted={section.delisted} expanded={open === item.id} styles={styles}
              onToggle={() => setOpen(open === item.id ? null : item.id)}
              onRemove={() => confirmRemove(item, state, section.delisted)} />
          );
        }}
      />
      <CustomAlert {...alertState} onClose={() => setAlertState(hideAlert())} />
    </SafeAreaView>
  );
};
