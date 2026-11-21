import type { Conversation } from '../../types';
import type { GuideEntry } from '../guideLibrary/catalogue';
import type { Checklist } from '../checklists/checklistStore';
import { BUNDLED_GUIDES } from '../fieldGuides/fieldGuides';
import { QUICK_REFERENCE_CARDS } from '../quickReference/cards';

export type HomeHit =
  | { kind: 'chat' | 'guide' | 'checklist' | 'reference'; id: string; title: string }
  | { kind: 'bundledGuide'; asset: string; title: string };

const MAX_HITS = 50;

/** The hits whose title holds every word of `words`; titles that start with the text come first. */
function matching<T extends HomeHit>(typed: string, words: string[], hits: T[]): T[] {
  const found = hits.filter(hit => {
    const title = hit.title.toLowerCase();
    return words.every(word => title.includes(word));
  });
  const starts = (hit: T) => hit.title.toLowerCase().startsWith(typed);
  return [...found.filter(starts), ...found.filter(hit => !starts(hit))];
}

/**
 * What on the phone has a title holding every word typed, in any order: chats, guides on the phone, the guides
 * that come with the app, checklists and Quick reference cards, in that order, at most 50. Titles only.
 */
export function searchHome(
  typed: string,
  sources: { conversations: Conversation[]; guides: GuideEntry[]; checklists: Checklist[] },
): HomeHit[] {
  const text = typed.trim().toLowerCase();
  if (!text) return [];
  const words = text.split(/\s+/);
  const hits: HomeHit[] = [
    ...matching(text, words, sources.conversations.map((c): HomeHit => ({ kind: 'chat', id: c.id, title: c.title }))),
    ...matching(text, words, sources.guides.map((g): HomeHit => ({ kind: 'guide', id: g.id, title: g.title }))),
    ...matching(text, words, BUNDLED_GUIDES.map((g): HomeHit => ({ kind: 'bundledGuide', asset: g.asset, title: g.name.replace(/\.pdf$/, '') }))),
    ...matching(text, words, sources.checklists.map((l): HomeHit => ({ kind: 'checklist', id: l.id, title: l.name }))),
    ...matching(text, words, QUICK_REFERENCE_CARDS.map((c): HomeHit => ({ kind: 'reference', id: c.id, title: c.title }))),
  ];
  return hits.slice(0, MAX_HITS);
}
