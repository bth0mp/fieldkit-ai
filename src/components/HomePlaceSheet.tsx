import React, { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { AppSheet } from './AppSheet';
import { Button } from './Button';
import { useTheme, useThemedStyles } from '../theme';
import type { ThemeColors, ThemeShadows } from '../theme';
import { TYPOGRAPHY, SPACING } from '../constants';
import { homePlaceService, useHomePlaceStore } from '../features/home/homePlace';

interface HomePlaceSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Where the user types the place Home uses for sunrise, sunset and moonrise. */
export const HomePlaceSheet: React.FC<HomePlaceSheetProps> = ({ visible, onClose }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const place = useHomePlaceStore((s) => s.place);
  const [text, setText] = useState(place?.typed ?? '');
  const [error, setError] = useState('');

  // Each time the sheet opens it starts from what is saved, with no old error.
  useEffect(() => {
    if (visible) {
      setText(useHomePlaceStore.getState().place?.typed ?? '');
      setError('');
    }
  }, [visible]);

  const save = () => {
    try {
      homePlaceService.set(text);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const clear = () => {
    homePlaceService.clear();
    onClose();
  };

  return (
    <AppSheet visible={visible} onClose={onClose} title="Home place" enableDynamicSizing>
      <View style={styles.body}>
        <Text style={styles.help}>
          Used for sunrise, sunset and moonrise on Home. Type a latitude and longitude, a UTM or an MGRS grid
          reference. The app never reads your location.
        </Text>
        <TextInput
          testID="home-place-input"
          style={styles.field}
          value={text}
          onChangeText={(t) => { setText(t); setError(''); }}
          placeholder="51.4778, -0.0015"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Home place"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={save}
        />
        {error ? <Text testID="home-place-error" style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
        <View style={styles.actions}>
          {place && <Button title="Clear" variant="ghost" onPress={clear} testID="home-place-clear" />}
          <Button title="Save" onPress={save} testID="home-place-save" />
        </View>
      </View>
    </AppSheet>
  );
};

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  body: { padding: SPACING.lg, gap: SPACING.md },
  help: { ...TYPOGRAPHY.bodySmall, color: colors.textMuted },
  field: {
    ...TYPOGRAPHY.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 44,
  },
  error: { ...TYPOGRAPHY.bodySmall, color: colors.error },
  actions: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, gap: SPACING.sm },
});
