import type { LlamaContext } from 'llama.rn';
import logger from '../utils/logger';

/**
 * The context with a completion that honours a Stop asked for before it started, or as it starts.
 *
 * llama.rn clears a stop when a completion begins, and a turn spends time preparing its messages
 * before that. A Stop pressed in between was lost and the reply ran to the end. The turn records the
 * Stop (`isStopRequested`); this completion then does not start, and a Stop that lands as the native
 * completion starts is sent again with the first token.
 */
export function stopAware(ctx: LlamaContext, isStopRequested: () => boolean): LlamaContext {
  const complete = (params: unknown, onToken?: (data: any) => void) => {
    if (isStopRequested()) {
      logger.log('[LLM] Stop arrived before the completion started; not starting it');
      return Promise.resolve({ text: '', content: '', interrupted: true, tokens_predicted: 0 });
    }
    let resent = false;
    return ctx.completion(params as any, (data: any) => {
      if (isStopRequested() && !resent) {
        resent = true;
        // llama.rn types stopCompletion() as a Promise, but its JSI sets the interrupt flag and
        // returns undefined: await it, never chain on what it returns (a throw here would escape
        // from the native token callback).
        // eslint-disable-next-line no-void
        void (async () => {
          try { await ctx.stopCompletion(); } catch { /* the context is already gone: nothing to stop */ }
        })();
      }
      onToken?.(data);
    });
  };
  return new Proxy(ctx, {
    get: (target, key) => {
      if (key === 'completion') return complete;
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
