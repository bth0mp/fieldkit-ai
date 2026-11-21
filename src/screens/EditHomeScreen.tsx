import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme, useThemedStyles } from '../theme';
import { Button } from '../components/Button';
import {
  ALWAYS_SHOWN, homeLayoutService, useHomeLayoutStore, type HomeCardId,
} from '../features/home/homeLayout';
import { createStyles } from './EditHomeScreen.styles';

const CARD_NAMES: Record<HomeCardId, string> = {
  assistant: 'Assistant',
  fieldKit: 'Field kit',
  library: 'Your library',
  checklists: 'Checklists',
  today: 'Today',
  phone: 'Phone',
};

/** Where the owner moves Home's cards up and down, hides the ones that may go, and puts it all back. */
export const EditHomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const order = useHomeLayoutStore(s => s.order);
  const hidden = useHomeLayoutStore(s => s.hidden);

  const mover = (id: HomeCardId, by: -1 | 1, disabled: boolean) => (
    <TouchableOpacity
      testID={`edit-home-${by === -1 ? 'up' : 'down'}-${id}`}
      onPress={() => homeLayoutService.move(id, by)}
      disabled={disabled}
      style={styles.headerButton}
      accessibilityRole="button"
      accessibilityLabel={`Move ${CARD_NAMES[id]} ${by === -1 ? 'up' : 'down'}`}
      accessibilityState={{ disabled }}
    >
      <Icon name={by === -1 ? 'chevron-up' : 'chevron-down'} size={18} color={disabled ? colors.textMuted : colors.text} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}
          accessibilityRole="button" accessibilityLabel="Back">
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit home</Text>
        <View style={styles.headerButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {order.map((id, index) => (
          <View key={id} style={styles.row} testID={`edit-home-row-${id}`}>
            <Text style={styles.name} numberOfLines={1}>{CARD_NAMES[id]}</Text>
            {ALWAYS_SHOWN.includes(id) ? (
              <Text style={styles.note}>Always on Home</Text>
            ) : (
              <Switch
                testID={`edit-home-show-${id}`}
                accessibilityLabel={`Show ${CARD_NAMES[id]} on Home`}
                value={!hidden.includes(id)}
                onValueChange={on => homeLayoutService.setHidden(id, !on)}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            )}
            {mover(id, -1, index === 0)}
            {mover(id, 1, index === order.length - 1)}
          </View>
        ))}
        <Button
          testID="edit-home-reset"
          title="Reset to default"
          variant="outline"
          size="small"
          onPress={() => homeLayoutService.reset()}
          style={styles.reset}
        />
      </ScrollView>
    </SafeAreaView>
  );
};
