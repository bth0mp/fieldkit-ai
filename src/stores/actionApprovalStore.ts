import { create } from 'zustand';
import type { ApprovalSummary } from '../services/tools/approvalSummary';

/** One tool call waiting for the user's tap on the approval card. */
interface PendingApproval {
  id: string;
  conversationId: string;
  toolName: string;
  summary: ApprovalSummary;
}

interface ActionApprovalState {
  /** Waiting requests in call order; the card shows the first one for the open conversation. */
  pending: PendingApproval[];
}

/**
 * Read-only projection of actionApprovalService for the approval card. Not persisted: a request
 * lives only as long as the turn that waits on it. The service is the only writer.
 */
export const useActionApprovalStore = create<ActionApprovalState>()(() => ({ pending: [] }));
