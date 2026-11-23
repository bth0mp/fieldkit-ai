import { useRef, useState } from 'react';
import { chooseTextModel, chooseRemoteTextModel, chooseImageModel, dropTextModel, dropImageModel } from '../services/modelChoice';
import { useModelLoadingState } from './useModelLoadingState';

export type ModelTarget = { kind: 'text' | 'image'; id: string } | { kind: 'remote'; serverId: string; id: string };
type Kind = 'text' | 'image';

type Handlers = { onChosen: () => void; onError: (message: string) => void };

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Choosing and dropping a model for a screen. The services do the work; this holds the spinner (`pending`,
 * `busy`) and reports the outcome. A second call of a kind is ignored while one of this hook's calls of
 * that kind is still running.
 */
export function useModelChoice(handlers: Handlers) {
  const loading = useModelLoadingState();
  const [own, setOwn] = useState<Record<Kind, boolean>>({ text: false, image: false });
  const [pending, setPending] = useState<ModelTarget | null>(null);
  const running = useRef<Record<Kind, boolean>>({ text: false, image: false });
  const latest = useRef(handlers);
  latest.current = handlers;

  /** Runs `work` as this hook's only call of `kind`; false when it was ignored or failed. */
  const run = async (kind: Kind, work: () => Promise<void>, failure: (e: unknown) => string): Promise<boolean> => {
    if (running.current[kind]) return false;
    running.current[kind] = true;
    setOwn(prev => ({ ...prev, [kind]: true }));
    try {
      await work();
      return true;
    } catch (e) {
      latest.current.onError(failure(e));
      return false;
    } finally {
      running.current[kind] = false;
      setOwn(prev => ({ ...prev, [kind]: false }));
    }
  };

  const choose = async (target: ModelTarget) => {
    const kind: Kind = target.kind === 'image' ? 'image' : 'text';
    if (running.current[kind]) return;
    setPending(target);
    let work: () => Promise<void>;
    let failure: (e: unknown) => string;
    if (target.kind === 'remote') {
      work = () => chooseRemoteTextModel(target.serverId, target.id);
      failure = e => `Failed to connect to remote model: ${messageOf(e)}`;
    } else {
      work = () => (target.kind === 'text' ? chooseTextModel(target.id) : chooseImageModel(target.id));
      failure = e => `Failed to switch models: ${messageOf(e)}`;
    }
    const chosen = await run(kind, work, failure);
    setPending(null);
    if (chosen) latest.current.onChosen();
  };

  const drop = async (kind: Kind) => {
    await run(kind, () => (kind === 'text' ? dropTextModel() : dropImageModel()), () => 'Failed to unload model');
  };

  return { busy: { text: loading.text || own.text, image: loading.image || own.image }, pending, choose, drop };
}
