import React, { useState } from 'react';
import { View, Text, Switch, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import IconMC from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme, useThemedStyles } from '../../theme';
import { FONTS, TYPOGRAPHY, SPACING } from '../../constants';
import { AVAILABLE_TOOLS } from '../../services/tools';
import { toolAvailability } from '../../services/tools/toolOffering';
import { toolPermissions } from '../../services/tools/toolPermissions';
import { useAppStore } from '../../stores';
import { hasProToolsScreen, useOpenProTools } from '../../hooks/useOpenProTools';
import type { ThemeColors, ThemeShadows } from '../../theme';

const TOOL_WARNING_COLOR = '#F59E0B';
/** What the row says after the user refused the permission the tool asks for. */
const DENIED_COPY: Record<string, string> = { calendar_read: 'Calendar access was not allowed' };

/**
 * Full-page tool picker (replaces the old bottom-sheet drawer). Lists the core-registry tools as toggles,
 * email and calendar tools included; a tool that needs an OS permission asks for it when switched on
 * (toolPermissions). A Pro Tools screen for MCP servers is optional: its row is pinned to the top of the
 * list only when one is registered (hasProToolsScreen, useOpenProTools).
 */
export const ToolsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const openProTools = useOpenProTools();

  const enabledTools = useAppStore(st => st.settings.enabledTools) || [];
  const toolCountHintDismissed = useAppStore(st => st.toolCountHintDismissed);
  const setToolCountHintDismissed = useAppStore(st => st.setToolCountHintDismissed);

  // The last tool whose permission the user refused; its row says so until it is switched on.
  const [deniedToolId, setDeniedToolId] = useState<string | null>(null);

  // The switch's own value is ignored: a tap flips what the store holds now.
  const handleToggleTool = async (toolId: string) => {
    const enabled = !(useAppStore.getState().settings.enabledTools || []).includes(toolId);
    const outcome = await toolPermissions.setToolEnabled({ toolId, enabled });
    // From the latest state, not this render's: a second tap may have started before the first one's answer.
    if (outcome === 'denied') setDeniedToolId(toolId);
    else setDeniedToolId(current => (current === toolId ? null : current));
  };

  const showHint = enabledTools.length > 3 && !toolCountHintDismissed;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tools</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Pro Tools sits on top of the listing, only when the Pro screen exists. */}
        {hasProToolsScreen() && (
          <TouchableOpacity
            style={styles.proToolsButton}
            onPress={openProTools}
            activeOpacity={0.75}
            testID="tools-pro-tools"
          >
            <View style={styles.proToolsIcon}>
              <IconMC name="crown" size={20} color={colors.primary} />
            </View>
            <View style={styles.toolInfo}>
              <Text style={styles.toolName}>Pro Tools</Text>
              <Text style={styles.toolDescription}>Email, calendar and MCP servers</Text>
            </View>
            <Icon name="chevron-right" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {showHint && (
          <View style={[styles.hintBanner, { backgroundColor: colors.surface }]}>
            <Icon name="alert-circle" size={16} color={TOOL_WARNING_COLOR} style={styles.hintIcon} />
            <View style={styles.hintBody}>
              <Text style={[styles.hintText, { color: colors.text }]}>
                Too many tools can confuse the model and increase latency on the first response. Stick to 2-3 tools for best results.
              </Text>
              <TouchableOpacity onPress={setToolCountHintDismissed} style={styles.hintDismiss}>
                <Text style={styles.hintDismissText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {AVAILABLE_TOOLS.map(tool => {
          const isEnabled = enabledTools.includes(tool.id);
          const { available } = toolAvailability(tool.id);
          const deniedCopy = deniedToolId === tool.id && tool.requiredPermission ? DENIED_COPY[tool.requiredPermission] : undefined;
          return (
            <View key={tool.id} style={styles.toolRow} testID={`tool-picker-row-${tool.id}`}>
              <View style={styles.toolIcon}>
                <Icon name={tool.icon} size={20} color={isEnabled ? colors.primary : colors.textMuted} />
              </View>
              <View style={styles.toolInfo}>
                <View style={styles.toolNameRow}>
                  <Text style={styles.toolName} testID={`tool-picker-name-${tool.id}`}>{tool.displayName}</Text>
                  {tool.requiresNetwork && (
                    <Icon name="wifi" size={12} color={colors.textMuted} style={styles.networkIcon} />
                  )}
                </View>
                <Text style={styles.toolDescription}>{tool.description}</Text>
                {tool.userNote ? <Text style={styles.toolNote}>{tool.userNote}</Text> : null}
                {!available && <Text style={styles.toolNote}>Not available on this device</Text>}
                {deniedCopy ? <Text style={[styles.toolNote, { color: colors.error }]}>{deniedCopy}</Text> : null}
              </View>
              <Switch
                value={isEnabled && available}
                disabled={!available}
                onValueChange={() => { handleToggleTool(tool.id); }}
                trackColor={{ false: colors.border, true: `${colors.primary}80` }}
                thumbColor={isEnabled && available ? colors.primary : colors.textMuted}
              />
            </View>
          );
        })}
        <Text style={styles.hint}>
          Enabling more tools can confuse the model and increases latency on first response.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    marginRight: SPACING.md,
  },
  headerTitle: {
    ...TYPOGRAPHY.h2,
    fontSize: 18,
    color: colors.text,
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  proToolsButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  proToolsIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.primary}20`,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 12,
  },
  toolRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toolIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginRight: 12,
  },
  toolInfo: {
    flex: 1,
    marginRight: 12,
  },
  toolNameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  toolName: {
    fontSize: 15,
    fontFamily: FONTS.mono,
    fontWeight: '400' as const,
    color: colors.text,
  },
  networkIcon: {
    marginLeft: 6,
  },
  toolDescription: {
    fontSize: 12,
    fontFamily: FONTS.mono,
    color: colors.textMuted,
    marginTop: 2,
  },
  toolNote: {
    ...TYPOGRAPHY.meta,
    color: colors.textSecondary,
    marginTop: SPACING.xs,
  },
  hint: {
    ...TYPOGRAPHY.meta,
    color: colors.textMuted,
    marginTop: SPACING.lg,
    textAlign: 'center' as const,
  },
  hintBanner: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    borderWidth: 1,
    borderColor: TOOL_WARNING_COLOR,
    borderRadius: 10,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  hintIcon: {
    marginRight: SPACING.sm,
    marginTop: 1,
  },
  hintBody: {
    flex: 1,
  },
  hintText: {
    ...TYPOGRAPHY.bodySmall,
    lineHeight: 18,
  },
  hintDismiss: {
    marginTop: SPACING.sm,
  },
  hintDismissText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '400' as const,
    color: TOOL_WARNING_COLOR,
  },
});
