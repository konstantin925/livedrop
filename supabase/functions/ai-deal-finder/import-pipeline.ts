export type MerchantSource =
  | 'Amazon'
  | 'Walmart'
  | 'Target'
  | 'Best Buy'
  | 'Other'
  | 'Any'
  | (string & {});

export type ScanConfidence = 'high' | 'medium' | 'low' | 'missing';

export type ScanCandidate<T> = {
  source: string;
  value: T | null;
  confidence: ScanConfidence;
};

export type ScanField<T> = {
  value: T | null;
  source: string | null;
  confidence: ScanConfidence;
  candidates: Array<ScanCandidate<T>>;
};

export type ProviderScanResult = {
  provider: 'amazon' | 'generic';
  sourceUrl: string;
  cleanedSourceUrl: string | null;
  finalUrl: string | null;
  contentType: string | null;
  htmlLength: number;
  fetchSucceeded: boolean;
  asin: string | null;
  breadcrumbs: string[];
  rawSignals: {
    jsonLdProductFound: boolean;
    jsonLdBreadcrumbsFound: boolean;
    merchantHint: string | null;
    categoryHint: string | null;
  };
  fields: {
    title: ScanField<string>;
    currentPrice: ScanField<number>;
    originalPrice: ScanField<number>;
    couponText: ScanField<string>;
    merchant: ScanField<string>;
    brand: ScanField<string>;
    mainImage: ScanField<string>;
    galleryImages: ScanField<string[]>;
    rating: ScanField<number>;
    reviewCount: ScanField<number>;
    availability: ScanField<string>;
    shippingInfo: ScanField<string>;
    seller: ScanField<string>;
    category: ScanField<string>;
    featureBullets: ScanField<string[]>;
    summary: ScanField<string>;
    description: ScanField<string>;
    asin: ScanField<string>;
  };
};

export type NormalizedImportDigest = {
  sourceProvider: 'amazon' | 'generic';
  merchant: string | null;
  brand: string | null;
  productTitle: string | null;
  sourceUrl: string | null;
  affiliateUrl: string | null;
  asin: string | null;
  category: string | null;
  image: string | null;
  galleryImages: string[];
  currentPrice: number | null;
  originalPrice: number | null;
  discountAmount: number | null;
  discountPercent: number | null;
  couponText: string | null;
  couponType: 'percent' | 'fixed' | 'text' | null;
  couponValue: number | null;
  rating: number | null;
  reviewCount: number | null;
  availability: string | null;
  shippingInfo: string | null;
  seller: string | null;
  featureBullets: string[];
  summary: string | null;
  description: string | null;
  tags: string[];
  importedAt: string;
};

export type ValidationWarning = {
  field: string;
  severity: 'warning' | 'error';
  message: string;
};

export type ValidationFieldState = {
  field: string;
  status: 'ready' | 'missing' | 'weak';
  confidence: ScanConfidence;
  source: string | null;
  message: string;
};

export type ValidationResult = {
  status: 'ready' | 'partial' | 'blocked';
  warnings: ValidationWarning[];
  missingRequiredFields: string[];
  blockingIssues: string[];
  weakFields: string[];
  fieldStates: ValidationFieldState[];
  completionPercent: number;
};

export type FormMappingPayload = {
  storeName: string;
  websiteUrl: string;
  productUrl: string;
  affiliateUrl: string;
  imageUrl: string;
  dealTitle: string;
  description: string;
  category: string;
  offerText: string;
};

export type DraftDealPayload = {
  businessName: string;
  title: string;
  description: string;
  category: string;
  offerText: string;
  originalPrice?: number;
  price?: number;
  currentPrice?: number;
  discountAmount?: number;
  discountPercent?: number;
  affiliateUrl?: string;
  rating?: number;
  reviewCount?: number;
  merchant?: string;
  brand?: string;
  asin?: string;
  shippingInfo?: string;
  summary?: string;
  tags?: string[];
  sourceType?: 'url';
  sourceQuery?: string;
  stockStatus?: string;
  availability?: string;
  imageUrl?: string;
  galleryImages?: string[];
  productLink?: string;
  productUrl?: string;
  websiteUrl?: string;
  durationMinutes?: number;
  claimCount?: number;
  maxClaims?: number;
  isOnline?: boolean;
  couponText?: string;
  couponType?: 'percent' | 'fixed' | 'text';
  couponValue?: number;
  seller?: string;
  featureBullets?: string[];
  importedAt?: string;
  sourceProvider?: string;
};

export type MappedField = {
  field: keyof FormMappingPayload;
  sourceField: string | null;
  value: string;
  note?: string;
};

export type FormMappingResult = {
  payload: FormMappingPayload;
  fieldMappings: MappedField[];
  draft: DraftDealPayload;
};

export type ImportPipelineResult = {
  scanResult: ProviderScanResult;
  normalizedDigest: NormalizedImportDigest;
  validationResult: ValidationResult;
  mappedForm: FormMappingResult;
  dealScore: number;
  resultQuality: 'basic' | 'enriched';
  partialData: boolean;
  extractionStatus: 'Extraction succeeded' | 'Extraction failed';
  failureReason: string | null;
};

type PageContext = {
  sourceUrl: string;
  cleanedSourceUrl: string | null;
  finalUrl: string;
  contentType: string | null;
  html: string;
  jsonLdObjects: unknown[];
  productJson: Record<string, unknown> | null;
  breadcrumbJson: Record<string, unknown> | null;
  provider: 'amazon' | 'generic';
};

type ImportPipelineOptions = {
  sourceUrl: string;
  affiliateUrl?: string | null;
  merchantHint?: MerchantSource | null;
  categoryHint?: string | null;
  maxPrice?: number | null;
  minDiscount?: number | null;
};

const APP_CATEGORY_OPTIONS = ['Tech', 'Gaming', 'Fashion', 'Home', 'Digital', 'Freebies'];
const URL_QUERY_ALLOWLIST = new Set([
  'sku',
  'variant',
  'variantid',
  'variant_id',
  'pid',
  'productid',
  'product_id',
  'item',
  'itemid',
  'item_id',
  'color',
  'size',
  'style',
  'model',
  'edition',
  'pack',
  'bundle',
]);
const URL_QUERY_BLOCKLIST = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^gbraid$/i,
  /^wbraid$/i,
  /^ref$/i,
  /^ref_$/i,
  /^referrer$/i,
  /^tag$/i,
  /^ascsubtag$/i,
  /^asc_source$/i,
  /^campaign/i,
  /^campaignid$/i,
  /^mc_/i,
  /^mkt_/i,
  /^trk/i,
  /^tracking/i,
];
const CATEGORY_RULES: Array<{ appCategory: string; patterns: RegExp[] }> = [
  {
    appCategory: 'Gaming',
    patterns: [/\bgam(e|ing|er|ers)\b/i, /playstation/i, /\bxbox\b/i, /nintendo/i, /\bsteam\b/i, /controller/i],
  },
  {
    appCategory: 'Fashion',
    patterns: [/\bfashion\b/i, /\bclothing\b/i, /\bapparel\b/i, /\bshoe(s)?\b/i, /\bsneaker(s)?\b/i, /\bdress\b/i, /\bjacket\b/i, /\bhoodie\b/i, /\bhandbag\b/i, /\bwatch\b/i],
  },
  {
    appCategory: 'Home',
    patterns: [/\bhome\b/i, /\bkitchen\b/i, /\bfurniture\b/i, /\bdecor\b/i, /\bvacuum\b/i, /air fryer/i, /\bbedding\b/i, /\bappliance\b/i, /\blight(ing)?\b/i],
  },
  {
    appCategory: 'Digital',
    patterns: [/\bdigital\b/i, /\bsoftware\b/i, /\bplugin\b/i, /\btemplate\b/i, /\bebook\b/i, /\bsubscription\b/i, /\bapp\b/i, /\bcourse\b/i],
  },
  {
    appCategory: 'Freebies',
    patterns: [/\bfreebie(s)?\b/i, /free sample/i, /free download/i, /\bgiveaway\b/i, /\bfree trial\b/i],
  },
  {
    appCategory: 'Tech',
    patterns: [/\belectronic(s)?\b/i, /\bheadphones?\b/i, /\bearbuds?\b/i, /\bcamera\b/i, /\blaptop\b/i, /\bmonitor\b/i, /\bkeyboard\b/i, /\bcharger\b/i, /\bspeaker\b/i, /\btech\b/i, /\btablet\b/i, /\bphone\b/i],
  },
];

const compactText = (value: string | null | undefined) =>
  value
    ?.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim() ?? null;

const normalizeUrl = (inputUrl: string) => {
  try {
    return new URL(inputUrl.trim()).toString();
  } catch {
    return inputUrl.trim();
  }
};

const normalizeOptionalHttpUrl = (inputUrl: string | null | undefined) => {
  if (!inputUrl) return null;

  try {
    const parsed = new URL(normalizeUrl(inputUrl));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

const deriveWebsiteUrl = (inputUrl: string | null | undefined) => {
  if (!inputUrl) return null;

  try {
    const parsed = new URL(normalizeUrl(inputUrl));
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
};

const getDomain = (url: string | null | undefined) => {
  if (!url) return '';
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

const detectProvider = (url: string): 'amazon' | 'generic' =>
  getDomain(url).includes('amazon.') ? 'amazon' : 'generic';

const normalizeMerchantHint = (value: MerchantSource | null | undefined) => {
  const normalized = compactText(typeof value === 'string' ? value : null);
  if (!normalized) return null;
  if (normalized.toLowerCase() === 'any') return null;
  if (normalized.toLowerCase() === 'other') return null;
  return normalized;
};

const titleCaseWords = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');

const deriveMerchantNameFromDomain = (url: string | null | undefined) => {
  const domain = getDomain(url);
  if (!domain) return null;

  const labels = domain.split('.');
  if (labels.length === 0) return null;

  const candidate = labels.length > 2 ? labels[labels.length - 2] : labels[0];
  const cleaned = candidate
    .replace(/[-_]+/g, ' ')
    .replace(/\b(shop|store|www)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;
  return titleCaseWords(cleaned);
};

const detectMerchantFromValue = (value: string | null | undefined, fallback: string | null = null) => {
  const normalized = (value ?? '').toLowerCase();
  if (normalized.includes('amazon')) return 'Amazon';
  if (normalized.includes('walmart')) return 'Walmart';
  if (normalized.includes('target')) return 'Target';
  if (normalized.includes('best buy') || normalized.includes('bestbuy')) return 'Best Buy';
  return fallback;
};

const inferMerchantName = (options: {
  url?: string | null;
  siteName?: string | null;
  merchantHint?: MerchantSource | null;
  provider?: 'amazon' | 'generic';
}) => {
  const hint = normalizeMerchantHint(options.merchantHint);
  const explicitMerchant = detectMerchantFromValue(
    [options.siteName, options.url, hint].filter(Boolean).join(' '),
    null,
  );

  return explicitMerchant
    ?? compactText(options.siteName)
    ?? hint
    ?? deriveMerchantNameFromDomain(options.url)
    ?? (options.provider === 'amazon' ? 'Amazon' : null);
};

const isAllowedProductQueryParam = (name: string) =>
  URL_QUERY_ALLOWLIST.has(name.toLowerCase()) && !URL_QUERY_BLOCKLIST.some((pattern) => pattern.test(name));

const cleanProductUrl = (inputUrl: string | null | undefined) => {
  if (!inputUrl) return null;

  try {
    const parsed = new URL(normalizeUrl(inputUrl));
    const host = parsed.hostname.toLowerCase();

    if (host.includes('amazon.')) {
      const asinMatch = parsed.pathname.match(/\/(?:gp\/product|dp)\/([A-Z0-9]{10})/i)
        ?? parsed.pathname.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
      if (asinMatch?.[1]) {
        return `${parsed.protocol}//${parsed.hostname}/dp/${asinMatch[1].toUpperCase()}`;
      }
    }

    const preservedParams = [...parsed.searchParams.entries()]
      .filter(([key, value]) => Boolean(value) && isAllowedProductQueryParam(key))
      .sort(([left], [right]) => left.localeCompare(right));

    parsed.search = '';
    preservedParams.forEach(([key, value]) => parsed.searchParams.append(key, value));
    parsed.hash = '';

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return normalizeUrl(inputUrl);
  }
};

const getAmazonAsin = (inputUrl: string | null | undefined) => {
  if (!inputUrl) return null;
  try {
    const parsed = new URL(normalizeUrl(inputUrl));
    if (!parsed.hostname.toLowerCase().includes('amazon.')) return null;
    const asinMatch = parsed.pathname.match(/\/(?:gp\/product|dp)\/([A-Z0-9]{10})/i)
      ?? parsed.pathname.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
    return asinMatch?.[1]?.toUpperCase() ?? null;
  } catch {
    return null;
  }
};

const parseCurrencyValue = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.replace(/,/g, '').replace(/[^0-9.]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseNumberish = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const clampRating = (value: number | null) =>
  value != null ? Math.min(5, Math.max(0, value)) : null;

const dedupeStrings = (values: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const items: string[] = [];

  values.forEach((value) => {
    const normalized = compactText(value);
    if (!normalized) return;

    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(normalized);
  });

  return items;
};

const normalizeHttpUrls = (values: Array<string | null | undefined>) =>
  dedupeStrings(values.map((value) => normalizeOptionalHttpUrl(value) ?? null));

const truncateText = (value: string | null | undefined, limit: number) => {
  const normalized = compactText(value);
  if (!normalized) return '';
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3)).trim()}...`;
};

const sanitizeDescriptionText = (value: string | null | undefined) => {
  const normalized = compactText(value);
  if (!normalized) return null;

  return normalized
    .replace(/\s*(?:\||•|·)\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
};

const chooseScanField = <T>(
  candidates: Array<ScanCandidate<T>>,
  hasValue: (value: T | null) => boolean,
): ScanField<T> => {
  let winner: ScanCandidate<T> | null = null;

  for (const candidate of candidates) {
    if (!hasValue(candidate.value)) continue;
    if (!winner || confidenceRank(candidate.confidence) > confidenceRank(winner.confidence)) {
      winner = candidate;
    }
  }

  return {
    value: winner ? winner.value : null,
    source: winner ? winner.source : null,
    confidence: winner ? winner.confidence : 'missing',
    candidates,
  };
};

const textCandidate = (source: string, value: string | null | undefined, confidence: ScanConfidence): ScanCandidate<string> => ({
  source,
  value: compactText(value),
  confidence,
});

const numberCandidate = (source: string, value: number | string | null | undefined, confidence: ScanConfidence): ScanCandidate<number> => ({
  source,
  value: typeof value === 'string' ? parseCurrencyValue(value) ?? parseNumberish(value) : parseNumberish(value),
  confidence,
});

const listCandidate = (source: string, values: Array<string | null | undefined>, confidence: ScanConfidence): ScanCandidate<string[]> => ({
  source,
  value: dedupeStrings(values),
  confidence,
});

const extractMetaContent = (html: string, name: string) => {
  const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i');
  return compactText(html.match(regex)?.[1] ?? null);
};

const extractMatch = (html: string, pattern: RegExp) => compactText(html.match(pattern)?.[1] ?? null);

const extractMatches = (html: string, pattern: RegExp) =>
  [...html.matchAll(pattern)]
    .map((match) => compactText(match[1] ?? null))
    .filter((value): value is string => Boolean(value));

const readJsonLdObjects = (html: string) => {
  const matches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  const values: unknown[] = [];

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];

      while (queue.length > 0) {
        const current = queue.shift();
        if (current == null) continue;

        if (Array.isArray(current)) {
          queue.push(...current);
          continue;
        }

        values.push(current);

        if (typeof current === 'object' && current !== null) {
          const graph = (current as Record<string, unknown>)['@graph'];
          if (Array.isArray(graph)) {
            queue.push(...graph);
          }
        }
      }
    } catch {
      continue;
    }
  }

  return values;
};

const getJsonLdProduct = (objects: unknown[]) =>
  (objects.find((item) => {
    if (!item || typeof item !== 'object') return false;
    const value = item as Record<string, unknown>;
    const typeValue = value['@type'];
    if (typeof typeValue === 'string') return typeValue.toLowerCase() === 'product';
    if (Array.isArray(typeValue)) return typeValue.some((entry) => typeof entry === 'string' && entry.toLowerCase() === 'product');
    return false;
  }) as Record<string, unknown> | undefined) ?? null;

const getJsonLdBreadcrumbs = (objects: unknown[]) =>
  (objects.find((item) => {
    if (!item || typeof item !== 'object') return false;
    const value = item as Record<string, unknown>;
    const typeValue = value['@type'];
    if (typeof typeValue === 'string') return typeValue.toLowerCase() === 'breadcrumblist';
    if (Array.isArray(typeValue)) return typeValue.some((entry) => typeof entry === 'string' && entry.toLowerCase() === 'breadcrumblist');
    return false;
  }) as Record<string, unknown> | undefined) ?? null;

const getJsonLdImages = (productJson: Record<string, unknown> | null) => {
  if (!productJson) return [];

  const rawImage = productJson.image;
  if (typeof rawImage === 'string') {
    return dedupeStrings([rawImage]);
  }

  if (Array.isArray(rawImage)) {
    return dedupeStrings(rawImage.filter((value): value is string => typeof value === 'string'));
  }

  return [];
};

const getJsonLdBreadcrumbTrail = (breadcrumbJson: Record<string, unknown> | null) => {
  if (!breadcrumbJson) return [];

  const itemList = Array.isArray(breadcrumbJson.itemListElement)
    ? breadcrumbJson.itemListElement
    : [];

  return dedupeStrings(
    itemList.map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const item = (entry as Record<string, unknown>).item;
      if (item && typeof item === 'object') {
        return typeof (item as Record<string, unknown>).name === 'string'
          ? (item as Record<string, unknown>).name as string
          : null;
      }

      return typeof (entry as Record<string, unknown>).name === 'string'
        ? (entry as Record<string, unknown>).name as string
        : null;
    }),
  );
};

const getAmazonDynamicImages = (html: string) => {
  const attributeMatch = html.match(/data-a-dynamic-image=["']([^"']+)["']/i);
  const rawValue = attributeMatch?.[1];
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue.replace(/&quot;/g, '"'));
    if (!parsed || typeof parsed !== 'object') return [];
    return dedupeStrings(Object.keys(parsed));
  } catch {
    return [];
  }
};

const parseCouponDetails = (couponText: string | null) => {
  if (!couponText) {
    return {
      couponType: null,
      couponValue: null,
    };
  }

  const percentMatch = couponText.match(/(\d+(?:\.\d+)?)\s*%\s*(?:off|coupon|savings?)/i);
  if (percentMatch?.[1]) {
    return {
      couponType: 'percent' as const,
      couponValue: Number(percentMatch[1]),
    };
  }

  const fixedMatch = couponText.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:off|coupon|savings?)/i);
  if (fixedMatch?.[1]) {
    return {
      couponType: 'fixed' as const,
      couponValue: Number(fixedMatch[1]),
    };
  }

  return {
    couponType: 'text' as const,
    couponValue: null,
  };
};

const mapDigestCategoryToAppCategory = (digest: NormalizedImportDigest) => {
  const explicitAppCategory = compactText(digest.category);
  if (explicitAppCategory && APP_CATEGORY_OPTIONS.includes(explicitAppCategory)) {
    return explicitAppCategory;
  }

  const haystack = [
    digest.category,
    digest.productTitle,
    digest.summary,
    digest.description,
    ...digest.tags,
  ].join(' ').toLowerCase();

  const scores = CATEGORY_RULES.map((rule) => ({
    appCategory: rule.appCategory,
    score: rule.patterns.reduce((sum, pattern) => sum + (pattern.test(haystack) ? 1 : 0), 0),
  })).sort((left, right) => right.score - left.score);

  return scores[0]?.score ? scores[0].appCategory : '';
};

const computeCompletionPercent = (states: ValidationFieldState[]) => {
  if (!states.length) return 0;

  const weightedScore = states.reduce((sum, state) => {
    if (state.status === 'missing') return sum;
    if (state.status === 'weak') return sum + 0.5;
    return sum + 1;
  }, 0);

  return Math.round((weightedScore / states.length) * 100);
};

const confidenceRank = (confidence: ScanConfidence) => {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  if (confidence === 'low') return 1;
  return 0;
};

const computeDealScore = (
  discountPercent: number | null,
  rating: number | null,
  reviewCount: number | null,
  completionPercent: number,
) => {
  const discountScore = Math.min(Math.max(discountPercent ?? 0, 0), 40);
  const ratingScore = Math.max(0, Math.min(((rating ?? 0) / 5) * 20, 20));
  const reviewScore = Math.min(Math.log10((reviewCount ?? 0) + 1) * 6, 15);
  const completenessScore = Math.round(completionPercent / 5);
  return Math.round(discountScore + ratingScore + reviewScore + completenessScore);
};

const fetchPageContext = async (sourceUrl: string): Promise<PageContext> => {
  const normalizedSourceUrl = normalizeUrl(sourceUrl);
  const response = await fetch(normalizedSourceUrl, {
    signal: AbortSignal.timeout(12000),
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; LiveDropBot/2.0; +https://livedrop.app)',
      'accept-language': 'en-US,en;q=0.9',
      accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Product page fetch failed with ${response.status}`);
  }

  const html = await response.text();
  const finalUrl = normalizeUrl(response.url || normalizedSourceUrl);
  const jsonLdObjects = readJsonLdObjects(html);

  return {
    sourceUrl: normalizedSourceUrl,
    cleanedSourceUrl: cleanProductUrl(finalUrl) ?? cleanProductUrl(normalizedSourceUrl),
    finalUrl,
    contentType: response.headers.get('content-type'),
    html,
    jsonLdObjects,
    productJson: getJsonLdProduct(jsonLdObjects),
    breadcrumbJson: getJsonLdBreadcrumbs(jsonLdObjects),
    provider: detectProvider(finalUrl),
  };
};

const getJsonLdOffer = (productJson: Record<string, unknown> | null) => {
  if (!productJson) return null;
  const offers = productJson.offers;
  if (Array.isArray(offers)) {
    const firstOffer = offers.find((entry) => entry && typeof entry === 'object');
    return firstOffer && typeof firstOffer === 'object' ? firstOffer as Record<string, unknown> : null;
  }
  return offers && typeof offers === 'object' ? offers as Record<string, unknown> : null;
};

const getJsonLdAggregateRating = (productJson: Record<string, unknown> | null) => {
  if (!productJson) return null;
  const aggregateRating = productJson.aggregateRating;
  return aggregateRating && typeof aggregateRating === 'object'
    ? aggregateRating as Record<string, unknown>
    : null;
};

const getJsonLdBrandName = (productJson: Record<string, unknown> | null) => {
  if (!productJson) return null;
  const brand = productJson.brand;
  if (typeof brand === 'string') return compactText(brand);
  if (brand && typeof brand === 'object') {
    return typeof (brand as Record<string, unknown>).name === 'string'
      ? compactText((brand as Record<string, unknown>).name as string)
      : null;
  }
  return null;
};

const getJsonLdMerchantName = (offerJson: Record<string, unknown> | null) => {
  if (!offerJson) return null;
  const seller = offerJson.seller;
  if (typeof seller === 'string') return compactText(seller);
  if (seller && typeof seller === 'object') {
    const candidate = (seller as Record<string, unknown>).name;
    return typeof candidate === 'string' ? compactText(candidate) : null;
  }
  return null;
};

const getJsonLdAvailability = (offerJson: Record<string, unknown> | null) => {
  if (!offerJson) return null;
  const availability = offerJson.availability;
  if (typeof availability !== 'string') return null;
  return compactText(availability.split('/').pop() ?? availability);
};

const extractTagTextById = (html: string, id: string, tag = '[a-z0-9]+') =>
  extractMatch(
    html,
    new RegExp(`<${tag}[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  );

const extractAttributeById = (html: string, id: string, attribute: string) => {
  const match = html.match(new RegExp(`<[^>]+id=["']${id}["'][^>]+${attribute}=["']([^"']+)["']`, 'i'));
  return compactText(match?.[1] ?? null);
};

const extractListItemsByContainerId = (html: string, id: string) => {
  const block = html.match(new RegExp(`<[^>]+id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i'))?.[1] ?? null;
  if (!block) return [];
  return dedupeStrings(extractMatches(block, /<li[^>]*>([\s\S]*?)<\/li>/gi));
};

const extractBreadcrumbAnchors = (html: string) => {
  const breadcrumbBlock = html.match(/<[^>]+(?:id|class)=["'][^"']*(?:breadcrumbs|breadcrumb)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ?? null;
  if (!breadcrumbBlock) return [];
  return dedupeStrings(extractMatches(breadcrumbBlock, /<a[^>]*>([\s\S]*?)<\/a>/gi));
};

const extractTitleFallback = (html: string) =>
  extractMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);

const extractAdditionalImages = (html: string) => {
  const matches = [
    ...extractMatches(html, /<img[^>]+src=["']([^"']+)["']/gi),
    ...extractMatches(html, /<img[^>]+data-old-hires=["']([^"']+)["']/gi),
  ];
  return dedupeStrings(matches);
};

const getGenericVisiblePrices = (html: string) => {
  const rawMatches = extractMatches(
    html,
    /(?:\$|USD\s*)(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)/gi,
  );
  return rawMatches
    .map((value) => parseCurrencyValue(value))
    .filter((value): value is number => value != null)
    .slice(0, 8);
};

const buildTextField = (candidates: Array<ScanCandidate<string>>) =>
  chooseScanField(candidates, (value) => typeof value === 'string' && value.trim().length > 0);

const buildNumberField = (candidates: Array<ScanCandidate<number>>) =>
  chooseScanField(candidates, (value) => typeof value === 'number' && Number.isFinite(value));

const buildListField = (candidates: Array<ScanCandidate<string[]>>) =>
  chooseScanField(candidates, (value) => Array.isArray(value) && value.length > 0);

const buildFailureScanResult = (
  sourceUrl: string,
  merchantHint?: MerchantSource | null,
  categoryHint?: string | null,
): ProviderScanResult => {
  const provider = detectProvider(sourceUrl);
  const normalizedMerchantHint = normalizeMerchantHint(merchantHint);
  const emptyText = buildTextField([textCandidate('none', null, 'missing')]);
  const emptyNumber = buildNumberField([numberCandidate('none', null, 'missing')]);
  const emptyList = buildListField([listCandidate('none', [], 'missing')]);
  const merchantField = buildTextField([
    textCandidate('merchant-hint', normalizedMerchantHint, normalizedMerchantHint ? 'medium' : 'missing'),
    textCandidate('derived:domain', deriveMerchantNameFromDomain(sourceUrl), 'low'),
  ]);
  const categoryField = buildTextField([
    textCandidate('category-hint', categoryHint, categoryHint ? 'low' : 'missing'),
  ]);

  return {
    provider,
    sourceUrl: normalizeUrl(sourceUrl),
    cleanedSourceUrl: cleanProductUrl(sourceUrl),
    finalUrl: null,
    contentType: null,
    htmlLength: 0,
    fetchSucceeded: false,
    asin: provider === 'amazon' ? getAmazonAsin(sourceUrl) : null,
    breadcrumbs: [],
    rawSignals: {
      jsonLdProductFound: false,
      jsonLdBreadcrumbsFound: false,
      merchantHint: normalizedMerchantHint,
      categoryHint: compactText(categoryHint),
    },
    fields: {
      title: emptyText,
      currentPrice: emptyNumber,
      originalPrice: emptyNumber,
      couponText: emptyText,
      merchant: merchantField,
      brand: emptyText,
      mainImage: emptyText,
      galleryImages: emptyList,
      rating: emptyNumber,
      reviewCount: emptyNumber,
      availability: emptyText,
      shippingInfo: emptyText,
      seller: emptyText,
      category: categoryField,
      featureBullets: emptyList,
      summary: emptyText,
      description: emptyText,
      asin: emptyText,
    },
  };
};

const scanAmazonPage = (
  context: PageContext,
  merchantHint?: MerchantSource | null,
  categoryHint?: string | null,
): ProviderScanResult => {
  const html = context.html;
  const productJson = context.productJson;
  const offerJson = getJsonLdOffer(productJson);
  const ratingJson = getJsonLdAggregateRating(productJson);
  const normalizedMerchantHint = normalizeMerchantHint(merchantHint);
  const breadcrumbTrail = dedupeStrings([
    ...getJsonLdBreadcrumbTrail(context.breadcrumbJson),
    ...extractBreadcrumbAnchors(html),
    ...extractMatches(html, /<span[^>]+class=["'][^"']*a-list-item[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi).slice(0, 6),
  ]);
  const brandName = getJsonLdBrandName(productJson);
  const merchantName = inferMerchantName({
    url: context.finalUrl,
    siteName: getJsonLdMerchantName(offerJson),
    merchantHint: normalizedMerchantHint,
    provider: 'amazon',
  });
  const jsonLdImages = getJsonLdImages(productJson);
  const dynamicImages = getAmazonDynamicImages(html);
  const asin = getAmazonAsin(context.finalUrl) ?? getAmazonAsin(context.cleanedSourceUrl) ?? extractTagTextById(html, 'ASIN') ?? extractAttributeById(html, 'ASIN', 'value');
  const mainImage = dynamicImages[0] ?? jsonLdImages[0] ?? extractMetaContent(html, 'og:image');
  const visiblePrices = getGenericVisiblePrices(html);
  const fallbackSalePrice = visiblePrices[0] ?? null;
  const fallbackOriginalPrice = visiblePrices.length > 1 ? Math.max(...visiblePrices) : null;

  const titleField = buildTextField([
    textCandidate('selector:#productTitle', extractTagTextById(html, 'productTitle', 'span'), 'high'),
    textCandidate('jsonld:name', typeof productJson?.name === 'string' ? productJson.name : null, 'high'),
    textCandidate('meta:og:title', extractMetaContent(html, 'og:title'), 'medium'),
    textCandidate('title', extractTitleFallback(html), 'low'),
  ]);

  const currentPriceField = buildNumberField([
    numberCandidate('selector:#corePrice_feature_div .a-offscreen', extractMatch(html, /id=["']corePrice_feature_div["'][\s\S]*?class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*([^<]+)/i), 'high'),
    numberCandidate('selector:#priceblock_ourprice', extractTagTextById(html, 'priceblock_ourprice', 'span'), 'high'),
    numberCandidate('selector:#priceblock_dealprice', extractTagTextById(html, 'priceblock_dealprice', 'span'), 'high'),
    numberCandidate('selector:.apexPriceToPay .a-offscreen', extractMatch(html, /class=["'][^"']*apexPriceToPay[^"']*["'][\s\S]*?class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*([^<]+)/i), 'high'),
    numberCandidate('jsonld:offers.price', offerJson ? offerJson.price as string | number | null : null, 'medium'),
    numberCandidate('visible-price-fallback', fallbackSalePrice, 'low'),
  ]);

  const originalPriceField = buildNumberField([
    numberCandidate('selector:.basisPrice .a-offscreen', extractMatch(html, /class=["'][^"']*basisPrice[^"']*["'][\s\S]*?class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*([^<]+)/i), 'high'),
    numberCandidate('selector:#priceblock_listprice', extractTagTextById(html, 'priceblock_listprice', 'span'), 'high'),
    numberCandidate('selector:.priceBlockStrikePriceString', extractMatch(html, /class=["'][^"']*priceBlockStrikePriceString[^"']*["'][^>]*>\s*([^<]+)/i), 'medium'),
    numberCandidate('visible-price-fallback', fallbackOriginalPrice, 'low'),
  ]);

  const couponTextField = buildTextField([
    textCandidate('selector:#promoPriceBlockMessage_feature_div', extractMatch(html, /id=["']promoPriceBlockMessage_feature_div["'][\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i), 'high'),
    textCandidate('selector:#couponFeature', extractMatch(html, /id=["']couponFeature["'][\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i), 'high'),
    textCandidate('coupon-text-search', extractMatch(html, /(Save\s+[^<]{0,80}coupon[^<]{0,80})/i), 'medium'),
  ]);

  const merchantField = buildTextField([
    textCandidate('jsonld:offers.seller', merchantName, 'high'),
    textCandidate('provider-default', 'Amazon', 'medium'),
  ]);

  const brandField = buildTextField([
    textCandidate('jsonld:brand', brandName, 'high'),
    textCandidate('selector:#bylineInfo', extractTagTextById(html, 'bylineInfo', 'a'), 'medium'),
    textCandidate('brand-label', extractMatch(html, /Brand[^<]{0,20}<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i), 'medium'),
  ]);

  const mainImageField = buildTextField([
    textCandidate('amazon-dynamic-images', mainImage, mainImage ? 'high' : 'missing'),
    textCandidate('jsonld:image', jsonLdImages[0], jsonLdImages[0] ? 'medium' : 'missing'),
    textCandidate('meta:og:image', extractMetaContent(html, 'og:image'), 'medium'),
  ]);

  const galleryImagesField = buildListField([
    listCandidate('amazon-dynamic-images', dynamicImages, dynamicImages.length > 0 ? 'high' : 'missing'),
    listCandidate('jsonld:image', jsonLdImages, jsonLdImages.length > 0 ? 'medium' : 'missing'),
    listCandidate('img-src-fallback', extractAdditionalImages(html), 'low'),
  ]);

  const ratingField = buildNumberField([
    numberCandidate('jsonld:aggregateRating.ratingValue', ratingJson ? ratingJson.ratingValue as string | number | null : null, 'high'),
    numberCandidate('selector:#acrPopover', extractAttributeById(html, 'acrPopover', 'title'), 'high'),
    numberCandidate('rating-text-search', extractMatch(html, /(\d+(?:\.\d+)?)\s+out of 5 stars/i), 'medium'),
  ]);

  const reviewCountField = buildNumberField([
    numberCandidate('jsonld:aggregateRating.reviewCount', ratingJson ? ratingJson.reviewCount as string | number | null : null, 'high'),
    numberCandidate('selector:#acrCustomerReviewText', extractTagTextById(html, 'acrCustomerReviewText', 'span'), 'high'),
    numberCandidate('reviews-text-search', extractMatch(html, /([\d,]+)\s+ratings?/i), 'medium'),
  ]);

  const availabilityField = buildTextField([
    textCandidate('jsonld:offers.availability', getJsonLdAvailability(offerJson), 'high'),
    textCandidate('selector:#availability', extractTagTextById(html, 'availability', 'span'), 'high'),
    textCandidate('availability-search', extractMatch(html, /(In Stock|Currently unavailable|Out of Stock|Temporarily out of stock)/i), 'medium'),
  ]);

  const shippingInfoField = buildTextField([
    textCandidate('selector:#mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE', extractTagTextById(html, 'mir-layout-DELIVERY_BLOCK-slot-PRIMARY_DELIVERY_MESSAGE_LARGE', 'span'), 'high'),
    textCandidate('shipping-text-search', extractMatch(html, /(FREE delivery[^<]{0,120}|Get it[^<]{0,120}|Ships from[^<]{0,120})/i), 'medium'),
  ]);

  const sellerField = buildTextField([
    textCandidate('seller-search', extractMatch(html, /Sold by[^<]{0,20}<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i), 'medium'),
    textCandidate('jsonld:offers.seller', getJsonLdMerchantName(offerJson), 'medium'),
  ]);

  const categoryField = buildTextField([
    textCandidate('jsonld:breadcrumbs:last', breadcrumbTrail.length > 0 ? breadcrumbTrail[breadcrumbTrail.length - 1] : null, 'high'),
    textCandidate('category-hint', categoryHint, categoryHint ? 'low' : 'missing'),
  ]);

  const featureBulletsField = buildListField([
    listCandidate('selector:#feature-bullets li', extractListItemsByContainerId(html, 'feature-bullets'), 'high'),
    listCandidate('jsonld:description-split', dedupeStrings([(typeof productJson?.description === 'string' ? productJson.description : null)]), 'low'),
  ]);

  const summaryField = buildTextField([
    textCandidate('meta:description', extractMetaContent(html, 'description'), 'medium'),
    textCandidate('jsonld:description', typeof productJson?.description === 'string' ? productJson.description : null, 'medium'),
    textCandidate('bullet-summary', featureBulletsField.value && featureBulletsField.value.length > 0 ? featureBulletsField.value[0] : null, 'low'),
  ]);

  const descriptionField = buildTextField([
    textCandidate('selector:#productDescription', extractTagTextById(html, 'productDescription', 'div'), 'medium'),
    textCandidate('jsonld:description', typeof productJson?.description === 'string' ? productJson.description : null, 'medium'),
    textCandidate('meta:description', extractMetaContent(html, 'description'), 'low'),
  ]);

  const asinField = buildTextField([
    textCandidate('amazon-asin', asin, asin ? 'high' : 'missing'),
  ]);

  return {
    provider: 'amazon',
    sourceUrl: context.sourceUrl,
    cleanedSourceUrl: context.cleanedSourceUrl,
    finalUrl: context.finalUrl,
    contentType: context.contentType,
    htmlLength: html.length,
    fetchSucceeded: true,
    asin,
    breadcrumbs: breadcrumbTrail,
    rawSignals: {
      jsonLdProductFound: Boolean(productJson),
      jsonLdBreadcrumbsFound: Boolean(context.breadcrumbJson),
      merchantHint: normalizedMerchantHint,
      categoryHint: compactText(categoryHint),
    },
    fields: {
      title: titleField,
      currentPrice: currentPriceField,
      originalPrice: originalPriceField,
      couponText: couponTextField,
      merchant: merchantField,
      brand: brandField,
      mainImage: mainImageField,
      galleryImages: galleryImagesField,
      rating: ratingField,
      reviewCount: reviewCountField,
      availability: availabilityField,
      shippingInfo: shippingInfoField,
      seller: sellerField,
      category: categoryField,
      featureBullets: featureBulletsField,
      summary: summaryField,
      description: descriptionField,
      asin: asinField,
    },
  };
};

const scanGenericPage = (
  context: PageContext,
  merchantHint?: MerchantSource | null,
  categoryHint?: string | null,
): ProviderScanResult => {
  const html = context.html;
  const productJson = context.productJson;
  const offerJson = getJsonLdOffer(productJson);
  const ratingJson = getJsonLdAggregateRating(productJson);
  const siteName = extractMetaContent(html, 'og:site_name');
  const normalizedMerchantHint = normalizeMerchantHint(merchantHint);
  const breadcrumbTrail = dedupeStrings([
    ...getJsonLdBreadcrumbTrail(context.breadcrumbJson),
    ...extractBreadcrumbAnchors(html),
  ]);
  const merchantHintValue = inferMerchantName({
    url: context.finalUrl,
    siteName,
    merchantHint: normalizedMerchantHint,
    provider: 'generic',
  });
  const visiblePrices = getGenericVisiblePrices(html);
  const salePrice = visiblePrices[0] ?? null;
  const comparePrice = visiblePrices.length > 1 ? Math.max(...visiblePrices) : null;
  const images = dedupeStrings([
    ...getJsonLdImages(productJson),
    extractMetaContent(html, 'og:image'),
    ...extractAdditionalImages(html),
  ]);

  const titleField = buildTextField([
    textCandidate('meta:og:title', extractMetaContent(html, 'og:title'), 'high'),
    textCandidate('jsonld:name', typeof productJson?.name === 'string' ? productJson.name : null, 'high'),
    textCandidate('heading:h1', extractMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i), 'medium'),
    textCandidate('title', extractTitleFallback(html), 'low'),
  ]);

  const currentPriceField = buildNumberField([
    numberCandidate('jsonld:offers.price', offerJson ? offerJson.price as string | number | null : null, 'high'),
    numberCandidate('price-meta:itemprop', extractMatch(html, /itemprop=["']price["'][^>]+content=["']([^"']+)["']/i), 'high'),
    numberCandidate('meta:product:price:amount', extractMetaContent(html, 'product:price:amount'), 'high'),
    numberCandidate('visible-price-fallback', salePrice, 'low'),
  ]);

  const originalPriceField = buildNumberField([
    numberCandidate('meta:product:original_price:amount', extractMetaContent(html, 'product:original_price:amount'), 'high'),
    numberCandidate('compare-price-text', extractMatch(html, /(?:Was|List Price|Compare at)[^$]{0,20}(\$[\d,]+(?:\.\d{2})?)/i), 'medium'),
    numberCandidate('strike-price-text', extractMatch(html, /(?:before|regular price|original price)[^$]{0,20}(\$[\d,]+(?:\.\d{2})?)/i), 'medium'),
    numberCandidate('visible-price-fallback', comparePrice, 'low'),
  ]);

  const couponTextField = buildTextField([
    textCandidate('coupon-search', extractMatch(html, /(Save[^<]{0,120}(?:coupon|code)|coupon[^<]{0,120})/i), 'medium'),
    textCandidate('promo-search', extractMatch(html, /(promo[^<]{0,120}|discount code[^<]{0,120})/i), 'low'),
  ]);

  const merchantField = buildTextField([
    textCandidate('meta:og:site_name', siteName, 'high'),
    textCandidate('jsonld:offers.seller', getJsonLdMerchantName(offerJson), 'high'),
    textCandidate('merchant-hint', merchantHintValue, merchantHintValue ? 'medium' : 'missing'),
  ]);

  const brandField = buildTextField([
    textCandidate('jsonld:brand', getJsonLdBrandName(productJson), 'high'),
    textCandidate('brand-meta', extractMetaContent(html, 'product:brand'), 'medium'),
  ]);

  const mainImageField = buildTextField([
    textCandidate('meta:og:image', extractMetaContent(html, 'og:image'), 'high'),
    textCandidate('jsonld:image', images[0], images[0] ? 'medium' : 'missing'),
  ]);

  const galleryImagesField = buildListField([
    listCandidate('jsonld-and-img', images, images.length > 0 ? 'medium' : 'missing'),
  ]);

  const ratingField = buildNumberField([
    numberCandidate('jsonld:aggregateRating.ratingValue', ratingJson ? ratingJson.ratingValue as string | number | null : null, 'high'),
    numberCandidate('rating-search', extractMatch(html, /(\d+(?:\.\d+)?)\s*(?:out of 5|\/5|stars?)/i), 'medium'),
  ]);

  const reviewCountField = buildNumberField([
    numberCandidate('jsonld:aggregateRating.reviewCount', ratingJson ? ratingJson.reviewCount as string | number | null : null, 'high'),
    numberCandidate('review-search', extractMatch(html, /([\d,]+)\s+(?:reviews?|ratings?)/i), 'medium'),
  ]);

  const availabilityField = buildTextField([
    textCandidate('jsonld:offers.availability', getJsonLdAvailability(offerJson), 'high'),
    textCandidate('availability-search', extractMatch(html, /(In Stock|Out of Stock|Sold Out|Pre-order|Available now|Currently unavailable)/i), 'medium'),
  ]);

  const shippingInfoField = buildTextField([
    textCandidate('shipping-search', extractMatch(html, /(Free shipping[^<]{0,120}|Ships in[^<]{0,120}|Delivery[^<]{0,120})/i), 'medium'),
  ]);

  const sellerField = buildTextField([
    textCandidate('jsonld:offers.seller', getJsonLdMerchantName(offerJson), 'high'),
    textCandidate('seller-search', extractMatch(html, /Sold by[^<]{0,40}<\/[^>]+>\s*<[^>]+>([\s\S]*?)<\/[^>]+>/i), 'medium'),
  ]);

  const categoryField = buildTextField([
    textCandidate('jsonld:breadcrumbs:last', breadcrumbTrail.length > 0 ? breadcrumbTrail[breadcrumbTrail.length - 1] : null, 'high'),
    textCandidate('category-hint', categoryHint, categoryHint ? 'low' : 'missing'),
  ]);

  const featureBullets = dedupeStrings([
    ...extractMatches(html, /<li[^>]*>([\s\S]*?)<\/li>/gi).slice(0, 8),
  ]);

  const featureBulletsField = buildListField([
    listCandidate('list-item-scan', featureBullets, featureBullets.length > 0 ? 'medium' : 'missing'),
  ]);

  const summaryField = buildTextField([
    textCandidate('meta:description', extractMetaContent(html, 'description'), 'high'),
    textCandidate('jsonld:description', typeof productJson?.description === 'string' ? productJson.description : null, 'medium'),
    textCandidate('first-bullet', featureBullets[0] ?? null, 'low'),
  ]);

  const descriptionField = buildTextField([
    textCandidate('jsonld:description', typeof productJson?.description === 'string' ? productJson.description : null, 'high'),
    textCandidate('meta:description', extractMetaContent(html, 'description'), 'medium'),
  ]);

  const asinField = buildTextField([
    textCandidate('amazon-asin', getAmazonAsin(context.cleanedSourceUrl ?? context.finalUrl), 'medium'),
  ]);

  return {
    provider: 'generic',
    sourceUrl: context.sourceUrl,
    cleanedSourceUrl: context.cleanedSourceUrl,
    finalUrl: context.finalUrl,
    contentType: context.contentType,
    htmlLength: html.length,
    fetchSucceeded: true,
    asin: getAmazonAsin(context.finalUrl),
    breadcrumbs: breadcrumbTrail,
    rawSignals: {
      jsonLdProductFound: Boolean(productJson),
      jsonLdBreadcrumbsFound: Boolean(context.breadcrumbJson),
      merchantHint: merchantHintValue,
      categoryHint: compactText(categoryHint),
    },
    fields: {
      title: titleField,
      currentPrice: currentPriceField,
      originalPrice: originalPriceField,
      couponText: couponTextField,
      merchant: merchantField,
      brand: brandField,
      mainImage: mainImageField,
      galleryImages: galleryImagesField,
      rating: ratingField,
      reviewCount: reviewCountField,
      availability: availabilityField,
      shippingInfo: shippingInfoField,
      seller: sellerField,
      category: categoryField,
      featureBullets: featureBulletsField,
      summary: summaryField,
      description: descriptionField,
      asin: asinField,
    },
  };
};

const normalizePricePair = (currentPrice: number | null, originalPrice: number | null) => {
  const safeCurrentPrice = currentPrice != null && currentPrice >= 0 ? currentPrice : null;
  let safeOriginalPrice = originalPrice != null && originalPrice >= 0 ? originalPrice : null;

  if (
    safeOriginalPrice != null &&
    safeCurrentPrice != null &&
    safeOriginalPrice <= safeCurrentPrice
  ) {
    safeOriginalPrice = null;
  }

  const discountAmount =
    safeOriginalPrice != null && safeCurrentPrice != null
      ? Number((safeOriginalPrice - safeCurrentPrice).toFixed(2))
      : null;

  const discountPercent =
    safeOriginalPrice != null &&
    safeCurrentPrice != null &&
    safeOriginalPrice > safeCurrentPrice
      ? Math.round(((safeOriginalPrice - safeCurrentPrice) / safeOriginalPrice) * 100)
      : null;

  return {
    currentPrice: safeCurrentPrice,
    originalPrice: safeOriginalPrice,
    discountAmount,
    discountPercent,
  };
};

const buildDigestTags = (digest: Omit<NormalizedImportDigest, 'tags'>) =>
  dedupeStrings([
    digest.merchant,
    digest.brand,
    digest.category,
    digest.asin,
    ...digest.featureBullets.slice(0, 4),
    ...(digest.productTitle ? digest.productTitle.split(/[-|,:]/).slice(0, 2) : []),
  ]).map((tag) => tag.toLowerCase());

const normalizeScanResult = (
  scanResult: ProviderScanResult,
  affiliateUrl?: string | null,
): NormalizedImportDigest => {
  const coupon = parseCouponDetails(scanResult.fields.couponText.value);
  const prices = normalizePricePair(
    scanResult.fields.currentPrice.value,
    scanResult.fields.originalPrice.value,
  );
  const sourceUrl = scanResult.cleanedSourceUrl ?? scanResult.finalUrl ?? scanResult.sourceUrl;
  const merchant = compactText(scanResult.fields.merchant.value)
    ?? inferMerchantName({
      url: sourceUrl,
      siteName: scanResult.rawSignals.merchantHint,
      provider: scanResult.provider,
    });
  const description = sanitizeDescriptionText(scanResult.fields.description.value)
    ?? sanitizeDescriptionText(scanResult.fields.summary.value);
  const summary = sanitizeDescriptionText(scanResult.fields.summary.value)
    ?? (scanResult.fields.featureBullets.value && scanResult.fields.featureBullets.value.length > 0
      ? scanResult.fields.featureBullets.value[0]
      : null);
  const galleryImages = dedupeStrings([
    ...normalizeHttpUrls([scanResult.fields.mainImage.value, ...(scanResult.fields.galleryImages.value ?? [])]),
  ]);

  const digestBase = {
    sourceProvider: scanResult.provider,
    merchant,
    brand: compactText(scanResult.fields.brand.value),
    productTitle: truncateText(scanResult.fields.title.value, 160) || null,
    sourceUrl,
    affiliateUrl: normalizeOptionalHttpUrl(affiliateUrl),
    asin: compactText(scanResult.fields.asin.value) ?? scanResult.asin,
    category:
      compactText(scanResult.fields.category.value)
      ?? (scanResult.breadcrumbs.length > 0 ? scanResult.breadcrumbs[scanResult.breadcrumbs.length - 1] : null),
    image: normalizeOptionalHttpUrl(scanResult.fields.mainImage.value),
    galleryImages,
    currentPrice: prices.currentPrice,
    originalPrice: prices.originalPrice,
    discountAmount: prices.discountAmount,
    discountPercent: prices.discountPercent,
    couponText: compactText(scanResult.fields.couponText.value),
    couponType: coupon.couponType,
    couponValue: coupon.couponValue,
    rating: clampRating(scanResult.fields.rating.value),
    reviewCount: scanResult.fields.reviewCount.value,
    availability: compactText(scanResult.fields.availability.value),
    shippingInfo: sanitizeDescriptionText(scanResult.fields.shippingInfo.value),
    seller: compactText(scanResult.fields.seller.value),
    featureBullets: dedupeStrings((scanResult.fields.featureBullets.value ?? []).slice(0, 8)),
    summary,
    description,
    importedAt: new Date().toISOString(),
  };

  return {
    ...digestBase,
    tags: buildDigestTags(digestBase),
  };
};

const formatCurrencyForOffer = (value: number) => {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value - Math.round(value)) < 0.001) {
    return `$${Math.round(value)}`;
  }
  return `$${value.toFixed(2)}`;
};

const buildPortalOfferText = (digest: NormalizedImportDigest) => {
  if (digest.discountPercent != null && digest.discountPercent > 0) {
    return `${digest.discountPercent}% OFF`;
  }

  if (digest.couponType === 'fixed' && digest.couponValue != null && digest.couponValue > 0) {
    return `${formatCurrencyForOffer(digest.couponValue)} OFF`;
  }

  if (digest.couponType === 'percent' && digest.couponValue != null && digest.couponValue > 0) {
    return `${digest.couponValue}% OFF`;
  }

  if (digest.discountAmount != null && digest.discountAmount > 0) {
    return `${formatCurrencyForOffer(digest.discountAmount)} OFF`;
  }

  if (digest.couponText) {
    return truncateText(digest.couponText, 60);
  }

  if (digest.currentPrice != null) {
    return `Now ${formatCurrencyForOffer(digest.currentPrice)}`;
  }

  return '';
};

const buildPortalDescription = (digest: NormalizedImportDigest) => {
  const summaryParts = dedupeStrings([
    digest.description,
    digest.summary,
    ...digest.featureBullets.slice(0, 3),
  ]);

  return truncateText(summaryParts.join(' '), 320);
};

const mapNormalizedDigestToForm = (
  digest: NormalizedImportDigest,
  scanResult: ProviderScanResult,
): FormMappingResult => {
  const mappedCategory = mapDigestCategoryToAppCategory(digest);
  const storeName = digest.merchant ?? digest.brand ?? deriveMerchantNameFromDomain(digest.sourceUrl) ?? '';
  const websiteUrl = deriveWebsiteUrl(digest.sourceUrl) ?? '';
  const productUrl = digest.sourceUrl ?? '';
  const description = buildPortalDescription(digest);
  const offerText = buildPortalOfferText(digest);

  const payload: FormMappingPayload = {
    storeName,
    websiteUrl,
    productUrl,
    affiliateUrl: digest.affiliateUrl ?? '',
    imageUrl: digest.image ?? '',
    dealTitle: digest.productTitle ?? '',
    description,
    category: mappedCategory,
    offerText,
  };

  const fieldMappings: MappedField[] = [
    {
      field: 'storeName',
      sourceField: scanResult.fields.merchant.source ?? scanResult.fields.brand.source ?? 'derived:domain',
      value: payload.storeName,
      note: payload.storeName ? undefined : 'Merchant is still missing from the normalized digest.',
    },
    {
      field: 'websiteUrl',
      sourceField: 'derived:sourceUrl',
      value: payload.websiteUrl,
      note: payload.websiteUrl ? undefined : 'Could not derive a website origin from the source URL.',
    },
    {
      field: 'productUrl',
      sourceField: 'normalized:sourceUrl',
      value: payload.productUrl,
      note: payload.productUrl ? undefined : 'The cleaned source URL is missing.',
    },
    {
      field: 'affiliateUrl',
      sourceField: digest.affiliateUrl ? 'request:affiliateUrl' : null,
      value: payload.affiliateUrl,
      note: payload.affiliateUrl ? undefined : 'Affiliate link is optional and is still blank.',
    },
    {
      field: 'imageUrl',
      sourceField: scanResult.fields.mainImage.source,
      value: payload.imageUrl,
      note: payload.imageUrl ? undefined : 'No reliable product image was found.',
    },
    {
      field: 'dealTitle',
      sourceField: scanResult.fields.title.source,
      value: payload.dealTitle,
      note: payload.dealTitle ? undefined : 'Product title is missing.',
    },
    {
      field: 'description',
      sourceField: scanResult.fields.description.source ?? scanResult.fields.summary.source ?? scanResult.fields.featureBullets.source,
      value: payload.description,
      note: payload.description ? undefined : 'Description was not strong enough to autofill.',
    },
    {
      field: 'category',
      sourceField: scanResult.fields.category.source ?? 'derived:categoryRules',
      value: payload.category,
      note: payload.category ? undefined : 'Category needs manual review before publishing.',
    },
    {
      field: 'offerText',
      sourceField:
        scanResult.fields.originalPrice.source
        ?? scanResult.fields.currentPrice.source
        ?? scanResult.fields.couponText.source,
      value: payload.offerText,
      note: payload.offerText ? undefined : 'No price or coupon signal was strong enough to build offer text.',
    },
  ];

  const draft: DraftDealPayload = {
    businessName: payload.storeName,
    title: payload.dealTitle,
    description: payload.description,
    category: payload.category,
    offerText: payload.offerText,
    originalPrice: digest.originalPrice ?? undefined,
    price: digest.currentPrice ?? undefined,
    currentPrice: digest.currentPrice ?? undefined,
    discountAmount: digest.discountAmount ?? undefined,
    discountPercent: digest.discountPercent ?? undefined,
    affiliateUrl: payload.affiliateUrl || undefined,
    rating: digest.rating ?? undefined,
    reviewCount: digest.reviewCount ?? undefined,
    merchant: digest.merchant ?? undefined,
    brand: digest.brand ?? undefined,
    asin: digest.asin ?? undefined,
    shippingInfo: digest.shippingInfo ?? undefined,
    summary: digest.summary ?? undefined,
    tags: digest.tags,
    sourceType: 'url',
    sourceQuery: digest.sourceUrl ?? undefined,
    stockStatus: digest.availability ?? undefined,
    availability: digest.availability ?? undefined,
    imageUrl: payload.imageUrl || undefined,
    galleryImages: digest.galleryImages,
    productLink: payload.productUrl || undefined,
    productUrl: payload.productUrl || undefined,
    websiteUrl: payload.websiteUrl || undefined,
    durationMinutes: 150,
    claimCount: 0,
    maxClaims: 999,
    isOnline: true,
    couponText: digest.couponText ?? undefined,
    couponType: digest.couponType ?? undefined,
    couponValue: digest.couponValue ?? undefined,
    seller: digest.seller ?? undefined,
    featureBullets: digest.featureBullets,
    importedAt: digest.importedAt,
    sourceProvider: digest.sourceProvider,
  };

  return {
    payload,
    fieldMappings,
    draft,
  };
};

const buildValidationFieldState = (
  field: string,
  value: unknown,
  confidence: ScanConfidence,
  source: string | null,
  readyMessage: string,
  missingMessage: string,
  weakMessage: string,
  options?: {
    allowMissing?: boolean;
  },
): ValidationFieldState => {
  const hasValue = Array.isArray(value)
    ? value.length > 0
    : typeof value === 'number'
      ? Number.isFinite(value)
      : typeof value === 'string'
        ? value.trim().length > 0
        : Boolean(value);

  if (!hasValue && options?.allowMissing) {
    return {
      field,
      status: 'ready',
      confidence: 'missing',
      source,
      message: readyMessage,
    };
  }

  if (!hasValue) {
    return {
      field,
      status: 'missing',
      confidence: 'missing',
      source,
      message: missingMessage,
    };
  }

  if (confidence === 'low') {
    return {
      field,
      status: 'weak',
      confidence,
      source,
      message: weakMessage,
    };
  }

  return {
    field,
    status: 'ready',
    confidence,
    source,
    message: readyMessage,
  };
};

const validateNormalizedDigest = (
  digest: NormalizedImportDigest,
  scanResult: ProviderScanResult,
  payload: FormMappingPayload,
  constraints?: Pick<ImportPipelineOptions, 'maxPrice' | 'minDiscount'>,
): ValidationResult => {
  const descriptionConfidence =
    confidenceRank(scanResult.fields.description.confidence) >= confidenceRank(scanResult.fields.summary.confidence)
      ? scanResult.fields.description.confidence
      : scanResult.fields.summary.confidence;

  const requiredFields = [
    !payload.storeName ? 'storeName' : null,
    !payload.websiteUrl ? 'websiteUrl' : null,
    !payload.productUrl ? 'productUrl' : null,
    !payload.imageUrl ? 'imageUrl' : null,
    !payload.dealTitle ? 'dealTitle' : null,
    !payload.description ? 'description' : null,
    !payload.category ? 'category' : null,
    !payload.offerText ? 'offerText' : null,
  ].filter((value): value is string => Boolean(value));

  const fieldStates: ValidationFieldState[] = [
    buildValidationFieldState(
      'storeName',
      payload.storeName,
      scanResult.fields.merchant.confidence,
      scanResult.fields.merchant.source ?? scanResult.fields.brand.source ?? 'derived:domain',
      'Store name is ready for the form.',
      'Store name is missing from the normalized digest.',
      'Store name came from a weak fallback and should be reviewed.',
    ),
    buildValidationFieldState(
      'dealTitle',
      payload.dealTitle,
      scanResult.fields.title.confidence,
      scanResult.fields.title.source,
      'Deal title is ready.',
      'Deal title is missing from the scan result.',
      'Deal title was found, but only from a weak fallback.',
    ),
    buildValidationFieldState(
      'websiteUrl',
      payload.websiteUrl,
      payload.websiteUrl ? 'high' : 'missing',
      'derived:sourceUrl',
      'Website URL is ready.',
      'Website URL could not be derived from the product URL.',
      'Website URL needs manual review.',
    ),
    buildValidationFieldState(
      'productUrl',
      payload.productUrl,
      payload.productUrl ? 'high' : 'missing',
      'normalized:sourceUrl',
      'Product URL is ready.',
      'Product URL is missing after cleaning.',
      'Product URL is only weakly normalized.',
    ),
    buildValidationFieldState(
      'affiliateUrl',
      digest.affiliateUrl,
      digest.affiliateUrl ? 'high' : 'missing',
      digest.affiliateUrl ? 'request:affiliateUrl' : null,
      'Affiliate URL state is valid.',
      'Affiliate URL was not provided.',
      'Affiliate URL needs review.',
      { allowMissing: true },
    ),
    buildValidationFieldState(
      'category',
      payload.category,
      payload.category ? (scanResult.fields.category.confidence === 'missing' ? 'medium' : scanResult.fields.category.confidence) : 'missing',
      scanResult.fields.category.source ?? 'derived:categoryRules',
      'Category mapped cleanly into a LiveDrop category.',
      'Category could not be mapped to a LiveDrop category.',
      'Category came from a weak fallback and should be reviewed.',
    ),
    buildValidationFieldState(
      'imageUrl',
      payload.imageUrl,
      scanResult.fields.mainImage.confidence,
      scanResult.fields.mainImage.source,
      'Product image is ready.',
      'Product image is missing.',
      'Product image came from a weak fallback source.',
    ),
    buildValidationFieldState(
      'currentPrice',
      digest.currentPrice,
      scanResult.fields.currentPrice.confidence,
      scanResult.fields.currentPrice.source,
      'Current price is ready.',
      'Current price is missing.',
      'Current price came from a weak visible-price fallback.',
      { allowMissing: true },
    ),
    buildValidationFieldState(
      'originalPrice',
      digest.originalPrice,
      scanResult.fields.originalPrice.confidence,
      scanResult.fields.originalPrice.source,
      'Original price is ready.',
      'Original/list price is missing.',
      'Original/list price came from a weak fallback.',
      { allowMissing: true },
    ),
    buildValidationFieldState(
      'couponText',
      digest.couponText,
      scanResult.fields.couponText.confidence,
      scanResult.fields.couponText.source,
      'Coupon text is ready.',
      'Coupon text was not found.',
      'Coupon text was detected weakly and should be reviewed.',
      { allowMissing: true },
    ),
    buildValidationFieldState(
      'description',
      payload.description,
      descriptionConfidence,
      scanResult.fields.description.source ?? scanResult.fields.summary.source,
      'Description is ready for the portal form.',
      'Description/summary is missing and was left blank.',
      'Description came from a weaker fallback and should be reviewed.',
    ),
    buildValidationFieldState(
      'offerText',
      payload.offerText,
      payload.offerText ? 'medium' : 'missing',
      scanResult.fields.currentPrice.source ?? scanResult.fields.couponText.source ?? scanResult.fields.originalPrice.source,
      'Offer text is ready for the portal form.',
      'Offer text could not be generated from the scanned price or coupon signals.',
      'Offer text came from a weak price signal and should be reviewed.',
    ),
    buildValidationFieldState(
      'featureBullets',
      digest.featureBullets,
      scanResult.fields.featureBullets.confidence,
      scanResult.fields.featureBullets.source,
      'Feature bullets are available.',
      'Feature bullets were not found.',
      'Feature bullets came from a weak fallback.',
      { allowMissing: true },
    ),
  ];

  const warnings: ValidationWarning[] = [];
  const blockingIssues = [...requiredFields];
  const weakFields: string[] = [];

  fieldStates.forEach((state) => {
    if (state.status === 'missing') {
      warnings.push({
        field: state.field,
        severity: requiredFields.includes(state.field) ? 'error' : 'warning',
        message: state.message,
      });
      return;
    }

    if (state.status === 'weak') {
      weakFields.push(state.field);
      warnings.push({
        field: state.field,
        severity: 'warning',
        message: state.message,
      });
    }
  });

  if (
    constraints?.maxPrice != null &&
    Number.isFinite(constraints.maxPrice) &&
    digest.currentPrice != null &&
    digest.currentPrice > constraints.maxPrice
  ) {
    warnings.push({
      field: 'currentPrice',
      severity: 'error',
      message: `Current price ${formatCurrencyForOffer(digest.currentPrice)} exceeds the requested max price of ${formatCurrencyForOffer(constraints.maxPrice)}.`,
    });
    blockingIssues.push('currentPrice');
  }

  if (
    constraints?.minDiscount != null &&
    Number.isFinite(constraints.minDiscount) &&
    (digest.discountPercent ?? 0) < constraints.minDiscount
  ) {
    warnings.push({
      field: 'discountPercent',
      severity: 'error',
      message: `Detected discount ${digest.discountPercent ?? 0}% is below the requested minimum discount of ${constraints.minDiscount}%.`,
    });
    blockingIssues.push('discountPercent');
  }

  const dedupedBlockingIssues = [...new Set(blockingIssues)];
  const completionPercent = computeCompletionPercent(fieldStates);
  const status = dedupedBlockingIssues.length > 0
    ? 'blocked'
    : weakFields.length > 0
      ? 'partial'
      : 'ready';

  return {
    status,
    warnings,
    missingRequiredFields: requiredFields,
    blockingIssues: dedupedBlockingIssues,
    weakFields,
    fieldStates,
    completionPercent,
  };
};

export const runImportPipeline = async (
  options: ImportPipelineOptions,
): Promise<ImportPipelineResult> => {
  let scanResult: ProviderScanResult;
  let failureReason: string | null = null;

  try {
    const context = await fetchPageContext(options.sourceUrl);
    scanResult = context.provider === 'amazon'
      ? scanAmazonPage(context, options.merchantHint, options.categoryHint)
      : scanGenericPage(context, options.merchantHint, options.categoryHint);
  } catch (error) {
    failureReason = error instanceof Error ? error.message : 'Product page fetch failed.';
    scanResult = buildFailureScanResult(options.sourceUrl, options.merchantHint, options.categoryHint);
  }

  const normalizedDigest = normalizeScanResult(scanResult, options.affiliateUrl);
  const mappedForm = mapNormalizedDigestToForm(normalizedDigest, scanResult);
  const validationResult = validateNormalizedDigest(normalizedDigest, scanResult, mappedForm.payload, {
    maxPrice: options.maxPrice,
    minDiscount: options.minDiscount,
  });
  const extractionStatus = !scanResult.fetchSucceeded || validationResult.blockingIssues.length > 0
    ? 'Extraction failed'
    : 'Extraction succeeded';
  const partialData = validationResult.status !== 'ready';

  if (!failureReason && extractionStatus === 'Extraction failed') {
    failureReason = validationResult.warnings[0]?.message ?? 'Required fields are still missing after scanning.';
  }

  return {
    scanResult,
    normalizedDigest,
    validationResult,
    mappedForm,
    dealScore: computeDealScore(
      normalizedDigest.discountPercent,
      normalizedDigest.rating,
      normalizedDigest.reviewCount,
      validationResult.completionPercent,
    ),
    resultQuality: validationResult.completionPercent >= 75 ? 'enriched' : 'basic',
    partialData,
    extractionStatus,
    failureReason,
  };
};
