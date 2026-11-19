/**
 * Which library category a Kiwix file goes into, from its metadata. The first rule with a keyword in the file's
 * name, title, description or tags wins; anything else is general reference. Tune the table once real files show
 * where it sorts badly.
 */
import type { ZimMetadata } from './zimReader';

const RULES: Array<[category: string, keywords: string[]]> = [
  ['medical', ['medicine', 'medical', 'wikimed', 'mdwiki', 'health', 'anatomy', 'first aid']],
  ['mechanical', ['ifixit', 'repair', 'mechanic', 'automotive']],
  ['power', ['solar', 'electric', 'energy']],
  ['radio', ['radio', 'amateur']],
  ['food', ['cooking', 'food', 'recipe', 'garden']],
  ['farming', ['farm', 'livestock', 'agricultur']],
  ['water', ['water', 'sanitation']],
  ['building', ['diy', 'woodworking', 'construction']],
  ['navigation', ['map', 'navigation', 'weather']],
  ['travel', ['wikivoyage', 'hiking', 'outdoors', 'travel', 'trail']],
  ['fieldcraft', ['survival', 'bushcraft', 'knot', 'prepper']],
  ['disasters', ['disaster', 'emergency']],
];

export function categoryFor(meta: ZimMetadata): string {
  const text = [meta.name, meta.title, meta.description, meta.tags].join(' ').toLowerCase();
  return RULES.find(([, keywords]) => keywords.some(k => text.includes(k)))?.[0] ?? 'general';
}
