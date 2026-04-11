import { DEAL_ICON_ALIASES, DEAL_ICON_MANIFEST } from '../config/dealIcons';
import {
  getDealIconRegistryAsset,
  getDealIconRegistryCandidates,
  hasDealIconRegistryAsset,
} from '../config/iconRegistry';
import { getCategoryIconName } from './categories';

const ICON_FILE_EXTENSION_PATTERN = /\.(png|jpg|jpeg|webp|svg)$/i;
const URL_ORIGIN_PREFIX_PATTERN = /^https?:\/\/[^/]+/i;
const TRAILING_QUERY_HASH_PATTERN = /[?#].*$/;
const CATEGORY_ICON_ASSET_PATH_PATTERN = /\/category-icons\/([^/?#]+)\.(png|jpg|jpeg|webp|svg)$/i;
const VITE_HASH_SUFFIX_PATTERN = /-[a-z0-9]{6,}$/i;

type DealIconExtension = 'webp' | 'png';

const KNOWN_DEAL_ICON_STEM_SET = new Set<string>(DEAL_ICON_MANIFEST as readonly string[]);

const decodeIconValue = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const stripIconDecorators = (value: string) => {
  const withoutQuery = decodeIconValue(value)
    .trim()
    .replace(TRAILING_QUERY_HASH_PATTERN, '')
    .replace(URL_ORIGIN_PREFIX_PATTERN, '')
    .trim();

  const fileName = withoutQuery.split('/').filter(Boolean).pop() ?? withoutQuery;
  const withoutExtension = fileName.replace(ICON_FILE_EXTENSION_PATTERN, '');
  return withoutExtension.replace(VITE_HASH_SUFFIX_PATTERN, '').trim();
};

const toLookupKey = (value: string) =>
  stripIconDecorators(value)
    .toLowerCase()
    .replace(/[._]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const KNOWN_STEM_BY_LOOKUP_KEY = new Map(
  [...DEAL_ICON_MANIFEST].map((stem) => [toLookupKey(stem), stem]),
);

const ALIAS_STEM_BY_LOOKUP_KEY = new Map(
  Object.entries(DEAL_ICON_ALIASES).map(([alias, target]) => [toLookupKey(alias), target]),
);

type DealIconInferenceInput = {
  title?: string | null;
  businessName?: string | null;
  description?: string | null;
  category?: string | null;
};

const DEAL_TITLE_ICON_HINTS: Array<{ iconName: string; checks: string[] }> = [
  { iconName: 'gaming-mouse', checks: ['corsair', 'harpoon', 'gaming', 'mouse'] },
  { iconName: 'smartwatch', checks: ['apple', 'watch', 'series'] },
  { iconName: 'robot-vacuum', checks: ['robot', 'vacuum'] },
  { iconName: 'sneakers', checks: ['air', 'max', 'shoes'] },
  { iconName: 'monitor', checks: ['gaming', 'monitor'] },
  { iconName: 'air-fryer', checks: ['air', 'fryer'] },
];

const DEAL_KEYWORD_ICON_HINTS: Array<{ iconName: string; checks: string[] }> = [
  { iconName: 'monitor', checks: ['monitor'] },
  { iconName: 'laptop', checks: ['laptop'] },
  { iconName: 'tablet', checks: ['tablet'] },
  { iconName: 'smartphone', checks: ['smartphone'] },
  { iconName: 'headphones', checks: ['headphones'] },
  { iconName: 'gaming-chair', checks: ['gaming', 'chair'] },
  { iconName: 'stand-mixer', checks: ['stand', 'mixer'] },
  { iconName: 'coffee-machine', checks: ['coffee', 'machine'] },
  { iconName: 'ice-maker', checks: ['ice', 'maker'] },
  { iconName: 'air-fryer', checks: ['air', 'fryer'] },
  { iconName: 'digital-scale', checks: ['scale'] },
  { iconName: 'lawnmower', checks: ['lawn', 'mower'] },
  { iconName: 'robot-vacuum', checks: ['robot', 'vacuum'] },
  { iconName: 'security-camera', checks: ['security', 'camera'] },
  { iconName: 'smartwatch', checks: ['watch'] },
  { iconName: 'sneakers', checks: ['sneaker'] },
  { iconName: 'boots', checks: ['boot'] },
  { iconName: 'gaming-mouse', checks: ['mouse'] },
  { iconName: 'tv', checks: ['tv'] },
  { iconName: 'drone', checks: ['drone'] },
];

const normalizeSignalText = (value?: string | null) =>
  typeof value === 'string'
    ? value.toLowerCase().replace(/\s+/g, ' ').trim()
    : '';

const hasAllChecks = (value: string, checks: string[]) =>
  checks.every((check) => value.includes(check));

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
  const aliasStem = ALIAS_STEM_BY_LOOKUP_KEY.get(lookupKey);
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

export const extractDealIconNameFromAssetPath = (value?: string | null) => {
  if (typeof value !== 'string') return '';
  const normalizedValue = value.trim();
  if (!normalizedValue) return '';

  const categoryPathMatch = normalizedValue.match(CATEGORY_ICON_ASSET_PATH_PATTERN);
  if (categoryPathMatch?.[1]) {
    return normalizeDealIconName(categoryPathMatch[1]);
  }

  const lowerValue = decodeIconValue(normalizedValue).toLowerCase();
  for (const stem of DEAL_ICON_MANIFEST) {
    if (
      lowerValue.includes(`/${stem}.`)
      || lowerValue.includes(`/${stem}-`)
      || lowerValue.includes(`${stem}.`)
      || lowerValue.includes(`${stem}-`)
    ) {
      return stem;
    }
  }

  const stripped = stripIconDecorators(normalizedValue);
  if (!stripped) return '';
  return normalizeDealIconName(stripped);
};

export const buildDealIconAssetPath = (
  iconName?: string | null,
  extension: DealIconExtension = 'png',
) => {
  const iconStem = normalizeDealIconName(iconName);
  if (!iconStem) return '';
  return getDealIconRegistryAsset(iconStem, extension);
};

export const buildDealIconWebpPath = (iconName?: string | null) =>
  buildDealIconAssetPath(iconName, 'webp');

export const buildDealIconPngPath = (iconName?: string | null) =>
  buildDealIconAssetPath(iconName, 'png');

export const buildDealIconCandidatePaths = (iconName?: string | null) => {
  const iconStem = normalizeDealIconName(iconName);
  if (!iconStem) return [] as string[];
  return getDealIconRegistryCandidates(iconStem);
};

export const resolveDealIcon = (iconName?: string | null, category?: string | null) => {
  const normalizedIconName = normalizeDealIconName(iconName);
  const candidatePaths = buildDealIconCandidatePaths(normalizedIconName);
  const categoryFallbackIconName = getCategoryIconName(typeof category === 'string' ? category : '');

  return {
    normalizedIconName,
    primarySrc: candidatePaths[0] || '',
    fallbackSrc: candidatePaths[1] || candidatePaths[0] || '',
    candidatePaths,
    categoryFallbackIconName,
  };
};

type DealCardIconInput = {
  iconName?: string | null;
  category?: string | null;
  cardImageUrl?: string | null;
  cardImage?: string | null;
  imageUrl?: string | null;
  detailImageUrl?: string | null;
  detailImage?: string | null;
};

export const resolveDealCardIconSource = (input?: DealCardIconInput | null) => {
  const cardImageCandidate =
    (typeof input?.cardImageUrl === 'string' ? input.cardImageUrl.trim() : '')
    || (typeof input?.cardImage === 'string' ? input.cardImage.trim() : '')
    || (typeof input?.imageUrl === 'string' ? input.imageUrl.trim() : '');
  const detailImageCandidate =
    (typeof input?.detailImageUrl === 'string' ? input.detailImageUrl.trim() : '')
    || (typeof input?.detailImage === 'string' ? input.detailImage.trim() : '')
    || '';

  const inferredIconFromCardImage = extractDealIconNameFromAssetPath(cardImageCandidate);
  const inferredIconFromDetailImage = extractDealIconNameFromAssetPath(detailImageCandidate);
  const effectiveIconName = normalizeDealIconName(
    input?.iconName || inferredIconFromCardImage || inferredIconFromDetailImage,
  );
  const iconResolution = resolveDealIcon(effectiveIconName, input?.category);

  const cardImageLooksLikeIcon = Boolean(inferredIconFromCardImage);
  const hasDistinctCardPreviewAsset = !detailImageCandidate || cardImageCandidate !== detailImageCandidate;

  const resolvedSrc =
    iconResolution.primarySrc
    || ((cardImageLooksLikeIcon || hasDistinctCardPreviewAsset) ? cardImageCandidate : '')
    || '';

  return {
    ...iconResolution,
    cardImageCandidate,
    detailImageCandidate,
    resolvedSrc,
  };
};

export const isKnownDealIconName = (iconName?: string | null) => {
  if (typeof iconName !== 'string') return false;
  const resolved = normalizeDealIconName(iconName);
  return Boolean(resolved && KNOWN_DEAL_ICON_STEM_SET.has(resolved));
};

export const getKnownDealIconNames = () => [...DEAL_ICON_MANIFEST];

export const hasRegisteredDealIcon = (iconName?: string | null) =>
  hasDealIconRegistryAsset(normalizeDealIconName(iconName));

export const inferDealIconNameFromDealSignals = (input: DealIconInferenceInput) => {
  const title = normalizeSignalText(input.title);
  const businessName = normalizeSignalText(input.businessName);
  const description = normalizeSignalText(input.description);
  const category = normalizeSignalText(input.category);
  const mergedSignal = [title, businessName, description, category].filter(Boolean).join(' ');
  if (!mergedSignal) return '';

  const exactMatch = DEAL_TITLE_ICON_HINTS.find((rule) => hasAllChecks(title, rule.checks));
  if (exactMatch) {
    return normalizeDealIconName(exactMatch.iconName);
  }

  const keywordMatch = DEAL_KEYWORD_ICON_HINTS.find((rule) => hasAllChecks(mergedSignal, rule.checks));
  if (keywordMatch) {
    return normalizeDealIconName(keywordMatch.iconName);
  }

  return '';
};
