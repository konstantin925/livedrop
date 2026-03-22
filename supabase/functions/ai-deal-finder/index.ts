const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

type MerchantSource = 'Amazon' | 'Walmart' | 'Target' | 'Best Buy' | 'Other' | 'Any';
type RankLabel = 'Best Overall' | 'Best Budget' | 'Best Trusted' | 'Best Discount';

type FinderRequest = {
  phase?: 'search' | 'extract' | 'generate';
  keyword?: string;
  url?: string;
  merchant?: MerchantSource;
  category?: string;
  maxPrice?: number | null;
  minDiscount?: number | null;
  enhance?: boolean;
};

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string;
  score?: number;
};

type SearchCandidate = {
  title: string;
  url: string;
  snippet: string;
  merchant: MerchantSource;
  domain: string;
  productConfidence: number;
  resultType: 'Product Page' | 'Possible Product' | 'Blog/Article' | 'Review/Listicle' | 'Rejected';
  patterns: string[];
  isKnownEcommerceDomain: boolean;
  rejectionReasons: string[];
  imageUrl?: string | null;
  price?: number | null;
  originalPrice?: number | null;
  websiteUrl?: string | null;
  productLink?: string | null;
  affiliateUrl?: string | null;
  discountPercent?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  category?: string | null;
  merchantTrust?: number;
  dataCompleteness?: number;
  dealScore?: number;
  rankLabels?: RankLabel[];
  extractionStatus?: 'Raw candidate' | 'Partial extraction' | 'Enriched';
};

type QueryAttempt = {
  label: string;
  query: string;
  responseStatus: number;
  rawResultCount: number;
};

type TavilyResponse = {
  query?: string;
  images?: string[];
  results?: TavilyResult[];
};

type ExtractedProduct = {
  sourceType: 'keyword' | 'url';
  sourceQuery: string;
  title: string | null;
  brand: string | null;
  merchant: string | null;
  category: string | null;
  description: string | null;
  websiteUrl: string | null;
  productUrl: string | null;
  affiliateUrl: string | null;
  imageUrl: string | null;
  price: number | null;
  originalPrice: number | null;
  discountPercent: number | null;
  rating: number | null;
  reviewCount: number | null;
  tags: string[];
  status: 'active';
};

type ResultQuality = 'basic' | 'enriched';

type ExtractionDebug = {
  sourceUrl: string;
  cleanedProductUrl: string | null;
  fetchAttempted: boolean;
  fetchSucceeded: boolean;
  responseStatus: number | null;
  finalUrl: string | null;
  contentType: string | null;
  htmlLength: number;
  extractedFlags: {
    title: boolean;
    image: boolean;
    price: boolean;
    canonicalUrl: boolean;
  };
  matchedSelectors: {
    title: string | null;
    image: string | null;
    price: string | null;
    canonicalUrl: string | null;
  };
  failedFields: string[];
  failureReason: string | null;
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

const errorResponse = (status: number, message: string, details?: string, stage?: string) =>
  json(
    {
      error: message,
      details: details ?? null,
      stage: stage ?? null,
    },
    status,
  );

const stripHtml = (value: string | null | undefined) =>
  value
    ?.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim() ?? null;

const compactText = (value: string | null | undefined) =>
  stripHtml(value)?.replace(/\s+/g, ' ').trim() ?? null;

const KNOWN_ECOMMERCE_DOMAINS = ['amazon.com', 'walmart.com', 'bestbuy.com', 'target.com'] as const;

const parseCurrencyValue = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.replace(/,/g, '').replace(/[^0-9.]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const truncate = (value: string | null | undefined, limit: number) => {
  const normalized = compactText(value);
  if (!normalized) return null;
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trim()}…`;
};

const computeDiscountPercent = (price: number | null, originalPrice: number | null) => {
  if (!price || !originalPrice || originalPrice <= price) return null;
  const computed = Math.round(((originalPrice - price) / originalPrice) * 100);
  return computed > 0 ? computed : null;
};

const computeDealScore = (
  discountPercent: number | null,
  rating: number | null,
  reviewCount: number | null,
  merchantTrust = 0,
  dataCompleteness = 0,
) => {
  const discountScore = Math.min(Math.max(discountPercent ?? 0, 0), 40);
  const ratingScore = Math.max(0, Math.min(((rating ?? 0) / 5) * 20, 20));
  const reviewScore = Math.min(Math.log10((reviewCount ?? 0) + 1) * 6, 15);
  const trustScore = Math.max(0, Math.min(merchantTrust, 15));
  const completenessScore = Math.max(0, Math.min(dataCompleteness / 10, 10));
  return Math.round(discountScore + ratingScore + reviewScore + trustScore + completenessScore);
};

const getMerchantTrustScore = (merchant: string | null | undefined, domain: string) => {
  const normalizedMerchant = detectMerchantFromValue(`${merchant ?? ''} ${domain}`, 'Other');

  switch (normalizedMerchant) {
    case 'Amazon':
      return 15;
    case 'Best Buy':
      return 14;
    case 'Target':
      return 13;
    case 'Walmart':
      return 13;
    default:
      return KNOWN_ECOMMERCE_DOMAINS.includes(domain as typeof KNOWN_ECOMMERCE_DOMAINS[number]) ? 11 : 6;
  }
};

const computeCandidateCompleteness = (candidate: {
  title: string | null | undefined;
  merchant: string | null | undefined;
  imageUrl?: string | null;
  websiteUrl?: string | null;
  productLink?: string | null;
  affiliateUrl?: string | null;
  price?: number | null;
  originalPrice?: number | null;
  discountPercent?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  category?: string | null;
}) => {
  const checks = [
    candidate.title,
    candidate.merchant && candidate.merchant !== 'Other' ? candidate.merchant : null,
    candidate.imageUrl,
    candidate.websiteUrl,
    candidate.productLink ?? candidate.affiliateUrl,
    candidate.price,
    candidate.originalPrice ?? candidate.discountPercent,
    candidate.rating,
    candidate.reviewCount,
    candidate.category,
  ];
  const filledCount = checks.filter((value) => !(value == null || value === '')).length;
  return Math.round((filledCount / checks.length) * 100);
};

const inferCategory = (inputCategory: string | null, title: string | null, content?: string | null) => {
  const normalized = (inputCategory ?? '').trim();
  if (normalized) return normalized;

  const value = `${title ?? ''} ${content ?? ''}`.toLowerCase();
  if (/(headphones|earbuds|monitor|keyboard|laptop|charger|camera|iphone|tech|speaker|tablet)/.test(value)) return 'Tech';
  if (/(game|gaming|xbox|playstation|nintendo|controller)/.test(value)) return 'Gaming';
  if (/(shirt|shoes|dress|fashion|hoodie|jacket|sneaker|watch)/.test(value)) return 'Fashion';
  if (/(lamp|desk|kitchen|home|vacuum|blender|air fryer|bedding|chair)/.test(value)) return 'Home';
  if (/(template|ebook|software|digital|course|plugin)/.test(value)) return 'Digital';
  if (/(free|giveaway|sample)/.test(value)) return 'Freebies';
  return 'Tech';
};

const detectMerchantFromValue = (value: string | null | undefined, fallback: MerchantSource = 'Other') => {
  const normalized = (value ?? '').toLowerCase();
  if (normalized.includes('amazon')) return 'Amazon';
  if (normalized.includes('walmart')) return 'Walmart';
  if (normalized.includes('target')) return 'Target';
  if (normalized.includes('best buy') || normalized.includes('bestbuy')) return 'Best Buy';
  return fallback;
};

const buildOfferText = (discountPercent: number | null, price: number | null, originalPrice: number | null) => {
  if (discountPercent && discountPercent >= 5) return `${discountPercent}% OFF`;
  if (price && originalPrice && originalPrice > price) return 'DEAL';
  return 'LIMITED';
};

const extractPricePair = (value: string | null | undefined) => {
  if (!value) return { price: null, originalPrice: null };

  const matches = [...value.matchAll(/\$[\d,]+(?:\.\d{2})?/g)].map((match) => parseCurrencyValue(match[0]));
  const numbers = matches.filter((entry): entry is number => entry != null);

  if (numbers.length === 0) {
    return { price: null, originalPrice: null };
  }

  if (numbers.length === 1) {
    return { price: numbers[0], originalPrice: null };
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  return {
    price: sorted[0],
    originalPrice: sorted[sorted.length - 1],
  };
};

const extractRating = (value: string | null | undefined) => {
  const match = value?.match(/([0-4](?:\.\d)?|5(?:\.0)?)\s*(?:out of 5|\/5|stars?)/i);
  if (!match?.[1]) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractReviewCount = (value: string | null | undefined) => {
  const match = value?.match(/([\d,]+)\s+(?:reviews?|ratings?)/i);
  if (!match?.[1]) return null;
  const parsed = Number.parseInt(match[1].replace(/,/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeUrl = (inputUrl: string) => {
  try {
    return new URL(inputUrl.trim()).toString();
  } catch {
    return inputUrl.trim();
  }
};

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

    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(/\/$/, '');
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

const extractMetaContent = (html: string, name: string) => {
  const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i');
  return compactText(html.match(regex)?.[1] ?? null);
};

const extractLinkHref = (html: string, relValue: string) => {
  const regex = new RegExp(`<link[^>]+rel=["'][^"']*${relValue}[^"']*["'][^>]+href=["']([^"']+)["']`, 'i');
  return compactText(html.match(regex)?.[1] ?? null);
};

const extractLabeledFirstText = (
  html: string,
  patterns: Array<{ label: string; pattern: RegExp }>,
) => {
  for (const { label, pattern } of patterns) {
    const match = html.match(pattern);
    const candidate = compactText(match?.[1] ?? null);
    if (candidate) {
      return { value: candidate, label };
    }
  }

  return { value: null, label: null };
};

const extractFirstText = (html: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const candidate = compactText(match?.[1] ?? null);
    if (candidate) return candidate;
  }

  return null;
};

const readJsonLdObjects = (html: string) => {
  const matches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  const values: unknown[] = [];

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        values.push(...parsed);
      } else {
        values.push(parsed);
      }
    } catch {
      continue;
    }
  }

  return values;
};

const getMerchantDomain = (merchant: MerchantSource | undefined) => {
  if (merchant === 'Amazon') return 'amazon.com';
  if (merchant === 'Walmart') return 'walmart.com';
  if (merchant === 'Target') return 'target.com';
  if (merchant === 'Best Buy') return 'bestbuy.com';
  return null;
};

const ALLOWED_PRODUCT_DOMAINS = ['amazon.com', 'walmart.com', 'bestbuy.com', 'target.com'];
const TARGET_SEARCH_RESULT_COUNT = 5;

const isAllowedProductDomain = (url: string) => {
  const domain = getDomain(url);
  return ALLOWED_PRODUCT_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
};

const dedupeQueries = (queries: string[]) => {
  const seen = new Set<string>();
  return queries.filter((query) => {
    const normalized = compactText(query)?.toLowerCase() ?? '';
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

const buildSearchQueries = (body: FinderRequest) => {
  const keyword = compactText(body.keyword) ?? '';
  const directUrl = compactText(body.url);

  if (directUrl && body.phase === 'generate') {
    return [normalizeUrl(directUrl)];
  }

  const merchant = body.merchant && body.merchant !== 'Any' ? body.merchant : null;
  const priceConstraint = body.maxPrice && body.maxPrice > 0 ? `under $${body.maxPrice}` : '';
  const discountConstraint = body.minDiscount && body.minDiscount > 0 ? `${body.minDiscount}% off` : '';
  const queries = [
    [keyword, 'buy', 'price', priceConstraint, discountConstraint].filter(Boolean).join(' '),
    [keyword, merchant ?? 'Amazon'].filter(Boolean).join(' '),
    [keyword, 'deal'].filter(Boolean).join(' '),
    ['buy', keyword, 'online'].filter(Boolean).join(' '),
    [keyword, 'product'].filter(Boolean).join(' '),
  ];

  return dedupeQueries(queries).slice(0, 5);
};

const searchTavilyQuery = async (query: string, tavilyApiKey: string, body: FinderRequest, label: string) => {
  const payload = {
    api_key: tavilyApiKey,
    query,
    search_depth: 'advanced',
    max_results: 5,
    include_images: true,
    include_answer: false,
  };

  console.info('[LiveDrop][ai-deal-finder] Tavily search request', {
    label,
    query,
    hasTavilyKey: true,
    merchant: body.merchant ?? 'Any',
    category: body.category ?? null,
    maxPrice: body.maxPrice ?? null,
    minDiscount: body.minDiscount ?? null,
  });

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let parsed: TavilyResponse | { detail?: string; error?: string } | null = null;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    parsed = null;
  }

  console.info('[LiveDrop][ai-deal-finder] Tavily response status', {
    label,
    query,
    status: response.status,
    ok: response.ok,
  });
  console.info('[LiveDrop][ai-deal-finder] Tavily raw response body', {
    label,
    query,
    body: responseText,
  });

  if (!response.ok) {
    const message =
      (parsed && 'detail' in parsed && typeof parsed.detail === 'string' && parsed.detail) ||
      (parsed && 'error' in parsed && typeof parsed.error === 'string' && parsed.error) ||
      `Tavily search failed with ${response.status}`;
    throw new Error(message);
  }

  const results = Array.isArray((parsed as TavilyResponse | null)?.results) ? (parsed as TavilyResponse).results ?? [] : [];
  const images = Array.isArray((parsed as TavilyResponse | null)?.images) ? (parsed as TavilyResponse).images ?? [] : [];

  return {
    results,
    images,
    query,
    label,
    rawResultCount: results.length,
    rawResponseBody: responseText,
    responseStatus: response.status,
  };
};

const searchWithTavily = async (body: FinderRequest) => {
  const tavilyApiKey = Deno.env.get('TAVILY_API_KEY');
  if (!tavilyApiKey) {
    return {
      error: 'Missing TAVILY_API_KEY',
    };
  }

  const queries = buildSearchQueries(body);
  const queryAttempts: QueryAttempt[] = [];
  const aggregatedResults: TavilyResult[] = [];
  const aggregatedImages: string[] = [];
  const seenResultUrls = new Set<string>();
  const seenImages = new Set<string>();
  let selectedSearch: Awaited<ReturnType<typeof searchTavilyQuery>> | null = null;

  for (const [index, query] of queries.entries()) {
    const label = index === 0 ? 'Primary Query' : `Fallback Query ${index}`;
    const attempt = await searchTavilyQuery(query, tavilyApiKey, body, label);
    queryAttempts.push({
      label,
      query: attempt.query,
      responseStatus: attempt.responseStatus,
      rawResultCount: attempt.rawResultCount,
    });

    if (!selectedSearch || attempt.rawResultCount > 0) {
      selectedSearch = attempt;
    }

    for (const result of attempt.results) {
      const normalizedUrl = normalizeUrl(result.url ?? '');
      if (!normalizedUrl || seenResultUrls.has(normalizedUrl)) continue;
      seenResultUrls.add(normalizedUrl);
      aggregatedResults.push({
        ...result,
        url: normalizedUrl,
      });
    }

    for (const image of attempt.images) {
      const normalizedImage = compactText(image);
      if (!normalizedImage || seenImages.has(normalizedImage)) continue;
      seenImages.add(normalizedImage);
      aggregatedImages.push(normalizedImage);
    }

    if (aggregatedResults.length >= TARGET_SEARCH_RESULT_COUNT) {
      break;
    }
  }

  const fallbackSearch = selectedSearch ?? {
    results: [],
    images: [],
    query: queries[0] ?? '',
    label: 'Primary Query',
    rawResultCount: 0,
    rawResponseBody: '',
    responseStatus: 200,
  };

  return {
    results: aggregatedResults,
    images: aggregatedImages,
    query: fallbackSearch.query,
    primaryQuery: queries[0] ?? '',
    queryAttempts,
    rawResultCount: aggregatedResults.length,
    rawResponseBody: fallbackSearch.rawResponseBody,
    responseStatus: fallbackSearch.responseStatus,
  };
};

const pickBestResult = (results: TavilyResult[], body: FinderRequest) => {
  if (!results.length) return null;

  const requestedUrl = body.url?.trim() ? normalizeUrl(body.url) : null;
  const requestedMerchant = body.merchant && body.merchant !== 'Any' ? body.merchant : null;

  if (requestedUrl) {
    const exact = results.find((result) => normalizeUrl(result.url ?? '') === requestedUrl);
    if (exact) return exact;
  }

  if (requestedMerchant) {
    const merchantMatch = results.find((result) =>
      detectMerchantFromValue(`${result.url ?? ''} ${result.title ?? ''}`) === requestedMerchant
    );
    if (merchantMatch) return merchantMatch;
  }

  return results[0];
};

const isLikelyProductUrl = (url: string | null | undefined) => {
  if (!url) return false;
  const normalized = url.toLowerCase();
  return /\/dp\/|\/product\/|\/products\/|\/p\/|sku=|item\/|\/gp\/product\//.test(normalized);
};

const getDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
};

const getUrlPatterns = (url: string) => {
  const normalized = url.toLowerCase();
  const patterns: string[] = [];
  if (normalized.includes('/dp/')) patterns.push('/dp/');
  if (normalized.includes('/gp/product/')) patterns.push('/gp/product/');
  if (/\/product\/|\/products\/|\/p\/|sku=|item\//.test(normalized)) patterns.push('product URL');
  return patterns;
};

const scoreProductConfidence = (url: string, title: string, snippet: string) => {
  const domain = getDomain(url);
  const haystack = `${url} ${title} ${snippet}`.toLowerCase();
  const titleValue = title.toLowerCase();
  let score = 0;
  if (['amazon.com', 'walmart.com', 'bestbuy.com', 'target.com'].includes(domain)) score += 40;
  if (/\/dp\/|\/gp\/product\/|\/product\/|\/products\/|\/ip\/|\/p\/|sku=|item\//.test(haystack)) score += 30;
  if (/(\$\d+|\d+%\s*off|deal|sale|discount|bundle|flash|limited|buy|shop|product)/.test(titleValue)) score += 15;
  if (/(best|top 10|review|vs\b)/.test(titleValue)) score -= 25;
  if (/(blog|news|press|magazine|editorial|guide|medium\.com|substack\.com|forbes\.com|cnet\.com|techradar\.com)/.test(domain)) score -= 20;
  return Math.max(0, Math.min(100, score));
};

const classifyResultType = (
  productConfidence: number,
  domain: string,
  title: string,
  url: string,
): SearchCandidate['resultType'] => {
  const titleValue = title.toLowerCase();
  const urlValue = url.toLowerCase();
  if (/(best|top 10|review|vs\b)/.test(titleValue)) return 'Review/Listicle';
  if (/(blog|news|press|magazine|editorial|guide|medium\.com|substack\.com|forbes\.com|cnet\.com|techradar\.com)/.test(domain)) return 'Blog/Article';
  if (productConfidence >= 70) return 'Product Page';
  if (productConfidence >= 40) return 'Possible Product';
  if (!/\/dp\/|\/gp\/product\/|\/product\/|\/products\/|\/ip\/|\/p\/|sku=|item\//.test(urlValue)) return 'Rejected';
  return 'Rejected';
};

const getRejectionReasons = (
  domain: string,
  title: string,
  url: string,
  productConfidence: number,
  isKnownEcommerceDomain: boolean,
): string[] => {
  const reasons: string[] = [];
  const titleValue = title.toLowerCase();
  const urlValue = url.toLowerCase();

  if (!isKnownEcommerceDomain) reasons.push('non-ecommerce domain');
  if (!isAllowedProductDomain(url)) reasons.push('unsupported merchant domain');
  if (/(best|top 10|review|vs\b)/.test(titleValue)) reasons.push('article/listicle title pattern');
  if (!/\/dp\/|\/gp\/product\/|\/product\/|\/products\/|\/ip\/|\/p\/|sku=|item\//.test(urlValue)) reasons.push('missing product URL pattern');
  if (productConfidence < 40) reasons.push('weak product confidence');

  return reasons;
};

const mapSearchCandidates = (results: TavilyResult[], body: FinderRequest, images: string[] = []): SearchCandidate[] =>
  results
    .filter((result) => typeof result.url === 'string' && result.url.trim().length > 0)
    .map((result, index) => {
      const url = normalizeUrl(result.url!);
      const title = compactText(result.title) ?? 'Untitled result';
      const snippet = truncate(result.content ?? result.raw_content, 160) ?? 'No snippet available.';
      const { price, originalPrice } = extractPricePair(`${result.title ?? ''} ${result.content ?? ''} ${result.raw_content ?? ''}`);
      const domain = getDomain(url);
      const patterns = getUrlPatterns(url);
      const productConfidence = scoreProductConfidence(url, title, snippet);
      const isKnownEcommerceDomain = KNOWN_ECOMMERCE_DOMAINS.includes(domain as typeof KNOWN_ECOMMERCE_DOMAINS[number]);
      const resultType = classifyResultType(productConfidence, domain, title, url);
      const rejectionReasons = getRejectionReasons(domain, title, url, productConfidence, isKnownEcommerceDomain);
      const merchant = body.merchant && body.merchant !== 'Any'
        ? body.merchant
        : detectMerchantFromValue(`${url} ${result.title ?? ''}`);
      const productLink = cleanProductUrl(url) ?? url;
      const affiliateUrl = productLink;
      const websiteUrl = deriveWebsiteUrl(productLink) ?? deriveWebsiteUrl(url);
      const discountPercent = computeDiscountPercent(price, originalPrice);
      const rating = extractRating(`${result.title ?? ''} ${result.content ?? ''} ${result.raw_content ?? ''}`);
      const reviewCount = extractReviewCount(`${result.title ?? ''} ${result.content ?? ''} ${result.raw_content ?? ''}`);
      const category = inferCategory(body.category?.trim() ?? null, title, snippet);
      const merchantTrust = getMerchantTrustScore(merchant, domain);
      const dataCompleteness = computeCandidateCompleteness({
        title,
        merchant,
        imageUrl: images[index] ?? images[0] ?? null,
        websiteUrl,
        productLink,
        affiliateUrl,
        price,
        originalPrice,
        discountPercent,
        rating,
        reviewCount,
        category,
      });
      const dealScore = computeDealScore(discountPercent, rating, reviewCount, merchantTrust, dataCompleteness);

      return {
        title,
        url,
        snippet,
        merchant,
        domain,
        productConfidence,
        resultType,
        patterns,
        isKnownEcommerceDomain,
        rejectionReasons,
        imageUrl: images[index] ?? images[0] ?? null,
        price,
        originalPrice,
        websiteUrl,
        productLink,
        affiliateUrl,
        discountPercent,
        rating,
        reviewCount,
        category,
        merchantTrust,
        dataCompleteness,
        dealScore,
        rankLabels: [],
        extractionStatus: 'Raw candidate',
      };
    });

const extractFromProductUrl = async (url: string) => {
  const normalizedUrl = normalizeUrl(url);
  console.info('[LiveDrop][ai-deal-finder] Enriching from product page', { normalizedUrl });

  const response = await fetch(normalizedUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; LiveDropBot/1.0; +https://livedrop.app)',
      'accept-language': 'en-US,en;q=0.9',
    },
  });

  if (!response.ok) {
    throw new Error(`Product page fetch failed with ${response.status}`);
  }

  const html = await response.text();
  const finalUrl = normalizeUrl(response.url || normalizedUrl);
  const contentType = response.headers.get('content-type');
  const cleanedInputUrl = cleanProductUrl(finalUrl) ?? cleanProductUrl(normalizedUrl);
  const domain = getDomain(finalUrl);
  const isAmazonUrl = domain.includes('amazon.');
  const jsonLd = readJsonLdObjects(html);
  const productJson = jsonLd.find((item) => typeof item === 'object' && item && ((item as Record<string, unknown>)['@type'] === 'Product')) as Record<string, unknown> | undefined;
  const aggregateRating = productJson?.aggregateRating as Record<string, unknown> | undefined;
  const brandValue = productJson?.brand as Record<string, unknown> | string | undefined;
  const offersValue = Array.isArray(productJson?.offers)
    ? (productJson?.offers?.[0] as Record<string, unknown> | undefined)
    : (productJson?.offers as Record<string, unknown> | undefined);

  const titleMatch = extractLabeledFirstText(html, isAmazonUrl
    ? [
        { label: 'meta og:title', pattern: /<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)["']/i },
        { label: '#productTitle', pattern: /<span[^>]+id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i },
        { label: 'json-ld Product.name', pattern: /<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?<\/script>/i },
        { label: 'document title', pattern: /<title[^>]*>([\s\S]*?)<\/title>/i },
      ]
    : [
        { label: 'meta og:title', pattern: /<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)["']/i },
        { label: 'json-ld Product.name', pattern: /<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?<\/script>/i },
        { label: 'document title', pattern: /<title[^>]*>([\s\S]*?)<\/title>/i },
      ]);
  const imageMatch = extractLabeledFirstText(html, isAmazonUrl
    ? [
        { label: 'meta og:image', pattern: /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i },
        { label: 'img#landingImage data-old-hires', pattern: /<img[^>]+id=["']landingImage["'][^>]+data-old-hires=["']([^"']+)["']/i },
        { label: 'img#landingImage src', pattern: /<img[^>]+id=["']landingImage["'][^>]+src=["']([^"']+)["']/i },
        { label: 'json-ld Product.image', pattern: /<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?"image"\s*:\s*"([^"]+)"[\s\S]*?<\/script>/i },
      ]
    : [
        { label: 'meta og:image', pattern: /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i },
        { label: 'json-ld Product.image', pattern: /<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?"image"\s*:\s*"([^"]+)"[\s\S]*?<\/script>/i },
      ]);
  const canonicalMatch = extractLabeledFirstText(html, [
    { label: 'link[rel=canonical]', pattern: /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']/i },
    { label: 'meta og:url', pattern: /<meta[^>]+(?:property|name)=["']og:url["'][^>]+content=["']([^"']+)["']/i },
  ]);
  const priceMatch = extractLabeledFirstText(html, isAmazonUrl
    ? [
        { label: 'meta product:price:amount', pattern: /<meta[^>]+(?:property|name)=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i },
        { label: '#corePrice_feature_div .a-offscreen', pattern: /id=["']corePrice[^>]*[\s\S]*?<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*([^<]+)\s*<\/span>/i },
        { label: '.a-price .a-offscreen', pattern: /<span[^>]*class=["'][^"']*a-price[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*a-offscreen[^"']*["'][^>]*>\s*([^<]+)\s*<\/span>/i },
        { label: 'offers.price', pattern: /"price"\s*:\s*"([^"]+)"/i },
      ]
    : [
        { label: 'meta product:price:amount', pattern: /<meta[^>]+(?:property|name)=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i },
        { label: 'offers.price', pattern: /"price"\s*:\s*"([^"]+)"/i },
        { label: 'text currency', pattern: /\$([0-9]+(?:\.\d{2})?)/i },
      ]);

  const title = compactText(titleMatch.value ?? (productJson?.name as string | undefined));
  const imageUrl = compactText(imageMatch.value ?? (productJson?.image as string | undefined));
  const description = truncate(
    (productJson?.description as string | undefined) ??
      extractMetaContent(html, 'og:description') ??
      extractMetaContent(html, 'description'),
    140,
  );
  const brand =
    typeof brandValue === 'string'
      ? brandValue
      : compactText((brandValue?.name as string | undefined) ?? extractMetaContent(html, 'product:brand'));
  const price = parseCurrencyValue(
    (offersValue?.price as string | undefined) ??
      extractMetaContent(html, 'product:price:amount') ??
      priceMatch.value ??
      extractFirstText(html, [/\$([0-9]+(?:\.\d{2})?)/i]),
  );
  const originalPrice = parseCurrencyValue(
    extractFirstText(html, [
      /"listPrice"\s*:\s*"([^"]+)"/i,
      /"highPrice"\s*:\s*"([^"]+)"/i,
      /"priceBeforeDiscount"\s*:\s*"([^"]+)"/i,
    ]),
  );
  const rating = Number.parseFloat(
    ((aggregateRating?.ratingValue as string | undefined) ?? extractFirstText(html, [/([0-4](?:\.\d)?|5(?:\.0)?)\s*(?:out of 5|\/5|stars?)/i])) ?? '',
  );
  const reviewCount = Number.parseInt(
    (((aggregateRating?.reviewCount as string | undefined) ?? (aggregateRating?.ratingCount as string | undefined) ?? (extractFirstText(html, [/([\d,]+)\s+(?:reviews?|ratings?)/i]) ?? '')).replace(/,/g, '')),
    10,
  );
  const amazonAsin = getAmazonAsin(canonicalMatch.value ?? cleanedInputUrl ?? finalUrl);
  const canonicalUrl = amazonAsin && isAmazonUrl
    ? `https://www.amazon.com/dp/${amazonAsin}`
    : cleanProductUrl(canonicalMatch.value ?? cleanedInputUrl ?? finalUrl);
  const isHtmlResponse = Boolean(contentType?.toLowerCase().includes('text/html'));
  const failedFields = [
    !title ? 'title' : null,
    !imageUrl ? 'imageUrl' : null,
    !canonicalUrl ? 'productUrl' : null,
    price == null ? 'price' : null,
  ].filter((value): value is string => Boolean(value));
  const extractionFailed =
    !isHtmlResponse ||
    html.length < 1200 ||
    !title ||
    !imageUrl ||
    !canonicalUrl;
  const failureReason =
    !isHtmlResponse
      ? 'Product page did not return HTML content.'
      : html.length < 1200
        ? 'Fetched page HTML was too small to contain usable product metadata.'
        : isAmazonUrl && (!title || !imageUrl || !canonicalUrl)
          ? 'Amazon blocked or product metadata could not be extracted'
          : failedFields.length
            ? `Missing extracted fields: ${failedFields.join(', ')}.`
            : null;
  const debug: ExtractionDebug = {
    sourceUrl: normalizedUrl,
    cleanedProductUrl: canonicalUrl,
    fetchAttempted: true,
    fetchSucceeded: true,
    responseStatus: response.status,
    finalUrl,
    contentType,
    htmlLength: html.length,
    extractedFlags: {
      title: Boolean(title),
      image: Boolean(imageUrl),
      price: price != null,
      canonicalUrl: Boolean(canonicalUrl),
    },
    matchedSelectors: {
      title: titleMatch.label,
      image: imageMatch.label,
      price: priceMatch.label,
      canonicalUrl: canonicalMatch.label ?? (cleanedInputUrl ? 'cleaned input URL' : null),
    },
    failedFields,
    failureReason,
  };

  console.info('[LiveDrop][ai-deal-finder] Product page extraction debug', debug);

  return {
    title: title ?? null,
    imageUrl: imageUrl ?? null,
    description: description ?? null,
    merchant: detectMerchantFromValue(normalizedUrl, 'Other'),
    websiteUrl: deriveWebsiteUrl(canonicalUrl ?? normalizedUrl),
    productUrl: canonicalUrl,
    affiliateUrl: canonicalUrl,
    price,
    originalPrice,
    discountPercent: computeDiscountPercent(price, originalPrice),
    rating: Number.isFinite(rating) ? rating : null,
    reviewCount: Number.isFinite(reviewCount) ? reviewCount : null,
    brand: compactText(brand),
    debug,
    extractionFailed,
    failureReason,
  };
};

const extractFromTavily = async (body: FinderRequest): Promise<ExtractedProduct & { summary: string }> => {
  const searchResult = await searchWithTavily(body);
  if ('error' in searchResult) {
    throw new Error(searchResult.error);
  }

  const bestResult = pickBestResult(searchResult.results, body);
  if (!bestResult) {
    throw new Error('No Tavily search results matched that query.');
  }

  const mergedText = compactText(
    [bestResult.title, bestResult.content, bestResult.raw_content].filter(Boolean).join(' ')
  );
  const merchantFromResult = detectMerchantFromValue(
    `${bestResult.url ?? ''} ${bestResult.title ?? ''}`,
    body.merchant && body.merchant !== 'Any' ? body.merchant : 'Other'
  );
  const { price, originalPrice } = extractPricePair(mergedText);
  const discountPercent = computeDiscountPercent(price, originalPrice);
  const rating = extractRating(mergedText);
  const reviewCount = extractReviewCount(mergedText);
  const title = compactText(bestResult.title) ?? `${body.keyword?.trim() || 'Affiliate'} Deal`;
  const category = inferCategory(body.category?.trim() ?? null, title, mergedText);
  const imageUrl = searchResult.images[0] ?? null;
  const affiliateUrl = body.url?.trim() ? normalizeUrl(body.url) : compactText(bestResult.url);
  const merchant = body.merchant && body.merchant !== 'Any' ? body.merchant : merchantFromResult;
  const businessName = merchant === 'Other' ? 'Affiliate Store' : merchant;
  const description =
    truncate(bestResult.content ?? bestResult.raw_content ?? mergedText, 140) ??
    `Limited-time ${category.toLowerCase()} deal available now.`;

  const tags = [
    category.toLowerCase(),
    merchant.toLowerCase().replace(/\s+/g, '-'),
    discountPercent ? 'discount' : 'deal',
  ].filter(Boolean);

  return {
    sourceType: body.url?.trim() ? 'url' : 'keyword',
    sourceQuery: body.url?.trim() ? normalizeUrl(body.url) : (body.keyword?.trim() ?? ''),
    title,
    brand: businessName,
    merchant,
    category,
    description,
    websiteUrl: affiliateUrl ? deriveWebsiteUrl(affiliateUrl) : null,
    productUrl: affiliateUrl,
    affiliateUrl,
    imageUrl,
    price,
    originalPrice,
    discountPercent,
    rating,
    reviewCount,
    tags,
    status: 'active',
    summary: description,
  };
};

const mergeExtractedProducts = (
  base: ExtractedProduct & { summary: string },
  enriched: Awaited<ReturnType<typeof extractFromProductUrl>>,
): ExtractedProduct & { summary: string } => {
  const mergedPrice = enriched.price ?? base.price;
  const mergedOriginalPrice = enriched.originalPrice ?? base.originalPrice;

  return {
    ...base,
    title: enriched.title ?? base.title,
    brand: enriched.brand ?? base.brand,
    merchant: (enriched.merchant && enriched.merchant !== 'Other' ? enriched.merchant : null) ?? base.merchant,
    description: enriched.description ?? base.description,
    websiteUrl: enriched.websiteUrl ?? base.websiteUrl,
    productUrl: enriched.productUrl ?? base.productUrl,
    affiliateUrl: enriched.affiliateUrl ?? base.affiliateUrl,
    imageUrl: enriched.imageUrl ?? base.imageUrl,
    price: mergedPrice,
    originalPrice: mergedOriginalPrice,
    discountPercent: enriched.discountPercent ?? computeDiscountPercent(mergedPrice, mergedOriginalPrice) ?? base.discountPercent,
    rating: enriched.rating ?? base.rating,
    reviewCount: enriched.reviewCount ?? base.reviewCount,
    summary: enriched.description ?? base.summary,
  };
};

const shouldEnrichSearchCandidate = (candidate: SearchCandidate) =>
  candidate.isKnownEcommerceDomain || isAllowedProductDomain(candidate.url) || isLikelyProductUrl(candidate.url);

const mergeSearchCandidateData = (
  candidate: SearchCandidate,
  body: FinderRequest,
  enriched?: Awaited<ReturnType<typeof extractFromProductUrl>> | null,
): SearchCandidate => {
  const title = enriched?.title ?? candidate.title;
  const merchant = body.merchant && body.merchant !== 'Any'
    ? body.merchant
    : detectMerchantFromValue(`${enriched?.merchant ?? candidate.merchant} ${candidate.url}`, candidate.merchant);
  const productLink =
    enriched?.productUrl ??
    enriched?.affiliateUrl ??
    candidate.productLink ??
    cleanProductUrl(candidate.url) ??
    candidate.url;
  const affiliateUrl = enriched?.affiliateUrl ?? candidate.affiliateUrl ?? productLink;
  const websiteUrl =
    enriched?.websiteUrl ??
    candidate.websiteUrl ??
    deriveWebsiteUrl(productLink) ??
    deriveWebsiteUrl(candidate.url);
  const price = enriched?.price ?? candidate.price ?? null;
  const originalPrice = enriched?.originalPrice ?? candidate.originalPrice ?? null;
  const discountPercent =
    enriched?.discountPercent ??
    candidate.discountPercent ??
    computeDiscountPercent(price, originalPrice);
  const rating = enriched?.rating ?? candidate.rating ?? null;
  const reviewCount = enriched?.reviewCount ?? candidate.reviewCount ?? null;
  const category =
    inferCategory(
      body.category?.trim() ?? candidate.category ?? null,
      title,
      `${candidate.snippet} ${enriched?.description ?? ''}`,
    ) ?? candidate.category;
  const merchantTrust = getMerchantTrustScore(merchant, candidate.domain);
  const dataCompleteness = computeCandidateCompleteness({
    title,
    merchant,
    imageUrl: enriched?.imageUrl ?? candidate.imageUrl ?? null,
    websiteUrl,
    productLink,
    affiliateUrl,
    price,
    originalPrice,
    discountPercent,
    rating,
    reviewCount,
    category,
  });
  const dealScore = computeDealScore(discountPercent, rating, reviewCount, merchantTrust, dataCompleteness);
  const hasStrongExtraction = Boolean(
    enriched && !enriched.extractionFailed && title && (productLink || affiliateUrl) && (enriched.imageUrl ?? candidate.imageUrl),
  );
  const resultType =
    hasStrongExtraction && dataCompleteness >= 70
      ? 'Product Page'
      : hasStrongExtraction || dataCompleteness >= 50
        ? 'Possible Product'
        : candidate.resultType;
  const rejectionReasons = candidate.rejectionReasons.filter((reason) => {
    if (reason === 'missing product URL pattern' && (productLink || affiliateUrl)) return false;
    if (reason === 'weak product confidence' && (hasStrongExtraction || dataCompleteness >= 50)) return false;
    return true;
  });

  return {
    ...candidate,
    title,
    merchant,
    imageUrl: enriched?.imageUrl ?? candidate.imageUrl ?? null,
    price,
    originalPrice,
    websiteUrl,
    productLink,
    affiliateUrl,
    discountPercent,
    rating,
    reviewCount,
    category,
    merchantTrust,
    dataCompleteness,
    dealScore,
    resultType,
    rejectionReasons,
    extractionStatus: enriched
      ? (enriched.extractionFailed ? 'Partial extraction' : 'Enriched')
      : candidate.extractionStatus ?? 'Raw candidate',
  };
};

const rankSearchCandidates = (candidates: SearchCandidate[]) => {
  const sorted = [...candidates].sort((left, right) =>
    (right.dealScore ?? 0) - (left.dealScore ?? 0)
    || right.productConfidence - left.productConfidence
    || (right.dataCompleteness ?? 0) - (left.dataCompleteness ?? 0)
  );
  const labelMap = new Map<string, Set<RankLabel>>();
  const labelPool = sorted.filter((candidate) => candidate.resultType !== 'Rejected');
  const budgetPool = labelPool.filter((candidate) => candidate.price != null);
  const trustedPool = labelPool.filter((candidate) => (candidate.merchantTrust ?? 0) > 0);
  const discountPool = labelPool.filter((candidate) => (candidate.discountPercent ?? 0) > 0);

  const addLabel = (candidate: SearchCandidate | undefined, label: RankLabel) => {
    if (!candidate) return;
    const nextLabels = labelMap.get(candidate.url) ?? new Set<RankLabel>();
    nextLabels.add(label);
    labelMap.set(candidate.url, nextLabels);
  };

  addLabel(labelPool[0] ?? sorted[0], 'Best Overall');
  addLabel(
    [...(budgetPool.length ? budgetPool : labelPool)].sort((left, right) =>
      (left.price ?? Number.POSITIVE_INFINITY) - (right.price ?? Number.POSITIVE_INFINITY)
      || (right.dealScore ?? 0) - (left.dealScore ?? 0)
    )[0],
    'Best Budget',
  );
  addLabel(
    [...(trustedPool.length ? trustedPool : labelPool)].sort((left, right) =>
      (right.merchantTrust ?? 0) - (left.merchantTrust ?? 0)
      || (right.dealScore ?? 0) - (left.dealScore ?? 0)
    )[0],
    'Best Trusted',
  );
  addLabel(
    [...(discountPool.length ? discountPool : labelPool)].sort((left, right) =>
      (right.discountPercent ?? 0) - (left.discountPercent ?? 0)
      || (right.dealScore ?? 0) - (left.dealScore ?? 0)
    )[0],
    'Best Discount',
  );

  return sorted.map((candidate) => ({
    ...candidate,
    rankLabels: Array.from(labelMap.get(candidate.url) ?? []),
  }));
};

const enrichAndRankSearchCandidates = async (
  candidates: SearchCandidate[],
  body: FinderRequest,
) => {
  const enrichedCandidates = await Promise.all(
    candidates.map(async (candidate) => {
      if (!shouldEnrichSearchCandidate(candidate)) {
        return mergeSearchCandidateData(candidate, body);
      }

      try {
        const enriched = await extractFromProductUrl(candidate.url);
        return mergeSearchCandidateData(candidate, body, enriched);
      } catch (error) {
        console.warn('[LiveDrop][ai-deal-finder] Candidate enrichment failed', {
          url: candidate.url,
          error: error instanceof Error ? error.message : error,
        });
        return mergeSearchCandidateData(candidate, body);
      }
    }),
  );

  return rankSearchCandidates(enrichedCandidates);
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let currentStep = 'request-start';

  try {
    const hasSupabaseUrl = Boolean(Deno.env.get('SUPABASE_URL'));
    const hasSupabaseAnonKey = Boolean(Deno.env.get('SUPABASE_ANON_KEY'));
    console.info('[LiveDrop][ai-deal-finder] Incoming request', {
      method: request.method,
      origin: request.headers.get('origin'),
      hasAuthorizationHeader: Boolean(request.headers.get('authorization')),
      authRequired: false,
      envPresence: {
        SUPABASE_URL: hasSupabaseUrl,
        SUPABASE_ANON_KEY: hasSupabaseAnonKey,
      },
    });

    currentStep = 'parse-request-body';
    const body = (await request.json()) as FinderRequest;
    const phase = body.phase ?? 'extract';
    const keyword = body.keyword?.trim() ?? '';
    const url = body.url?.trim() ?? '';

    console.info('[LiveDrop][ai-deal-finder] Request payload', {
      keyword,
      hasUrl: Boolean(url),
      merchant: body.merchant ?? 'Any',
      category: body.category ?? null,
      maxPrice: body.maxPrice ?? null,
      minDiscount: body.minDiscount ?? null,
      enhance: Boolean(body.enhance),
      phase,
    });

    if (!url) {
      return errorResponse(
        400,
        'Paste a direct product URL to continue.',
        'Tavily search is disabled for now. Use a direct product URL.',
        'validate-input',
      );
    }

    const searchResult = {
      results: [] as TavilyResult[],
      images: [] as string[],
      query: '',
      primaryQuery: '',
      queryAttempts: [] as QueryAttempt[],
      rawResultCount: 0,
      rawResponseBody: '',
      responseStatus: 200,
    };
    const searchCandidates: SearchCandidate[] = [];
    const validProductCandidates: SearchCandidate[] = [];
    const rejectedCandidates: SearchCandidate[] = [];
    const selectedSourceUrl = url;
    if (!selectedSourceUrl) {
      return errorResponse(
        400,
        'No valid product page found',
        'Paste a direct product URL to continue.',
        'select-product',
      );
    }

    const cleanedSelectedSourceUrl = cleanProductUrl(selectedSourceUrl) ?? normalizeUrl(selectedSourceUrl);
    const directSourceMerchant = body.merchant && body.merchant !== 'Any'
      ? body.merchant
      : detectMerchantFromValue(selectedSourceUrl, 'Other');
    const directSourceCategory = inferCategory(body.category?.trim() ?? null, keyword || null, null);
    let extractionDebug: ExtractionDebug | null = null;
    let extractionStatus = 'Extraction failed';
    currentStep = 'direct-url-basic-map';
    const basicExtracted = {
      sourceType: 'url' as const,
      sourceQuery: cleanedSelectedSourceUrl,
      title: keyword || `${directSourceMerchant === 'Other' ? 'Imported' : directSourceMerchant} Deal`,
      brand: directSourceMerchant === 'Other' ? 'Affiliate Store' : directSourceMerchant,
      merchant: directSourceMerchant,
      category: directSourceCategory,
      description: keyword ? `Imported deal for ${keyword}.` : `Imported product deal from ${directSourceMerchant === 'Other' ? 'the linked store' : directSourceMerchant}.`,
      websiteUrl: deriveWebsiteUrl(cleanedSelectedSourceUrl),
      productUrl: cleanedSelectedSourceUrl,
      affiliateUrl: cleanedSelectedSourceUrl,
      imageUrl: null,
      price: null,
      originalPrice: null,
      discountPercent: null,
      rating: null,
      reviewCount: null,
      tags: [directSourceCategory.toLowerCase(), directSourceMerchant.toLowerCase().replace(/\s+/g, '-')],
      status: 'active' as const,
      summary: keyword ? `Imported deal for ${keyword}.` : `Imported product deal from ${directSourceMerchant === 'Other' ? 'the linked store' : directSourceMerchant}.`,
    };
    let extracted = basicExtracted;
    let resultQuality: ResultQuality = 'basic';
    let partialData = false;
    let enrichmentError: string | null = null;
    const enrichmentUrl = (cleanedSelectedSourceUrl || basicExtracted.affiliateUrl) ?? null;

    if (enrichmentUrl) {
      currentStep = 'product-page-enrichment';
      try {
        const enrichedProduct = await extractFromProductUrl(enrichmentUrl);
        extractionDebug = enrichedProduct.debug;
        const hasCoreSourceAssets = Boolean(
          enrichedProduct.title &&
          enrichedProduct.imageUrl &&
          (enrichedProduct.productUrl || enrichedProduct.affiliateUrl),
        );
        if (!enrichedProduct.extractionFailed && hasCoreSourceAssets) {
          extracted = mergeExtractedProducts(basicExtracted, enrichedProduct);
          resultQuality = 'enriched';
          partialData = false;
          enrichmentError = null;
          extractionStatus = 'Extraction succeeded';
        } else {
          extracted = mergeExtractedProducts(basicExtracted, enrichedProduct);
          partialData = true;
          extractionStatus = 'Extraction failed';
          enrichmentError = enrichedProduct.failureReason ?? `Missing extracted fields: ${enrichedProduct.debug.failedFields.join(', ') || 'title, imageUrl, productUrl'}.`;
          console.warn('[LiveDrop][ai-deal-finder] Enrichment fallback applied', {
            enrichmentUrl,
            error: enrichmentError,
            extractionDebug: enrichedProduct.debug,
          });
        }
      } catch (error) {
        partialData = true;
        extractionStatus = 'Extraction failed';
        enrichmentError = error instanceof Error ? error.message : 'Product page enrichment failed.';
        extractionDebug = {
          sourceUrl: enrichmentUrl,
          cleanedProductUrl: cleanProductUrl(enrichmentUrl),
          fetchAttempted: true,
          fetchSucceeded: false,
          responseStatus: null,
          finalUrl: null,
          contentType: null,
          htmlLength: 0,
          extractedFlags: {
            title: false,
            image: false,
            price: false,
            canonicalUrl: false,
          },
          matchedSelectors: {
            title: null,
            image: null,
            price: null,
            canonicalUrl: null,
          },
          failedFields: ['title', 'imageUrl', 'productUrl'],
          failureReason: enrichmentError,
        };
      }
    } else {
      partialData = true;
      extractionStatus = 'Extraction failed';
      enrichmentError = 'No cleaned product URL could be derived from the pasted input.';
    }

    if (body.enhance && enrichmentUrl && resultQuality !== 'enriched') {
      currentStep = 'enhance-request';
      try {
        const enrichedProduct = await extractFromProductUrl(enrichmentUrl);
        extractionDebug = enrichedProduct.debug;
        extracted = mergeExtractedProducts(extracted, enrichedProduct);
        const hasCoreSourceAssets = Boolean(
          enrichedProduct.title &&
          enrichedProduct.imageUrl &&
          (enrichedProduct.productUrl || enrichedProduct.affiliateUrl),
        );
        if (!enrichedProduct.extractionFailed && hasCoreSourceAssets) {
          resultQuality = 'enriched';
          partialData = false;
          enrichmentError = null;
          extractionStatus = 'Extraction succeeded';
        } else {
          partialData = true;
          extractionStatus = 'Extraction failed';
          enrichmentError = enrichedProduct.failureReason ?? `Missing extracted fields: ${enrichedProduct.debug.failedFields.join(', ') || 'title, imageUrl, productUrl'}.`;
        }
      } catch (error) {
        partialData = true;
        extractionStatus = 'Extraction failed';
        enrichmentError = error instanceof Error ? error.message : 'Enhance Deal failed.';
      }
    }

    const normalizedDiscount = extracted.discountPercent;
    const offerText = buildOfferText(normalizedDiscount, extracted.price, extracted.originalPrice);

    currentStep = 'normalize-result';
    const normalizedDeal = {
      businessName: extracted.brand ?? extracted.merchant ?? 'Affiliate Store',
      title: extracted.title ?? `${keyword || 'Affiliate'} Deal`,
      description: extracted.description ?? 'Imported affiliate product deal.',
      category: extracted.category ?? 'Tech',
      offerText,
      imageUrl: extracted.imageUrl ?? undefined,
      websiteUrl: extracted.websiteUrl ?? deriveWebsiteUrl(extracted.productUrl ?? extracted.affiliateUrl ?? null) ?? undefined,
      productLink: extracted.productUrl ?? extracted.affiliateUrl ?? undefined,
      productUrl: extracted.productUrl ?? extracted.affiliateUrl ?? undefined,
      affiliateUrl: extracted.affiliateUrl ?? extracted.productUrl ?? undefined,
      originalPrice: extracted.originalPrice ?? undefined,
      discountPercent: normalizedDiscount ?? undefined,
      reviewCount: extracted.reviewCount ?? undefined,
      stockStatus: extracted.status,
      durationMinutes: 150,
      claimCount: 0,
      maxClaims: 999,
      isOnline: true,
      price: extracted.price ?? undefined,
      rating: extracted.rating ?? undefined,
      merchant: extracted.merchant ?? undefined,
      tags: extracted.tags,
      status: extracted.status,
      summary: extracted.summary,
      sourceType: extracted.sourceType,
      sourceQuery: extracted.sourceQuery,
      maxPriceMatched: body.maxPrice == null || (extracted.price != null && extracted.price <= body.maxPrice),
    };

    const requiredPortalFields = ['businessName', 'title', 'description', 'category', 'offerText'] as const;
    const optionalDataFields = ['price', 'originalPrice', 'discountPercent', 'imageUrl', 'affiliateUrl', 'rating', 'reviewCount'] as const;

    const missingFields = [
      !normalizedDeal.businessName ? 'businessName' : null,
      !normalizedDeal.title ? 'title' : null,
      !normalizedDeal.description ? 'description' : null,
      !normalizedDeal.category ? 'category' : null,
      !normalizedDeal.offerText ? 'offerText' : null,
      normalizedDeal.price == null ? 'price' : null,
      normalizedDeal.originalPrice == null ? 'originalPrice' : null,
      normalizedDeal.discountPercent == null ? 'discountPercent' : null,
      !normalizedDeal.imageUrl ? 'imageUrl' : null,
      !normalizedDeal.affiliateUrl ? 'affiliateUrl' : null,
      !normalizedDeal.websiteUrl ? 'websiteUrl' : null,
      !normalizedDeal.productUrl ? 'productUrl' : null,
      normalizedDeal.rating == null ? 'rating' : null,
      normalizedDeal.reviewCount == null ? 'reviewCount' : null,
    ].filter((value): value is string => Boolean(value));

    const filledFields = [...requiredPortalFields, ...optionalDataFields].filter((field) => {
      const value = normalizedDeal[field];
      return !(value == null || value === '');
    });
    let completionPercent = Math.round((filledFields.length / (requiredPortalFields.length + optionalDataFields.length)) * 100);
    if (
      !normalizedDeal.title ||
      !normalizedDeal.imageUrl ||
      !(normalizedDeal.productUrl || normalizedDeal.affiliateUrl) ||
      extractionStatus === 'Extraction failed'
    ) {
      completionPercent = Math.min(completionPercent, 85);
    }
    const missingGroups = {
      required: missingFields.filter((field) => requiredPortalFields.includes(field as typeof requiredPortalFields[number])),
      optional: missingFields.filter((field) => optionalDataFields.includes(field as typeof optionalDataFields[number])),
      filled: filledFields,
    };

    if (
      !normalizedDeal.businessName ||
      !normalizedDeal.title ||
      !normalizedDeal.description ||
      !normalizedDeal.category ||
      !normalizedDeal.offerText
    ) {
      return errorResponse(
        500,
        'Normalized deal is missing required portal fields.',
        `Missing required fields after direct URL mapping: ${missingFields.join(', ')}`,
        'validate-json',
      );
    }

    const dealScore = computeDealScore(
      normalizedDeal.discountPercent ?? null,
      normalizedDeal.rating ?? null,
      normalizedDeal.reviewCount ?? null,
      getMerchantTrustScore(
        normalizedDeal.merchant ?? normalizedDeal.businessName ?? null,
        getDomain(normalizedDeal.productUrl ?? normalizedDeal.websiteUrl ?? normalizedDeal.affiliateUrl ?? selectedSourceUrl),
      ),
      completionPercent,
    );

    console.info('[LiveDrop][ai-deal-finder] Success', {
      title: normalizedDeal.title,
      merchant: normalizedDeal.merchant,
      missingFields,
      dealScore,
      step: currentStep,
    });

    return json({
      normalizedDeal,
      generatedJson: phase === 'generate' ? JSON.stringify(normalizedDeal, null, 2) : '',
      missingFields,
      dealScore,
      summary: normalizedDeal.summary,
      appliedFilters: {
        merchant: body.merchant && body.merchant !== 'Any' ? body.merchant : null,
        category: body.category?.trim() || null,
        maxPrice: body.maxPrice ?? null,
        minDiscount: body.minDiscount ?? null,
      },
      searchCandidates,
      validProductCandidates,
      rejectedCandidates,
      rawResults: searchResult.results,
      functionName: 'ai-deal-finder',
      provider: 'direct-url',
      searchStatus: 'Direct URL mode',
      searchQuery: cleanedSelectedSourceUrl,
      queryAttempts: [],
      requestPayload: {
        query: null,
        url: cleanedSelectedSourceUrl,
        merchant: body.merchant ?? directSourceMerchant,
        category: body.category ?? directSourceCategory,
        maxPrice: body.maxPrice ?? null,
        minDiscount: body.minDiscount ?? null,
      },
      responseMeta: {
        responseStatus: extractionDebug?.responseStatus ?? 200,
        rawResultCount: 0,
        filteredResultCount: 0,
      },
      resultQuality,
      partialData,
      enrichmentError,
      extractionStatus,
      extractionDebug,
      completionPercent,
      missingGroups,
      sourceAssets: {
        websiteUrl: normalizedDeal.websiteUrl ?? null,
        productUrl: normalizedDeal.productUrl ?? null,
        imageUrl: normalizedDeal.imageUrl ?? null,
      },
      searchStats: {
        totalResults: 0,
        validProductPages: 0,
        rejectedNonProductPages: 0,
        selectedSource: selectedSourceUrl || null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to import product data.';
    console.error('[LiveDrop][ai-deal-finder] Failure', {
      step: currentStep,
      error,
    });
    return errorResponse(500, message, `The Edge Function failed during ${currentStep}.`, currentStep);
  }
});
