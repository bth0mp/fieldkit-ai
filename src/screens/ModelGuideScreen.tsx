import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { hardwareService } from '../services/hardware';
import { memoryTierGB } from '../features/modelGuide/guide';
import { IMAGE_BACKEND_NOTES, PHONE_TIPS } from '../features/modelGuide/notes';
import {
  tierRows, textEntries, imageEntries, whisperEntries, liteRtEntries, type GuideEntry, type TierRow,
} from '../features/modelGuide/sections';
import { createStyles } from './ModelGuideScreen.styles';

type Styles = ReturnType<typeof createStyles>;

const TierView: React.FC<{ row: TierRow; yours: boolean; styles: Styles }> = ({ row, yours, styles }) => (
  <View testID={`guide-tier-${row.gb}`} accessible style={[styles.tier, yours && styles.tierYours]}
    accessibilityState={yours ? { selected: true } : undefined}>
    <Text style={styles.tierTitle}>{row.gb} GB</Text>
    {yours && <Text style={styles.yoursBadge}>Your phone</Text>}
    {row.examples.length > 0 && <Text style={styles.detail}>{`e.g. ${row.examples.join(', ')}`}</Text>}
    {row.runsWell.length > 0 && <Text style={styles.detail}>{`Runs well: ${row.runsWell.join(', ')}`}</Text>}
    {row.tight.length > 0 && <Text style={styles.detail}>{`Tight: ${row.tight.join(', ')}`}</Text>}
  </View>
);

const EntryView: React.FC<{ entry: GuideEntry; styles: Styles }> = ({ entry, styles }) => (
  <View testID={`guide-note-${entry.id}`} accessible style={styles.entry}>
    <Text style={styles.entryName}>{entry.name}</Text>
    {entry.goodFor !== undefined && <Text style={styles.detail}>{`Good for: ${entry.goodFor}`}</Text>}
    {entry.notFor !== undefined && <Text style={styles.detail}>{`Not for: ${entry.notFor}`}</Text>}
    <Text style={styles.detail}>{`${entry.fitsLabel}: ${entry.fits}`}</Text>
  </View>
);

const Section: React.FC<{ title: string; entries: GuideEntry[]; styles: Styles; children?: React.ReactNode }> = (
  { title, entries, styles, children },
) => (
  <View>
    <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
    {children}
    {entries.map(entry => <EntryView key={entry.id} entry={entry} styles={styles} />)}
  </View>
);

/** Which model fits this phone: its memory tier, what runs on each tier, and a note on each model. No network. */
export const ModelGuideScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const tier = memoryTierGB(hardwareService.getTotalMemoryGB());

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']} testID="model-guide-screen">
      <View style={styles.header}>
        <TouchableOpacity testID="model-guide-back" onPress={() => navigation.goBack()} style={styles.headerButton}
          accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Which model?</Text>
        <View style={styles.headerButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text testID="guide-your-phone" style={styles.yourPhone}>{`Your phone: ${tier} GB memory`}</Text>
        {tierRows().map(row => <TierView key={row.gb} row={row} yours={row.gb === tier} styles={styles} />)}
        <Text style={styles.note}>Fit comes from each model's size, not a speed test.</Text>
        <Text style={styles.note}>Tight means the app may ask before loading it, or you may need a smaller file.</Text>
        {PHONE_TIPS.map(tip => <Text key={tip} style={styles.note}>{tip}</Text>)}
        <Section title="Text models" entries={textEntries()} styles={styles} />
        <Section title="Image models" entries={imageEntries()} styles={styles}>
          <View testID="guide-image-mnn" accessible style={styles.entry}>
            <Text style={styles.entryName}>GPU models</Text>
            <Text style={styles.detail}>{IMAGE_BACKEND_NOTES.mnn}</Text>
          </View>
          <View testID="guide-image-qnn" accessible style={styles.entry}>
            <Text style={styles.entryName}>NPU models</Text>
            <Text style={styles.detail}>{IMAGE_BACKEND_NOTES.qnn}</Text>
          </View>
        </Section>
        <Section title="Transcription" entries={whisperEntries()} styles={styles} />
        {Platform.OS === 'android' && <Section title="LiteRT" entries={liteRtEntries()} styles={styles} />}
      </ScrollView>
    </SafeAreaView>
  );
};
