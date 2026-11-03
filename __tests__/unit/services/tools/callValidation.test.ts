import { preApprovalProblem } from '../../../../src/services/tools/callValidation';

const call = (name: string, args: Record<string, unknown>) => ({ name, arguments: args });

describe('preApprovalProblem', () => {
  it('lets a complete draft go to the user', () => {
    expect(preApprovalProblem(call('draft_email', { to: 'bob@example.com', subject: 'Hi', body: 'Hello' }))).toBeNull();
    expect(preApprovalProblem(call('draft_email', { subject: 'Hi', body: 'Hello' }))).toBeNull(); // recipients are optional
    expect(preApprovalProblem(call('draft_email', { to: ['a@example.com', 'b@example.com'], subject: 'Hi', body: 'Hello' }))).toBeNull();
  });

  it('names each required argument that is missing, empty or blank', () => {
    expect(preApprovalProblem(call('draft_email', { subject: 'Hi', body: '' }))).toBe('Missing required parameter: body');
    expect(preApprovalProblem(call('draft_email', { subject: '  \n', body: 'Hello' }))).toBe('Missing required parameter: subject');
    expect(preApprovalProblem(call('draft_email', {}))).toBe('Missing required parameters: subject, body');
    expect(preApprovalProblem(call('draft_email', { subject: 5, body: ['x'] }))).toBe('Missing required parameters: subject, body');
  });

  it('refuses recipients that do not fit in one draft', () => {
    const to = Array.from({ length: 80 }, (_, i) => `person${i}@example.com`);
    expect(preApprovalProblem(call('draft_email', { to, subject: 'Hi', body: 'Hello' }))).toMatch(/^Too many recipients for one draft\./);
  });

  it('leaves tools that need no approval to their own handling', () => {
    expect(preApprovalProblem(call('web_search', {}))).toBeNull();
    expect(preApprovalProblem(call('calculator', {}))).toBeNull();
    expect(preApprovalProblem(call('some_mcp_tool', {}))).toBeNull();
  });
});
