import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { QUICK_REFERENCE_CARDS, ReferenceCard, spellTyped } from '../features/quickReference/cards';
import { searchCards } from '../features/quickReference/search';
import { createStyles } from './QuickReferenceScreen.styles';

/**
 * Signal and code cards to read at a glance: no model, no download, no network. Cards start closed; opening one
 * shows its signs with their meanings, its notes and the standard it comes from. Typing in the search field
 * shows the matching rows and notes of every card instead, under what was typed spelled for the radio and in
 * Morse (or read back, if it was Morse).
 */
export const QuickReferenceScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const searching = query.trim() !== '';
  const found = searchCards(query);
  const spelled = spellTyped(query);

  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const rowsOf = (card: ReferenceCard, rows: ReferenceCard['rows']) => rows.map(row => (
    <View key={row.sign} style={styles.referenceRow} testID={`quick-reference-${card.id}-${row.sign}`}
      accessible accessibilityLabel={`${row.spokenSign ?? row.sign}: ${row.spoken ?? row.meaning}`}>
      <Text style={styles.sign}>{row.sign}</Text>
      <Text style={styles.meaning} testID="quick-reference-meaning">{row.meaning}</Text>
    </View>
  ));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}
          accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Quick reference</Text>
        <View style={styles.headerButton} />
      </View>
      {/* ponytail: a plain scroll view; the six cards hold about 140 short rows in all. */}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.note}>Signals, codes and scales to read at a glance. Nothing here needs a model, a download or a signal.</Text>
        <TextInput testID="quick-reference-search" style={styles.search} value={query} onChangeText={setQuery}
          placeholder="Search the cards, or type a word to spell" placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search the cards, or type a word to spell"
          autoCapitalize="none" autoCorrect={false} returnKeyType="search" />
        {spelled.length > 0 && (
          <View>
            <View style={styles.groupHeader}>
              <Text style={styles.cardTitle} accessibilityRole="header">Spelled out</Text>
            </View>
            {spelled.map(line => (
              <Text key={line.text} style={styles.spelled} accessibilityLabel={line.spoken} selectable>{line.text}</Text>
            ))}
          </View>
        )}
        {/* Always there, so that the line appearing in it is announced. */}
        <View accessibilityLiveRegion="polite">
          {searching && found.length === 0 && spelled.length === 0 && (
            <Text style={styles.empty} accessibilityLiveRegion="polite">No card has that.</Text>
          )}
        </View>
        {/* Every result carries all of its card's notes and its source, never the bare rows. */}
        {searching && found.map(({ card, rows }) => (
          <View key={card.id}>
            <View style={styles.groupHeader}>
              <Text style={styles.cardTitle} accessibilityRole="header">{card.title}</Text>
            </View>
            {rowsOf(card, rows)}
            {card.notes.map(note => <Text key={note} style={styles.note}>{note}</Text>)}
            <Text style={styles.source}>{card.source}</Text>
          </View>
        ))}
        {!searching && QUICK_REFERENCE_CARDS.map(card => {
          const isOpen = open.has(card.id);
          return (
            <View key={card.id}>
              <TouchableOpacity style={styles.groupHeader} onPress={() => toggle(card.id)} testID={`quick-reference-card-${card.id}`}
                accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
              </TouchableOpacity>
              {isOpen && (
                <>
                  {rowsOf(card, card.rows)}
                  {card.notes.map(note => <Text key={note} style={styles.note}>{note}</Text>)}
                  <Text style={styles.source}>{card.source}</Text>
                </>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
};
