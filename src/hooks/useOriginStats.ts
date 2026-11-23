import { useEffect, useState } from 'react';
import { getOriginStats, type OriginStats } from '../services/originStats';

/** The numbers of each distinct repo that have arrived so far, by repo. Repos that fail are left out. */
export function useOriginStats(repos: string[]): Record<string, OriginStats> {
  const [stats, setStats] = useState<Record<string, OriginStats>>({});
  const key = [...new Set(repos)].sort().join('\n');
  useEffect(() => {
    let live = true;
    for (const repo of key ? key.split('\n') : []) {
      getOriginStats(repo).then(s => {
        if (live && s) setStats(prev => ({ ...prev, [repo]: s }));
      });
    }
    return () => { live = false; };
  }, [key]);
  return stats;
}
