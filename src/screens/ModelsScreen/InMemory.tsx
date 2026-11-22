import React, { useRef, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { ModelsManagerSheet } from '../../components/models/ModelsManagerSheet';
import type { ModelRowType } from '../../components/models/ModelsManagerSheet';
import { useResidentRows } from '../../components/models/useResidentRows';
import { showAlert, hideAlert } from '../../components/CustomAlert';
import type { AlertState } from '../../components/CustomAlert';
import { useTheme, useThemedStyles } from '../../theme';
import { useAppStore } from '../../stores';
import { useWhisperStore } from '../../stores/whisperStore';
import { useUiModeStore } from '../../stores/uiModeStore';
import { useActiveTextModel } from '../../hooks/useActiveTextModel';
import { useEjectAllModels } from '../../hooks/useEjectAllModels';
import { useModelLoadingState } from '../../hooks/useModelLoadingState';
import { WHISPER_MODELS } from '../../services';
import { createStyles } from './styles';
import type { ModelTab } from './types';

type Props = { onOpenTab: (tab: ModelTab) => void; setAlertState: (state: AlertState) => void };

const ROW_TAB: Record<ModelRowType, ModelTab> = { text: 'text', image: 'image', voice: 'voice', speech: 'transcription' };

/** "In memory: 5.1 GB" (the total of every loaded model) and the sheet that lists them, with their eject. */
export const InMemory: React.FC<Props> = ({ onOpenTab, setAlertState }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [open, setOpen] = useState(false);
  // Run once the sheet has fully closed, so a tab change or the confirm never meets the sheet's own dismissal.
  const afterClose = useRef<(() => void) | null>(null);
  const resident = useResidentRows(true);
  const loading = useModelLoadingState();
  const active = useActiveTextModel();
  const { isEjecting, hasActiveModel, ejectAll } = useEjectAllModels();
  const imageModel = useAppStore(s => s.downloadedImageModels.find(m => m.id === s.activeImageModelId));
  const voiceSummary = useUiModeStore(s => s.voiceSummary);
  const whisperModelId = useWhisperStore(s => s.downloadedModelId);

  const totalMB = Object.values(resident).reduce((sum, r) => sum + (r?.sizeMB ?? 0), 0);
  const text = Object.keys(resident).length === 0 ? 'In memory: none' : `In memory: ${(totalMB / 1024).toFixed(1)} GB`;

  const labels: Record<ModelRowType, string> = {
    text: active.model ? active.modelName : '—',
    image: imageModel?.name ?? '—',
    voice: voiceSummary ?? '—',
    speech: WHISPER_MODELS.find(m => m.id === whisperModelId)?.name ?? '—',
  };

  const closeThen = (action: () => void) => {
    afterClose.current = action;
    setOpen(false);
  };
  const confirmEjectAll = () => {
    setAlertState(showAlert('Eject All Models', 'Unload all active models to free up memory?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Eject All', style: 'destructive',
        onPress: async () => {
          setAlertState(hideAlert());
          try {
            const count = await ejectAll();
            if (count > 0) setAlertState(showAlert('Done', `Unloaded ${count} model${count > 1 ? 's' : ''}`));
          } catch {
            setAlertState(showAlert('Error', 'Failed to unload models'));
          }
        },
      },
    ]));
  };

  return (
    <>
      <TouchableOpacity
        style={styles.inMemoryButton}
        onPress={() => setOpen(true)}
        testID="in-memory-button"
        accessibilityRole="button"
        accessibilityLabel={text}
      >
        <Icon name="cpu" size={20} color={colors.primary} />
        <Text style={styles.importButtonText} numberOfLines={1} testID="in-memory-label">{text}</Text>
        <Icon name="chevron-right" size={16} color={colors.textMuted} />
      </TouchableOpacity>
      <ModelsManagerSheet
        visible={open}
        onClose={() => setOpen(false)}
        onClosed={() => {
          const action = afterClose.current;
          afterClose.current = null;
          action?.();
        }}
        labels={labels}
        remote={{ text: active.isRemote }}
        loadingState={{ isLoading: loading.text || loading.image, type: loading.text ? 'text' : loading.image ? 'image' : null }}
        isEjecting={isEjecting}
        hasActiveModel={hasActiveModel}
        onOpenRow={row => closeThen(() => onOpenTab(ROW_TAB[row]))}
        onEject={() => closeThen(confirmEjectAll)}
      />
    </>
  );
};
