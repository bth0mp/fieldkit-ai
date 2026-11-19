import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
// The app is edge to edge, so the window does not shrink for the keyboard: this scroll view keeps the box being
// typed in above it.
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { SPACING } from '../constants';
import { Button } from '../components/Button';
import { CALCULATORS, workOut, type Calculator } from '../features/calculators/calculators';
import { createStyles } from './CalculatorsScreen.styles';

type Outcome = { answer: string; problem: string };

/**
 * The assistant's on-phone tools as boxes to fill in: open one, type, and read the tool's own answer. One is
 * open at a time; what was typed in the others is kept. Typing in a box takes that calculator's last answer
 * away, since it no longer belongs to what is typed.
 */
export const CalculatorsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState<string | null>(null);
  const [typed, setTyped] = useState<Record<string, Record<string, string>>>({});
  const [outcomes, setOutcomes] = useState<Record<string, Outcome | undefined>>({});
  const [working, setWorking] = useState<string | null>(null);

  const type = (id: string, key: string) => (text: string) => {
    setTyped(prev => ({ ...prev, [id]: { ...prev[id], [key]: text } }));
    setOutcomes(prev => ({ ...prev, [id]: undefined }));
  };

  const go = async (calculator: Calculator) => {
    // The answer is drawn below the button, where the keyboard is.
    Keyboard.dismiss();
    setWorking(calculator.id);
    const outcome = await workOut(calculator.id, typed[calculator.id] ?? {});
    setOutcomes(prev => ({ ...prev, [calculator.id]: outcome }));
    setWorking(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}
          accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Calculators</Text>
        <View style={styles.headerButton} />
      </View>
      <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" bottomOffset={SPACING.xl}>
        <Text style={styles.note}>The sums the assistant's tools do, worked out on this phone from what you type. No model is needed, and nothing leaves the phone.</Text>
        {CALCULATORS.map(calculator => {
          const isOpen = open === calculator.id;
          const outcome = outcomes[calculator.id];
          return (
            <View key={calculator.id}>
              <TouchableOpacity style={styles.groupHeader} onPress={() => setOpen(isOpen ? null : calculator.id)}
                testID={`calculators-open-${calculator.id}`} accessibilityRole="button" accessibilityState={{ expanded: isOpen }}>
                <Text style={styles.cardTitle}>{calculator.title}</Text>
                <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
              </TouchableOpacity>
              {isOpen && (
                <>
                  {calculator.fields.map(field => (
                    <View key={field.key}>
                      <Text style={styles.label}>{field.required ? field.label : `${field.label} (optional)`}</Text>
                      <Text style={styles.rowMeta}>{field.hint}</Text>
                      <TextInput testID={`calculators-${calculator.id}-${field.key}`} style={styles.field}
                        value={typed[calculator.id]?.[field.key] ?? ''} onChangeText={type(calculator.id, field.key)}
                        accessibilityLabel={field.label} accessibilityHint={field.hint}
                        autoCapitalize="none" autoCorrect={false} maxLength={1200} />
                    </View>
                  ))}
                  <View style={styles.go}>
                    <Button title="Work it out" size="small" variant="outline" style={styles.tapTarget}
                      testID={`calculators-${calculator.id}-go`} loading={working === calculator.id}
                      disabled={working !== null} onPress={() => go(calculator)} />
                  </View>
                  {/* Always there, so that what appears in it is announced: a live region that arrives already
                      filled is not. */}
                  <View accessibilityLiveRegion="polite" testID={`calculators-${calculator.id}-outcome`}>
                    {outcome?.problem ? (
                      <Text style={styles.error} testID={`calculators-${calculator.id}-problem`}>{outcome.problem}</Text>
                    ) : null}
                    {outcome?.answer ? (
                      <Text style={styles.answer} selectable testID={`calculators-${calculator.id}-answer`}>{outcome.answer}</Text>
                    ) : null}
                  </View>
                </>
              )}
            </View>
          );
        })}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
};
