import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
// The app is edge to edge, so the window does not shrink for the keyboard: this scroll view keeps the field
// being typed in above it.
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { SPACING } from '../constants';
import { Button } from '../components/Button';
import { CustomAlert, showAlert, hideAlert, initialAlertState, type AlertState } from '../components/CustomAlert';
import { checklistService, CHECKLIST_LIMITS } from '../features/checklists/checklistService';
import { useChecklistStore, type Checklist } from '../features/checklists/checklistStore';
import { STARTER_LISTS } from '../features/checklists/starterLists';
import { createStyles } from './ChecklistsScreen.styles';

/** Which field a refused change belongs under, and what the service said. */
interface Problem { where: 'list' | 'item' | 'rename'; message: string }
/** A change that loses work, and the words that ask about it first. */
interface Question { title: string; message: string; action: string; work: () => void }

function deleteMessage(list: Checklist): string {
  const count = list.items.length;
  if (count === 0) return `"${list.name}" will be deleted.`;
  return `"${list.name}" and its ${count} ${count === 1 ? 'item' : 'items'} will be deleted.`;
}

/**
 * The user's own checklists, kept on the phone: make a list or start from a public one, tick items off, untick
 * them all for the next trip, share a list as plain text, remove an item or delete a list after being asked.
 * One list is open at a time.
 */
export const ChecklistsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const lists = useChecklistStore(s => s.lists);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newItem, setNewItem] = useState('');
  /** The open list's new name while it is being renamed; null when it is not. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);

  /** Makes a change the service may refuse; its reason is shown under the field it belongs to. */
  const attempt = (where: Problem['where'], work: () => void) => {
    try {
      work();
      setProblem(null);
    } catch (e) {
      setProblem({ where, message: (e as Error).message });
    }
  };
  const open = (id: string | null) => {
    setOpenId(id);
    setNewItem('');
    setRenaming(null);
    setProblem(null);
  };
  const typing = (set: (text: string) => void) => (text: string) => {
    set(text);
    setProblem(null);
  };
  const addList = () => attempt('list', () => {
    open(checklistService.create(newName));
    setNewName('');
  });
  const startFrom = (starterId: string) => attempt('list', () => open(checklistService.createFromStarter(starterId)));
  const addItem = (listId: string) => attempt('item', () => {
    checklistService.addItem(listId, newItem);
    setNewItem('');
  });
  const saveName = (listId: string) => attempt('rename', () => {
    checklistService.rename(listId, renaming ?? '');
    setRenaming(null);
  });
  const ask = ({ title, message, action, work }: Question) => setAlertState(showAlert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: () => attempt('item', work) },
  ]));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}
          accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Checklists</Text>
        <View style={styles.headerButton} />
      </View>
      <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={SPACING.xl}>
        <Text style={styles.note}>Your own lists, kept on this phone. Tick things off as you pack or check them.</Text>
        <View style={styles.addRow}>
          <TextInput testID="checklists-new-name" style={styles.field} value={newName} onChangeText={typing(setNewName)}
            placeholder="New list name" placeholderTextColor={colors.textMuted} accessibilityLabel="New list name"
            maxLength={CHECKLIST_LIMITS.name} returnKeyType="done" onSubmitEditing={addList} />
          <Button title="Add list" size="small" variant="outline" style={styles.tapTarget} onPress={addList} testID="checklists-add-list" />
        </View>
        {problem?.where === 'list' && <Text style={styles.error} accessibilityLiveRegion="polite">{problem.message}</Text>}
        {STARTER_LISTS.map(starter => (
          <View key={starter.id} style={styles.starter}>
            <Button title={starter.label} size="small" variant="ghost" style={styles.tapTarget} testID={`checklists-starter-${starter.id}`}
              icon={<Icon name="copy" size={14} color={colors.text} />} onPress={() => startFrom(starter.id)} />
            <Text style={styles.rowMeta}>{starter.source}</Text>
          </View>
        ))}
        {lists.length === 0 && <Text style={styles.empty}>No lists yet.</Text>}
        {lists.map(list => {
          const isOpen = openId === list.id;
          const done = list.items.filter(item => item.done).length;
          return (
            <View key={list.id}>
              <TouchableOpacity style={styles.groupHeader} onPress={() => open(isOpen ? null : list.id)}
                accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
                <Text style={styles.listTitle}>{`${list.name} (${done} of ${list.items.length})`}</Text>
                <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
              </TouchableOpacity>
              {isOpen && (
                <>
                  {list.items.map(item => (
                    <View key={item.id} style={styles.itemRow}>
                      <TouchableOpacity style={styles.itemTick} onPress={() => attempt('item', () => checklistService.toggle(list.id, item.id))}
                        accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} accessibilityLabel={item.text}>
                        <Icon name={item.done ? 'check-square' : 'square'} size={20} color={item.done ? colors.primary : colors.textMuted} />
                        <Text style={[styles.itemText, item.done && styles.itemDone]}>{item.text}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.removeButton} accessibilityRole="button" accessibilityLabel={`Remove ${item.text}`}
                        onPress={() => ask({
                          title: 'Remove item?', message: `"${item.text}" will be removed from ${list.name}.`, action: 'Remove',
                          work: () => checklistService.removeItem(list.id, item.id),
                        })}>
                        <Icon name="x" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <View style={styles.addRow}>
                    <TextInput testID="checklists-new-item" style={styles.field} value={newItem} onChangeText={typing(setNewItem)}
                      placeholder="Add an item" placeholderTextColor={colors.textMuted} accessibilityLabel={`Add an item to ${list.name}`}
                      maxLength={CHECKLIST_LIMITS.item} returnKeyType="done" blurOnSubmit={false} onSubmitEditing={() => addItem(list.id)} />
                    <Button title="Add" size="small" variant="outline" style={styles.tapTarget} onPress={() => addItem(list.id)} testID="checklists-add-item" />
                  </View>
                  {problem?.where === 'item' && <Text style={styles.error} accessibilityLiveRegion="polite">{problem.message}</Text>}
                  {renaming !== null && (
                    <View style={styles.addRow}>
                      <TextInput testID="checklists-rename-field" style={styles.field} value={renaming} onChangeText={typing(setRenaming)}
                        placeholder="List name" placeholderTextColor={colors.textMuted} accessibilityLabel={`New name for ${list.name}`}
                        maxLength={CHECKLIST_LIMITS.name} returnKeyType="done" onSubmitEditing={() => saveName(list.id)} />
                      <Button title="Save" size="small" variant="outline" style={styles.tapTarget} onPress={() => saveName(list.id)} testID="checklists-rename-save" />
                    </View>
                  )}
                  {problem?.where === 'rename' && <Text style={styles.error} accessibilityLiveRegion="polite">{problem.message}</Text>}
                  <View style={styles.listActions}>
                    <Button title="Untick all" size="small" variant="ghost" style={styles.tapTarget} testID="checklists-untick-all" disabled={done === 0}
                      onPress={() => ask({
                        title: 'Untick everything?', message: `All ${done} ticked ${done === 1 ? 'item' : 'items'} in ${list.name} will be unticked.`,
                        action: 'Untick', work: () => checklistService.untickAll(list.id),
                      })} />
                    <Button title="Share" size="small" variant="ghost" style={styles.tapTarget} testID="checklists-share"
                      disabled={list.items.length === 0} onPress={() => { checklistService.share(list.id); }} />
                    <Button title={renaming === null ? 'Rename' : 'Cancel'} size="small" variant="ghost" style={styles.tapTarget} testID="checklists-rename"
                      onPress={() => { setRenaming(renaming === null ? list.name : null); setProblem(null); }} />
                    <Button title="Delete list" size="small" variant="ghost" style={styles.tapTarget} testID="checklists-delete-list"
                      onPress={() => ask({ title: 'Delete list?', message: deleteMessage(list), action: 'Delete', work: () => checklistService.remove(list.id) })} />
                  </View>
                </>
              )}
            </View>
          );
        })}
      </KeyboardAwareScrollView>
      <CustomAlert {...alertState} onClose={() => setAlertState(hideAlert())} />
    </SafeAreaView>
  );
};
