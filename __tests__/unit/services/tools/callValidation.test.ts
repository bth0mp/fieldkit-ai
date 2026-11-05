import { preApprovalProblem } from '../../../../src/services/tools/callValidation';

const call = (name: string, args: Record<string, unknown>) => ({ name, arguments: args });
const inChat = { conversationId: null };

describe('preApprovalProblem', () => {
  it('lets a complete draft go to the user', () => {
    expect(preApprovalProblem(call('draft_email', { to: 'bob@example.com', subject: 'Hi', body: 'Hello' }), inChat)).toBeNull();
    expect(preApprovalProblem(call('draft_email', { subject: 'Hi', body: 'Hello' }), inChat)).toBeNull(); // recipients are optional
    expect(preApprovalProblem(call('draft_email', { to: ['a@example.com', 'b@example.com'], subject: 'Hi', body: 'Hello' }), inChat)).toBeNull();
  });

  it('names each required argument that is missing, empty or blank', () => {
    expect(preApprovalProblem(call('draft_email', { subject: 'Hi', body: '' }), inChat)).toBe('Missing required parameter: body');
    expect(preApprovalProblem(call('draft_email', { subject: '  \n', body: 'Hello' }), inChat)).toBe('Missing required parameter: subject');
    expect(preApprovalProblem(call('draft_email', {}), inChat)).toBe('Missing required parameters: subject, body');
    expect(preApprovalProblem(call('draft_email', { subject: 5, body: ['x'] }), inChat)).toBe('Missing required parameters: subject, body');
  });

  it('refuses recipients that do not fit in one draft', () => {
    const to = Array.from({ length: 80 }, (_, i) => `person${i}@example.com`);
    expect(preApprovalProblem(call('draft_email', { to, subject: 'Hi', body: 'Hello' }), inChat)).toMatch(/^Too many recipients for one draft\./);
  });

  it('leaves tools that need no approval to their own handling', () => {
    expect(preApprovalProblem(call('web_search', {}), inChat)).toBeNull();
    expect(preApprovalProblem(call('calculator', {}), inChat)).toBeNull();
    expect(preApprovalProblem(call('some_mcp_tool', {}), inChat)).toBeNull();
  });
});
