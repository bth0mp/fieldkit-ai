import { useEffect, useState } from 'react';
import { activeModelService } from '../services/activeModelService';
import type { ActiveModelInfo } from '../services/activeModelService/types';

type LoadingState = { text: boolean; image: boolean };

const read = (info: ActiveModelInfo): LoadingState => ({ text: info.text.isLoading, image: info.image.isLoading });

/** Whether a text or an image model is being loaded right now. The service owns the flag; this only shows it. */
export function useModelLoadingState(): LoadingState {
  const [loading, setLoading] = useState(() => read(activeModelService.getActiveModels()));
  useEffect(() => {
    const update = (info: ActiveModelInfo) => {
      const next = read(info);
      setLoading(prev => (prev.text === next.text && prev.image === next.image ? prev : next));
    };
    update(activeModelService.getActiveModels());
    return activeModelService.subscribe(update);
  }, []);
  return loading;
}
