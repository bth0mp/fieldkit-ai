import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, InteractionManager } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AttachStep, useSpotlightTour } from 'react-native-spotlight-tour';
import { ModelRow } from '../../components';
import { consumePendingSpotlight, peekPendingSpotlight } from '../../components/onboarding/spotlightState';
import { MODEL_PICKER_STEP_INDEX } from '../../components/onboarding/spotlightConfig';
import { useThemedStyles } from '../../theme';
import { useAppStore, useRemoteServerStore } from '../../stores';
import { useActiveTextModel } from '../../hooks/useActiveTextModel';
import { useModelChoice, ModelTarget } from '../../hooks/useModelChoice';
import { useModelLoadingState } from '../../hooks/useModelLoadingState';
import { hardwareService } from '../../services';
import { fileExceedsBudget } from '../../services/memoryBudget';
import { textOverheadMultiplier } from '../../services/activeModelService/types';
import { getMmProjFileSize } from '../../utils/modelHelpers';
import { createStyles } from './styles';
import type { NavigationProp } from './types';

type Props = { kind: 'text' | 'image'; onChosen: () => void; onError: (message: string) => void };
type RowContent = { inUse: boolean; testID: string; name: string; size: string; quant?: string; isVision?: boolean; ramHint?: string; remote?: boolean };

const BYTES_PER_GB = 1024 * 1024 * 1024;
const IMAGE_RAM_MULTIPLIER = 1.8;

const EMPTY_TEXT = {
  text: 'No text models yet. Download one below, or add a remote server.',
  image: 'No image models yet. Download one below.',
};

/** In use first, then newest download; a record with no date goes last. */
function ordered<T extends { downloadedAt?: string }>(models: T[], inUse: (m: T) => boolean): T[] {
  const rank = (m: T) => (inUse(m) ? 1 : 0);
  return [...models].sort((a, b) => rank(b) - rank(a) || (b.downloadedAt ?? '').localeCompare(a.downloadedAt ?? ''));
}

function ramHint(bytes: number, multiplier: number): string {
  const fits = !fileExceedsBudget(bytes, hardwareService.getTotalMemoryGB());
  return `~${((bytes * multiplier) / BYTES_PER_GB).toFixed(1)} GB RAM${fits ? '' : ' (may not fit)'}`;
}

const samePending = (a: ModelTarget | null, b: ModelTarget) => a !== null && a.kind === b.kind && a.id === b.id
  && (a.kind !== 'remote' || (b.kind === 'remote' && a.serverId === b.serverId));

/** The models on the phone and, for text, on the remote servers, with Use for each and Unload for the one in use. */
export const YourModels: React.FC<Props> = ({ kind, onChosen, onError }) => {
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<NavigationProp>();
  const { goTo } = useSpotlightTour();
  const { busy, pending, choose, drop } = useModelChoice({ onChosen, onError });
  const loading = useModelLoadingState();
  const active = useActiveTextModel();
  const downloadedModels = useAppStore(s => s.downloadedModels);
  const downloadedImageModels = useAppStore(s => s.downloadedImageModels);
  const activeImageModelId = useAppStore(s => s.activeImageModelId);
  const textMultiplier = textOverheadMultiplier(useAppStore(s => s.settings?.inferenceBackend));
  const servers = useRemoteServerStore(s => s.servers);
  const serverHealth = useRemoteServerStore(s => s.serverHealth);
  const discoveredModels = useRemoteServerStore(s => s.discoveredModels);
  const activeServerId = useRemoteServerStore(s => s.activeServerId);
  const activeRemoteTextModelId = useRemoteServerStore(s => s.activeRemoteTextModelId);

  let built = 0;
  const rowFor = (key: string, target: ModelTarget, { inUse, ...content }: RowContent) => {
    // The row spins while its own switch runs, or, when nothing was chosen here, while the model in use loads.
    const row = (
      <ModelRow
        {...content}
        variant={kind}
        isActive={inUse}
        loading={samePending(pending, target) || (pending === null && loading[kind] && inUse)}
        disabled={busy[kind]}
        status={inUse ? 'In use' : undefined}
        onPress={inUse ? undefined : () => choose(target)}
        action={inUse ? { label: target.kind === 'remote' ? 'Disconnect' : 'Unload', onPress: () => drop(kind) } : { label: 'Use', onPress: () => choose(target) }}
      />
    );
    // The tour's "Use" step points at the first row.
    return built++ === 0 && kind === 'text' ? <AttachStep key={key} index={MODEL_PICKER_STEP_INDEX} fill>{row}</AttachStep> : React.cloneElement(row, { key });
  };

  const local: React.ReactElement[] = [];
  const groups: { id: string; name: string; rows: React.ReactElement[] }[] = [];
  if (kind === 'text') {
    const localInUse = (id: string) => !active.isRemote && active.modelId === id;
    for (const model of ordered(downloadedModels, m => localInUse(m.id))) {
      local.push(rowFor(model.id, { kind: 'text', id: model.id }, {
        inUse: localInUse(model.id),
        testID: 'model-item',
        name: model.name,
        size: hardwareService.formatModelSize(model),
        quant: model.quantization,
        isVision: model.engine === 'llama' && model.isVisionModel,
        ramHint: ramHint(model.fileSize + getMmProjFileSize(model), textMultiplier),
      }));
    }
    for (const server of servers) {
      const remoteInUse = (id: string) => active.isRemote && activeServerId === server.id && activeRemoteTextModelId === id;
      const offline = serverHealth[server.id]?.isHealthy === false;
      const shown = (discoveredModels[server.id] || []).filter(m => !offline || remoteInUse(m.id));
      if (shown.length === 0) continue;
      groups.push({
        id: server.id,
        name: server.name,
        rows: shown.map(model => {
          const { supportsVision, supportsToolCalling, supportsThinking } = model.capabilities;
          return rowFor(`${server.id}-${model.id}`, { kind: 'remote', serverId: server.id, id: model.id }, {
            inUse: remoteInUse(model.id),
            testID: 'remote-model-item',
            name: model.name,
            size: [supportsVision && 'Vision', supportsToolCalling && 'Tools', supportsThinking && 'Thinking'].filter(Boolean).join(' · '),
            remote: true,
          });
        }),
      });
    }
  } else {
    for (const model of ordered(downloadedImageModels, m => m.id === activeImageModelId)) {
      local.push(rowFor(model.id, { kind: 'image', id: model.id }, {
        inUse: model.id === activeImageModelId,
        testID: 'model-item',
        name: model.name,
        size: hardwareService.formatBytes(model.size),
        quant: model.style || 'Image',
        ramHint: ramHint(model.size, IMAGE_RAM_MULTIPLIER),
      }));
    }
  }

  useEffect(() => {
    if (kind !== 'text' || peekPendingSpotlight() !== MODEL_PICKER_STEP_INDEX) return;
    consumePendingSpotlight();
    if (built === 0) return;
    const task = InteractionManager.runAfterInteractions(() => goTo(MODEL_PICKER_STEP_INDEX));
    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View testID={`your-models-${kind}`}>
      <View style={styles.yourModelsHeader}>
        <Text style={styles.recommendedTitle} accessibilityRole="header">Your models</Text>
        {kind === 'text' && (
          <TouchableOpacity
            testID="your-models-add-server"
            onPress={() => navigation.navigate('RemoteServers')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
          >
            <Text style={styles.yourModelsAdd}>Add remote server</Text>
          </TouchableOpacity>
        )}
      </View>
      {built === 0 && <Text testID="your-models-empty" style={styles.yourModelsEmpty}>{EMPTY_TEXT[kind]}</Text>}
      {local}
      {groups.map(group => (
        <View key={group.id}>
          <Text style={styles.yourModelsServer}>{group.name}</Text>
          {group.rows}
        </View>
      ))}
    </View>
  );
};
