export interface ToolDefinition {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: string;
  parameters: Record<string, ToolParameter>;
  requiresNetwork?: boolean;
  /** The user approves each call on a card in the chat before it runs (tools that send or write). */
  requiresApproval?: boolean;
  /** Its results are the user's private data (the calendar): it is never offered to, or run for, a remote model. */
  handlesPrivateData?: boolean;
  /** A native module the tool needs; without it the tool is unavailable on this device (toolAvailability). */
  requiredModule?: 'calendar';
  /** An OS permission asked for when the user switches the tool on (toolPermissions). */
  requiredPermission?: 'calendar_read';
  /** A note shown to the user on the Tools screen. Never sent to the model. */
  userNote?: string;
}

interface ToolParameter {
  type: string;
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolCall {
  id?: string;
  name: string;
  arguments: Record<string, any>;
  context?: { projectId?: string };
}

/** How a tool call resolved. The loop sets this for EVERY call so the model and UI
 *  get an unambiguous signal — a failure or empty result is never mistaken for a
 *  successful one. */
type ToolResultStatus = 'ok' | 'empty' | 'error';

/** Coarse failure cause, so the model/UI can tell "retry might help" (timeout/network)
 *  from "the call was wrong" (validation/not-found) from an internal bug. */
export type ToolErrorCategory = 'timeout' | 'network' | 'validation' | 'not-found' | 'internal' | 'declined';

export interface ToolResult {
  toolCallId?: string;
  name: string;
  content: string;
  error?: string;
  /** Set when status==='error'. */
  errorCategory?: ToolErrorCategory;
  /** Derived/normalized by the loop (normalizeToolResult): ok | empty | error. */
  status?: ToolResultStatus;
  durationMs: number;
}
