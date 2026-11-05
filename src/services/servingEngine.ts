/**
 * Which engine serves a tool-loop completion. Defined once, in the routing order the tool loop follows, so
 * the loop's routing, the capabilities it reads, and the tool policy that depends on the engine (what is
 * offered, what is refused) can never disagree.
 */
import { liteRTService } from './litert';
import { getActiveEngineService, isRemoteTextModelActive } from './engines';

export type ServingEngine = 'litert' | 'remote' | 'llama';

/**
 * An active LiteRT model serves a turn that has a conversation (its native session is keyed on it), even
 * while a remote server is selected. Otherwise a remote provider serves when the caller forces it or one is
 * active, and the local llama model serves the rest.
 */
export function servingEngine({ forceRemote, conversationId }: { forceRemote?: boolean; conversationId?: string | null }): ServingEngine {
  if (getActiveEngineService() === liteRTService && conversationId) return 'litert';
  if (forceRemote || isRemoteTextModelActive()) return 'remote';
  return 'llama';
}
