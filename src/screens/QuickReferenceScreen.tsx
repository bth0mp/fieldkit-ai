import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { QUICK_REFERENCE_CARDS } from '../features/quickReference/cards';
import { createStyles } from './QuickReferenceScreen.styles';

/**
 * Signal and code cards to read at a glance: no model, no download, no network. Cards start closed; opening one
 * shows its signs with their meanings, its notes and the standard it comes from.
 */
export const QuickReferenceScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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
      {/* ponytail: a plain scroll view; the four cards hold about 130 short rows in all. */}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.note}>Signals and codes to read at a glance. Nothing here needs a model, a download or a signal.</Text>
        {QUICK_REFERENCE_CARDS.map(card => {
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
                  {card.rows.map(row => (
                    <View key={row.sign} style={styles.referenceRow} testID={`quick-reference-${card.id}-${row.sign}`}
                      accessible accessibilityLabel={`${row.spokenSign ?? row.sign}: ${row.spoken ?? row.meaning}`}>
                      <Text style={styles.sign}>{row.sign}</Text>
                      <Text style={styles.meaning} testID="quick-reference-meaning">{row.meaning}</Text>
                    </View>
                  ))}
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
