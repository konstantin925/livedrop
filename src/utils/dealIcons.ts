const ICON_FILE_EXTENSION_PATTERN = /\.(png|jpg|jpeg|webp|svg)$/i;
const CATEGORY_ICON_PREFIX_PATTERN = /^.*\/category-icons\//i;
const URL_ORIGIN_PREFIX_PATTERN = /^https?:\/\/[^/]+/i;
const TRAILING_QUERY_HASH_PATTERN = /[?#].*$/;

const KNOWN_DEAL_ICON_STEMS = [
  'monitor',
  'laptop',
  'gaming-chair',
  'stand-mixer',
  'coffee-machine',
  'ice-maker',
  'air-fryer',
  'digital-scale',
  'lawnmower',
  'robot-vacuum',
  'security-camera',
  'smartphone',
  'headphones',
  'tablet',
  'tv',
  'drone',
  'smartwatch',
  'sneakers',
  'gaming-mouse',
  'boots',
  'graphics-card',
  'guitar-amp',
  'external-hdd',
  'chair',
  'chocolate-bar',
 ] as const;

const KNOWN_DEAL_ICON_STEM_SET = new Set<string>(KNOWN_DEAL_ICON_STEMS as readonly string[]);

const decodeIconValue = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const stripIconDecorators = (value: string) =>
  decodeIconValue(value)
    .trim()
    .replace(TRAILING_QUERY_HASH_PATTERN, '')
    .replace(URL_ORIGIN_PREFIX_PATTERN, '')
    .replace(CATEGORY_ICON_PREFIX_PATTERN, '')
    .replace(ICON_FILE_EXTENSION_PATTERN, '')
    .trim();

const toLookupKey = (value: string) =>
  stripIconDecorators(value)
    .toLowerCase()
    .replace(/[._]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const KNOWN_STEM_BY_LOOKUP_KEY = new Map(
  KNOWN_DEAL_ICON_STEMS.map((stem) => [toLookupKey(stem), stem]),
);

const ICON_ALIAS_TO_STEM: Record<string, string> = {
  // explicit required aliases
  'lawn-mower': 'lawnmower',
  'robot-vacume': 'robot-vacuum',
  'robot-vaccum': 'robot-vacuum',
  'security-cameras': 'security-camera',
  'smart-watch': 'smartwatch',
  'flat-screen-tv': 'tv',

  // safe backward aliases from older values/typos to canonical list
  'air fryer': 'air-fryer',
  airfryer: 'air-fryer',
  coffeemaker: 'coffee-machine',
  'coffee-maker': 'coffee-machine',
  icemaker: 'ice-maker',
  'digital-scales': 'digital-scale',
  'bathroom-scale': 'digital-scale',
  'bathroom-scales': 'digital-scale',
  'security-cam': 'security-camera',
  television: 'tv',
  'smart-phone': 'smartphone',
  'sneaker': 'sneakers',
  'gaming-chairs': 'gaming-chair',
  'computer-mouse': 'gaming-mouse',
  'gutiar-amp': 'guitar-amp',
};

const getBasePathPrefix = () => {
  const base = (import.meta.env.BASE_URL || '/').trim();
  if (!base || base === '/') return '';
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

const buildPathFromStem = (iconStem: string) =>
  `${getBasePathPrefix()}/category-icons/${encodeURIComponent(iconStem).replace(/%2F/gi, '')}.png`;

const getAliasStem = (lookupKey: string) => {
  if (!lookupKey) return '';
  return ICON_ALIAS_TO_STEM[lookupKey] || '';
};

const buildLookupCandidates = (value: string) => {
  const base = toLookupKey(value);
  if (!base) return [] as string[];

  const candidates = new Set<string>([base]);
  candidates.add(base.replace(/-/g, ''));
  candidates.add(base.replace(/-/g, ' '));

  if (base.endsWith('s') && base.length > 1) {
    candidates.add(base.slice(0, -1));
  } else {
    candidates.add(`${base}s`);
  }

  if (base.includes('vacuum')) candidates.add(base.replace(/vacuum/g, 'vaccum'));
  if (base.includes('vaccum')) candidates.add(base.replace(/vaccum/g, 'vacuum'));
  if (base.includes('camera')) candidates.add(base.replace(/camera/g, 'cameras'));
  if (base.includes('cameras')) candidates.add(base.replace(/cameras/g, 'camera'));
  if (base.includes('lawnmower')) candidates.add(base.replace(/lawnmower/g, 'lawn-mower'));
  if (base.includes('lawn-mower')) candidates.add(base.replace(/lawn-mower/g, 'lawnmower'));

  return [...candidates];
};

const resolveKnownStemFromKey = (lookupKey: string) => {
  const aliasStem = getAliasStem(lookupKey);
  if (aliasStem) return aliasStem;

  const knownStem = KNOWN_STEM_BY_LOOKUP_KEY.get(lookupKey);
  if (knownStem) return knownStem;

  return '';
};

export const normalizeDealIconName = (value?: string | null) => {
  if (typeof value !== 'string') return '';

  const rawStem = stripIconDecorators(value);
  if (!rawStem) return '';

  const lookupCandidates = buildLookupCandidates(rawStem);
  for (const candidate of lookupCandidates) {
    const resolvedKnownStem = resolveKnownStemFromKey(candidate);
    if (resolvedKnownStem) {
      return resolvedKnownStem;
    }
  }

  // Keep canonical mapping for known names, but allow custom per-deal icon stems too.
  // This prevents valid newly-added files in /public/category-icons from being dropped.
  return toLookupKey(rawStem);
};

export const buildDealIconPngPath = (iconName?: string | null) => {
  const iconStem = normalizeDealIconName(iconName);
  if (!iconStem) return '';
  return buildPathFromStem(iconStem);
};

export const buildDealIconCandidatePaths = (iconName?: string | null) => {
  const canonicalIconStem = normalizeDealIconName(iconName);
  if (!canonicalIconStem) return [] as string[];
  return [buildPathFromStem(canonicalIconStem)];
};

export const isKnownDealIconName = (iconName?: string | null) => {
  if (typeof iconName !== 'string') return false;
  const resolved = normalizeDealIconName(iconName);
  return Boolean(resolved && KNOWN_DEAL_ICON_STEMS.includes(resolved as (typeof KNOWN_DEAL_ICON_STEMS)[number]));
};

export const getKnownDealIconNames = () => [...KNOWN_DEAL_ICON_STEMS];
