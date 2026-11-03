/**
 * Owns the approval requests for tool calls that send or write. The tool loop awaits `request`; the
 * approval card calls `resolve` with the user's tap. Requests wait in call order per conversation, and
 * the card shows only the first one for the open conversation, so one card shows at a time.
 *
 * The store is a read-only projection of the queue and this service is its only writer.
 */
import { useActionApprovalStore } from '../../stores/actionApprovalStore';
import type { ApprovalSummary } from '../tools/approvalSummary';
import type { ToolCall } from '../tools/types';
import logger from '../../utils/logger';

const LOG = '[APPROVAL-SM]';

type ApprovalDecision = 'approved' | 'declined';

interface ApprovalRequest {
  id: string;
  conversationId: string;
  toolName: string;
  summary: ApprovalSummary;
  settle: (decision: ApprovalDecision) => void;
}

class ActionApprovalService {
  private queue: ApprovalRequest[] = [];
  private nextId = 0;
  // ponytail: ids of deleted chats, kept for the app's lifetime; ids are never reused and deletes are few.
  private closed = new Set<string>();

  /** Wait for the user's decision on this call. A deleted chat's call is declined at once: its card could
   *  never show, and its turn would wait on it forever. */
  request(input: { call: ToolCall; conversationId: string; summary: ApprovalSummary }): Promise<ApprovalDecision> {
    const { call, conversationId, summary } = input;
    if (this.closed.has(conversationId)) {
      logger.log(`${LOG} request declined conv=${conversationId} tool=${call.name}: chat deleted`);
      return Promise.resolve('declined');
    }
    return new Promise(settle => {
      this.nextId += 1;
      const id = `approval-${this.nextId}`;
      this.queue = [...this.queue, { id, conversationId, toolName: call.name, summary, settle }];
      logger.log(`${LOG} request id=${id} conv=${conversationId} tool=${call.name} waiting=${this.queue.length}`);
      this.publish();
    });
  }

  /** The user's tap. An id that is no longer waiting (a second tap, an ended turn) is ignored. */
  resolve(input: { id: string; decision: ApprovalDecision }): void {
    const { id, decision } = input;
    const request = this.queue.find(r => r.id === id);
    if (!request) {
      logger.log(`${LOG} resolve ignored id=${id} decision=${decision}: not waiting`);
      return;
    }
    this.queue = this.queue.filter(r => r !== request);
    logger.log(`${LOG} resolve id=${id} conv=${request.conversationId} tool=${request.toolName} decision=${decision}`);
    this.publish();
    request.settle(decision);
  }

  /** Decline every request of a conversation (its turn was stopped or the chat deleted). */
  declineConversation(conversationId: string): void {
    const declined = this.queue.filter(r => r.conversationId === conversationId);
    if (declined.length === 0) return;
    this.queue = this.queue.filter(r => r.conversationId !== conversationId);
    logger.log(`${LOG} declineConversation conv=${conversationId} declined=${declined.length}`);
    this.publish();
    declined.forEach(r => r.settle('declined'));
  }

  /** The chat was deleted: decline what waits and every later request of it. Unlike a stop, which declines
   *  only what waits, so the chat's next turn can ask again. */
  closeConversation(conversationId: string): void {
    this.closed.add(conversationId);
    logger.log(`${LOG} closeConversation conv=${conversationId}`);
    this.declineConversation(conversationId);
  }

  private publish(): void {
    useActionApprovalStore.setState({
      pending: this.queue.map(({ id, conversationId, toolName, summary }) => ({ id, conversationId, toolName, summary })),
    });
  }
}

export const actionApprovalService = new ActionApprovalService();
