/**
 * Switching a tool on or off. A tool that needs an OS permission asks for it when the user switches the
 * tool on, and stays off when the user says no; switching off never prompts. A tool the device cannot run
 * (toolAvailability) cannot be switched on.
 */
import { useAppStore } from '../../stores';
import { AVAILABLE_TOOLS } from './registry';
import { toolAvailability } from './toolOffering';
import { calendarService } from '../calendar/calendarService';
import type { ToolDefinition } from './types';

type Permission = NonNullable<ToolDefinition['requiredPermission']>;

const PERMISSION_REQUESTS: Record<Permission, () => Promise<boolean>> = {
  calendar_read: () => calendarService.ensureReadPermission(),
};

/** Write the flip from fresh state, so two quick toggles never undo each other. */
function writeEnabled(toolId: string, enabled: boolean): void {
  const current = useAppStore.getState().settings.enabledTools || [];
  const without = current.filter(id => id !== toolId);
  useAppStore.getState().updateSettings({ enabledTools: enabled ? [...without, toolId] : without });
}

export const toolPermissions = {
  async setToolEnabled(input: { toolId: string; enabled: boolean }): Promise<'enabled' | 'disabled' | 'denied' | 'unavailable'> {
    const { toolId, enabled } = input;
    if (!enabled) {
      writeEnabled(toolId, false);
      return 'disabled';
    }
    if (!toolAvailability(toolId).available) return 'unavailable';
    const permission = AVAILABLE_TOOLS.find(tool => tool.id === toolId)?.requiredPermission;
    // A tool without a permission is written straight away (no await), so the switch moves on the same tap.
    if (permission && !(await PERMISSION_REQUESTS[permission]())) return 'denied';
    writeEnabled(toolId, true);
    return 'enabled';
  },
};
