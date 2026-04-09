const ICON_FILE_EXTENSION_PATTERN = /\.(png|jpg|jpeg|webp|svg)$/i;
const CATEGORY_ICON_PREFIX_PATTERN = /^.*\/category-icons\//i;
const URL_ORIGIN_PREFIX_PATTERN = /^https?:\/\/[^/]+/i;
const TRAILING_QUERY_HASH_PATTERN = /[?#].*$/;

const KNOWN_DEAL_ICON_STEMS = [
  'air-fryer',
  'appliance',
  'coffee-machine',
  'digital-scale',
  'digital-download',
  'drone',
  'female-clothing',
  'gaming-chair',
  'headphones',
  'ice-maker',
  'laptop',
  'lawnmower',
  'male-clothing',
  'monitor',
  'mouse',
  'robot-vacuum',
  'security-camera',
  'smartwatch',
  'sneakers',
  'smartphone',
  'stand-mixer',
  'tv',
] as const;

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
  'air-fryer': 'air-fryer',
  'air-fryer-oven': 'air-fryer',
  'airfryer': 'air-fryer',
  'air fryer': 'air-fryer',
  'coffee-maker': 'coffee-machine',
  'coffeemachine': 'coffee-machine',
  'coffeemaker': 'coffee-machine',
  'coffee-machine': 'coffee-machine',
  'bathroom-scale': 'digital-scale',
  'bathroom-scales': 'digital-scale',
  'digital-scale': 'digital-scale',
  'digital-scales': 'digital-scale',
  'digital-download': 'digital-download',
  'digital-downloads': 'digital-download',
  'drone': 'drone',
  'female-clothing': 'female-clothing',
  'female-clothes': 'female-clothing',
  'womens-clothing': 'female-clothing',
  'women-clothing': 'female-clothing',
  'womens-fashion': 'female-clothing',
  'women-fashion': 'female-clothing',
  'gaming-chair': 'gaming-chair',
  'gaming-chairs': 'gaming-chair',
  'headphones': 'headphones',
  'ice-maker': 'ice-maker',
  'icemaker': 'ice-maker',
  'ice-maker-machine': 'ice-maker',
  'laptop': 'laptop',
  'lawnmower': 'lawnmower',
  'lawn-mower': 'lawnmower',
  'lawn-mover': 'lawnmower',
  'male-clothing': 'male-clothing',
  'male-clothes': 'male-clothing',
  'mens-clothing': 'male-clothing',
  'men-clothing': 'male-clothing',
  'mens-fashion': 'male-clothing',
  'men-fashion': 'male-clothing',
  'monitor': 'monitor',
  'mouse': 'mouse',
  'computer-mouse': 'mouse',
  'curved-monitor': 'monitor',
  'robot-vacuum': 'robot-vacuum',
  'robot-vacume': 'robot-vacuum',
  'robot-vac': 'robot-vacuum',
  'robot-vaccum': 'robot-vacuum',
  'security-camera': 'security-camera',
  'security-cam': 'security-camera',
  'security-cameras': 'security-camera',
  'security-camera-system': 'security-camera',
  'smartwatch': 'smartwatch',
  'smart-watch': 'smartwatch',
  'sneaker': 'sneakers',
  'sneakers': 'sneakers',
  'smartphone': 'smartphone',
  'stand-mixer': 'stand-mixer',
  'appliance': 'appliance',
  'appliances': 'appliance',
  'kitchenaid-stand-mixer': 'stand-mixer',
  'tv': 'tv',
  'flat-screen-tv': 'tv',
  'television': 'tv',
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
