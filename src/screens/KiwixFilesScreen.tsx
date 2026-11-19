import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, SectionList, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { Button } from '../components/Button';
import { AppSheet } from '../components/AppSheet';
import { CustomAlert, showAlert, hideAlert, initialAlertState, type AlertState } from '../components/CustomAlert';
import { formatBytes } from '../utils/formatBytes';
import { kiwixService } from '../services/kiwix/kiwixService';
import { useKiwixStore, type KiwixFile } from '../services/kiwix/kiwixStore';
import { libraryCategories } from '../features/library/libraryProjects';
import { createStyles } from './KiwixFilesScreen.styles';

interface FileGroup { key: string; title: string; data: KiwixFile[] }

/**
 * Kiwix files the user added, grouped by category (collapsed, so hundreds stay manageable): add a folder or
 * files, check the folders for new files, move a file to another category, remove one.
 */
export const KiwixFilesScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const files = useKiwixStore(s => s.files);
  const folders = useKiwixStore(s => s.folders);
  const refused = useKiwixStore(s => s.refused);
  const adding = useKiwixStore(s => s.adding);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState<KiwixFile | null>(null);
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);

  const categories = libraryCategories();
  const groups = useMemo<FileGroup[]>(() => {
    const all = Object.values(files).sort((a, b) => a.title.localeCompare(b.title));
    return libraryCategories()
      .map(c => ({ category: c, inGroup: all.filter(f => f.category === c.id) }))
      .filter(g => g.inGroup.length > 0)
      .map(({ category, inGroup }) => ({ key: category.id, title: `${category.name} (${inGroup.length})`, data: open.has(category.id) ? inGroup : [] }));
  }, [files, open]);

  const toggle = (key: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const run = (work: () => Promise<void>) => {
    work().catch((e: Error) => setAlertState(showAlert('Could not add Kiwix files', e.message)));
  };
  const confirmRemove = (file: KiwixFile) => setAlertState(showAlert(
    'Remove Kiwix file?',
    `The assistant will stop using "${file.title}". The file stays on your phone.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { kiwixService.remove(file.id); } },
    ],
  ));

  const busy = adding !== null;
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}
          accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Kiwix files</Text>
        <View style={styles.headerButton} />
      </View>
      <SectionList
        sections={groups}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.content}
        initialNumToRender={20}
        ListHeaderComponent={
          <>
            <View style={styles.buttons}>
              {kiwixService.canAddFolder() && (
                <Button title="Add Kiwix folder" size="small" variant="outline" disabled={busy} testID="kiwix-add-folder"
                  icon={<Icon name="folder-plus" size={14} color={colors.text} />} onPress={() => run(kiwixService.addFolder)} />
              )}
              <Button title="Add Kiwix file" size="small" variant="outline" disabled={busy} testID="kiwix-add-file"
                icon={<Icon name="plus" size={14} color={colors.text} />} onPress={() => run(kiwixService.addFiles)} />
              {folders.length > 0 && (
                <Button title="Check for new files" size="small" variant="ghost" disabled={busy} testID="kiwix-check"
                  icon={<Icon name="refresh-cw" size={14} color={colors.text} />} onPress={() => run(kiwixService.checkForNewFiles)} />
              )}
            </View>
            <Text style={styles.note}>
              Kiwix keeps its downloads in Android/media/org.kiwix.kiwixmobile. Each file goes into a category project, and
              that project's chats look things up in it. Tap a file to move it.
            </Text>
            {adding && <Text style={styles.summary}>{`Adding ${Math.min(adding.done + 1, adding.total)} of ${adding.total}`}</Text>}
            {groups.length === 0 && !adding && <Text style={styles.empty}>No Kiwix files added yet.</Text>}
          </>
        }
        renderSectionHeader={({ section }) => (
          <TouchableOpacity style={styles.groupHeader} onPress={() => toggle(section.key)}
            accessibilityRole="button" accessibilityState={{ expanded: open.has(section.key) }}>
            <Text style={styles.groupTitle}>{section.title}</Text>
            <Icon name={open.has(section.key) ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => setMoving(item)} testID={`kiwix-file-${item.id}`}
            accessibilityRole="button" accessibilityHint="Choose its category">
            <View style={styles.rowHeader}>
              <View style={styles.rowContent}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowMeta}>{`${item.fileName} · ${formatBytes(item.bytes)}`}</Text>
              </View>
              <TouchableOpacity style={styles.removeButton} onPress={() => confirmRemove(item)} testID={`kiwix-remove-${item.id}`}
                accessibilityRole="button" accessibilityLabel={`Remove ${item.title}`}>
                <Icon name="trash-2" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        ListFooterComponent={refused.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Not added</Text>
            {refused.map(r => (
              <View key={r.fileName} style={styles.row}>
                <Text style={styles.rowTitle}>{r.fileName}</Text>
                <Text style={styles.error}>{r.reason}</Text>
              </View>
            ))}
          </>
        ) : null}
      />
      <AppSheet visible={moving !== null} onClose={() => setMoving(null)} title="Move to category" snapPoints={['70%']}>
        <ScrollView contentContainerStyle={styles.sheetList}>
          {categories.map(c => (
            <TouchableOpacity key={c.id} style={styles.sheetRow} testID={`kiwix-category-${c.id}`} accessibilityRole="button"
              onPress={() => { if (moving) kiwixService.move(moving.id, c.id); setMoving(null); }}>
              <Text style={styles.sheetLabel}>{c.name}</Text>
              {moving?.category === c.id && <Icon name="check" size={16} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </AppSheet>
      <CustomAlert {...alertState} onClose={() => setAlertState(hideAlert())} />
    </SafeAreaView>
  );
};
