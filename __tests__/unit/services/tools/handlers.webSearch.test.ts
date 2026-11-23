/**
 * Web search tool: a refused search page is a failure, never "no results", and entity text
 * is decoded exactly once.
 */
import { executeToolCall } from '../../../../src/services/tools/handlers';

jest.mock('../../../../src/utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), log: jest.fn(),
}));

const originalFetch = (globalThis as any).fetch;
afterEach(() => { (globalThis as any).fetch = originalFetch; });

function search(response: { status?: number; html: string }) {
  (globalThis as any).fetch = jest.fn().mockResolvedValue({
    status: response.status ?? 200,
    text: jest.fn().mockResolvedValue(response.html),
  });
  return executeToolCall({ id: 'call-1', name: 'web_search', arguments: { query: 'weather' } });
}

function pageWith(title: string, snippet: string): string {
  return `<html><body><div class="result-wrapper">
    <a class="result-header" href="https://example.com"><span class="snippet-title">${title}</span></a>
    <p class="snippet-description">${snippet}</p></div></body></html>`;
}

describe('web search failures', () => {
  it.each([429, 503])('reports HTTP %i as a failed search that names the status', async (status) => {
    const result = await search({ status, html: '<html><body>Too many requests</body></html>' });

    expect(result.error).toContain(`HTTP ${status}`);
    expect(result.content).toBe('');
  });

  it('still says nothing was found when the page loads with no results', async () => {
    const result = await search({ status: 200, html: '<html><body>No matching documents</body></html>' });

    expect(result.error).toBeUndefined();
    expect(result.content).toContain('No results found');
  });
});

describe('web search entity decoding', () => {
  it('keeps escaped entity text as text', async () => {
    const result = await search({ html: pageWith('Fish &amp;amp; chips', 'Use &amp;lt;b&amp;gt; tags') });

    expect(result.content).toContain('Fish &amp; chips');
    expect(result.content).toContain('Use &lt;b&gt; tags');
  });

  it('decodes single-level entities', async () => {
    const result = await search({ html: pageWith('Don&#39;t &amp; stop', 'Wrap in &lt;b&gt;') });

    expect(result.content).toContain("Don't & stop");
    expect(result.content).toContain('Wrap in <b>');
  });
});
