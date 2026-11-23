/**
 * Device-boundary fake for the Hugging Face HTTP API. It replaces `global.fetch` (the network) and
 * records every request, so tests mount real code and assert on what was asked and what was shown.
 *
 *   /api/models?...      -> setList(fn) answer (default [])
 *   /api/models/{id}     -> setDetails(map) answer, 404 for unknown ids
 *   /api/models/<repo>/tree/main -> setTree(repo, entries) answer, [] for other repos
 *   anything else        -> rejects with TypeError('Network request failed')
 *
 * After setOffline(true) every request rejects with TypeError('Network request failed'), as with no connection.
 *
 * After hold(), list answers wait until release(i) is called for the i-th held request, in any order.
 */
type Row = Record<string, unknown>;
type ListAnswer = Row[] | Error;

export interface HfApiFake {
  requests(): URL[];
  setList(fn: (url: URL) => ListAnswer): void;
  setDetails(d: Record<string, Row>): void;
  setTree(repo: string, entries: Row[]): void;
  setOffline(offline: boolean): void;
  hold(): { count(): number; release(i: number, answer?: ListAnswer): void };
}

const json = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;

export function installHfApiFake(): HfApiFake {
  const seen: URL[] = [];
  let listFn: (url: URL) => ListAnswer = (_url: URL) => [];
  let details: Record<string, Row> = {};
  const trees: Record<string, Row[]> = {};
  let offline = false;
  let held: Array<{ resolve: (answer?: ListAnswer) => void }> | null = null;
  const answer = (a: ListAnswer): Response => {
    if (a instanceof Error) throw a;
    return json(a);
  };

  (global as { fetch: unknown }).fetch = jest.fn(async (input: unknown) => {
    const url = new URL(String(input));
    seen.push(url);
    if (offline) throw new TypeError('Network request failed');
    const path = url.pathname;
    const tree = /^\/api\/models\/(.+)\/tree\/main$/.exec(path);
    if (tree) return json(trees[decodeURIComponent(tree[1])] ?? []);
    if (path === '/api/models') {
      const natural = listFn(url);
      if (!held) return answer(natural);
      const queue = held;
      return new Promise<Response>((resolve, reject) => {
        queue.push({
          resolve: override => {
            try { resolve(answer(override ?? natural)); } catch (e) { reject(e); }
          },
        });
      });
    }
    const match = /^\/api\/models\/(.+)$/.exec(path);
    if (match) {
      const d = details[decodeURIComponent(match[1])];
      return d ? json(d) : json({ error: 'Not found' }, 404);
    }
    throw new TypeError('Network request failed');
  });

  return {
    requests: () => seen,
    setList: fn => { listFn = fn; },
    setDetails: d => { details = d; },
    setTree: (repo, entries) => { trees[repo] = entries; },
    setOffline: next => { offline = next; },
    hold: () => {
      held = [];
      const queue = held;
      return { count: () => queue.length, release: (i, a) => queue[i].resolve(a) };
    },
  };
}
