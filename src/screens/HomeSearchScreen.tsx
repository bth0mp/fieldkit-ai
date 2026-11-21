import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { useChatStore } from '../stores';
import { useChecklistStore } from '../features/checklists/checklistStore';
import { bundledGuidePreview } from '../features/fieldGuides/fieldGuides';
import { guideLibraryService } from '../features/guideLibrary/guideLibraryService';
import { isOnPhone, rowEntry, stateOf, useGuideLibraryStore } from '../features/guideLibrary/guideLibraryStore';
import { searchHome, type HomeHit } from '../features/home/homeSearch';
import logger from '../utils/logger';
import type { RootStackParamList } from '../navigation/types';
import { createStyles } from './HomeSearchScreen.styles';

const KIND_LABEL: Record<HomeHit['kind'], string> = {
  chat: 'Chat',
  guide: 'Guide',
  bundledGuide: 'Guide',
  checklist: 'Checklist',
  reference: 'Quick reference',
};

/** Finds chats, guides on the phone, the guides that come with the app, checklists and Quick reference cards by title. */
export const HomeSearchScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [typed, setTyped] = useState('');
  const conversations = useChatStore(s => s.conversations);
  const checklists = useChecklistStore(s => s.lists);
  const catalogue = useGuideLibraryStore(s => s.catalogue);
  const guideStates = useGuideLibraryStore(s => s.guides);
  const saved = useGuideLibraryStore(s => s.saved);
  const delisted = useGuideLibraryStore(s => s.delisted);

  // Reads the saved guide records from disk, so the guides on the phone are known.
  useEffect(() => { guideLibraryService.init(); }, []);

  const guides = useMemo(
    () => [...catalogue.guides, ...delisted]
      .filter(g => isOnPhone(stateOf(guideStates, g.id)))
      .map(g => rowEntry(saved, g, stateOf(guideStates, g.id))),
    [catalogue, delisted, guideStates, saved],
  );
  const hits = useMemo(() => searchHome(typed, { conversations, guides, checklists }), [typed, conversations, guides, checklists]);

  const open = async (hit: HomeHit) => {
    switch (hit.kind) {
      case 'chat': navigation.navigate('Chat', { conversationId: hit.id }); break;
      case 'guide': await guideLibraryService.open(hit.id); break;
      case 'bundledGuide':
        try {
          navigation.navigate('DocumentPreview', await bundledGuidePreview(hit.asset));
        } catch (error) {
          logger.warn('[HomeSearch] could not open a bundled guide', hit.asset, error);
        }
        break;
      case 'checklist': navigation.navigate('Checklists', { listId: hit.id }); break;
      case 'reference': navigation.navigate('QuickReference', { cardId: hit.id }); break;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}
          accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Search</Text>
        <View style={styles.headerButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <TextInput testID="home-search-input" style={styles.search} value={typed} onChangeText={setTyped} autoFocus
          placeholder="Search chats, guides, lists and signals" placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search chats, guides, lists and signals"
          autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
        {typed.trim() !== '' && hits.length === 0 && (
          <Text style={styles.empty} testID="home-search-empty">No titles match. To search inside guides, ask the assistant.</Text>
        )}
        {hits.map((hit, index) => (
          <TouchableOpacity key={`${hit.kind}-${'id' in hit ? hit.id : hit.asset}`} testID={`home-search-hit-${index}`}
            style={styles.row} onPress={() => { open(hit); }} accessibilityRole="button">
            <Text style={styles.title} numberOfLines={1}>{hit.title}</Text>
            <Text style={styles.kind}>{KIND_LABEL[hit.kind]}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};
