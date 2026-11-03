import { buildMailtoUrl, draftFromArgs, recipientsProblem } from '../../../src/utils/mailto';

const MAX_URL = 4000;
const addresses = (count: number) => Array.from({ length: count }, (_, i) => `person${i}@example.com`).join(',');

describe('buildMailtoUrl', () => {
  it('encodes line breaks as CRLF and spaces as %20', () => {
    const { url, truncated, bodyTruncated } = buildMailtoUrl({ to: 'bob@example.com', subject: 'Hi & bye', body: 'One\nTwo' });
    expect(url).toBe('mailto:bob@example.com?subject=Hi%20%26%20bye&body=One%0D%0ATwo');
    expect(truncated).toBe(false);
    expect(bodyTruncated).toBe(false);
  });

  it('keeps the body when the subject is runaway long', () => {
    const { url, truncated, bodyTruncated } = buildMailtoUrl({ to: 'bob@example.com', subject: 'S'.repeat(5000), body: 'The body text survives' });
    expect(url.length).toBeLessThan(MAX_URL);
    expect(url).toContain('&body=The%20body%20text%20survives');
    expect(url.match(/S+/)![0].length).toBeLessThanOrEqual(300); // the subject got its bounded share
    expect(truncated).toBe(true);
    expect(bodyTruncated).toBe(false);
  });

  it('gives the body the room the subject did not use', () => {
    const { url, truncated, bodyTruncated } = buildMailtoUrl({ subject: 'Report', body: 'b'.repeat(6000) });
    expect(url.length).toBeLessThan(MAX_URL);
    expect(url.length).toBeGreaterThan(MAX_URL - 100);
    expect(truncated).toBe(true);
    expect(bodyTruncated).toBe(true);
  });

  it('stays under the cap for a long subject and a long body together', () => {
    const { url, bodyTruncated } = buildMailtoUrl({ to: addresses(40), subject: 'é'.repeat(5000), body: 'é\n'.repeat(5000) });
    expect(url.length).toBeLessThan(MAX_URL);
    expect(bodyTruncated).toBe(true);
    expect(() => decodeURIComponent(url)).not.toThrow(); // no cut inside a percent-escape
  });

  it('never splits a surrogate pair when it cuts', () => {
    const { url } = buildMailtoUrl({ subject: '😀'.repeat(400), body: '😀'.repeat(2000) });
    expect(url.length).toBeLessThan(MAX_URL);
    expect(() => decodeURIComponent(url)).not.toThrow();
  });

  it('stays under the cap for every recipient list that is accepted', () => {
    for (const count of [0, 1, 20, 40, 45]) {
      const to = addresses(count);
      if (recipientsProblem(to)) continue;
      const { url } = buildMailtoUrl({ to, subject: 'S'.repeat(5000), body: 'b'.repeat(9000) });
      expect(url.length).toBeLessThan(MAX_URL);
    }
  });

  it('refuses recipients that do not fit instead of dropping some', () => {
    const to = addresses(60);
    expect(() => buildMailtoUrl({ to, subject: 'Hi', body: 'Hello' })).toThrow('Too many recipients for one draft.');
  });
});

describe('recipientsProblem', () => {
  it('accepts no recipients and an ordinary list', () => {
    expect(recipientsProblem(undefined)).toBeNull();
    expect(recipientsProblem('')).toBeNull();
    expect(recipientsProblem(addresses(5))).toBeNull();
  });

  it('names the problem when the encoded list is over 1000 characters', () => {
    expect(recipientsProblem(addresses(60))).toMatch(/^Too many recipients for one draft\./);
  });

  it('counts the encoded list, not the text the model sent', () => {
    const justFits = `${'a'.repeat(1000 - '@example.com'.length)}@example.com`;
    expect(recipientsProblem(justFits)).toBeNull();
    expect(recipientsProblem(`${justFits}a`)).not.toBeNull();
  });
});

describe('draftFromArgs', () => {
  it('reads a recipient list and ignores values that are not text', () => {
    expect(draftFromArgs({ to: ['a@example.com', 3, 'b@example.com'], subject: 'S', body: 7 })).toEqual({ to: 'a@example.com,b@example.com', subject: 'S', body: '' });
  });
});
