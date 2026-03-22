import { Deal } from '../types';

export const MOCK_DEAL_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
export const MOCK_DEAL_WINDOW_MS = 10 * 60 * 60 * 1000;
export const MOCK_DEAL_BATCH_SIZE = 5;
export const MOCK_DEAL_MAX_PER_WINDOW = 50;

const MOCK_DEAL_ID_PREFIX = 'mock-online-';
const BASE_SEEDED_ONLINE_ID_PREFIX = 'online-seed-';

export type MockDealPipelineStatus = 'active' | 'cap-reached' | 'no-new-deals';

export type MockDealPipelineSnapshot = {
  deals: Deal[];
  status: MockDealPipelineStatus;
  totalPublished: number;
  publishedBatches: number;
  maxBatchesPerWindow: number;
  nextRefreshAt: number;
  windowStartedAt: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const sortDealsNewestFirst = (deals: Deal[]) =>
  [...deals].sort((left, right) => {
    const leftCreated = Number.isFinite(left.createdAt) ? left.createdAt : 0;
    const rightCreated = Number.isFinite(right.createdAt) ? right.createdAt : 0;
    return rightCreated - leftCreated;
  });

const getWindowStart = (timestamp: number) =>
  Math.floor(timestamp / MOCK_DEAL_WINDOW_MS) * MOCK_DEAL_WINDOW_MS;

const getPoolDealDurationMs = (deal: Deal) => {
  const duration = deal.expiresAt - deal.createdAt;
  if (!Number.isFinite(duration) || duration <= 0) {
    return 2 * 60 * 60 * 1000;
  }

  return clamp(duration, 45 * 60 * 1000, 3 * 60 * 60 * 1000);
};

const rotatePool = (deals: Deal[], offset: number) => {
  if (deals.length === 0) return [];

  const normalizedOffset = ((offset % deals.length) + deals.length) % deals.length;
  return [...deals.slice(normalizedOffset), ...deals.slice(0, normalizedOffset)];
};

const buildMockDealFromSeed = (sourceDeal: Deal, batchIndex: number, itemIndex: number, windowIndex: number, slotStartedAt: number): Deal => {
  const durationMs = getPoolDealDurationMs(sourceDeal);
  const durationPadding = ((batchIndex + itemIndex + windowIndex) % 4) * 5 * 60 * 1000;
  const expiresAt = slotStartedAt + durationMs + durationPadding;
  const currentClaims = Math.max(
    0,
    Math.min(
      sourceDeal.maxClaims ?? 999,
      Math.round((sourceDeal.claimCount ?? sourceDeal.currentClaims ?? 0) * 0.35) + batchIndex * 6 + itemIndex * 3,
    ),
  );

  return {
    ...sourceDeal,
    id: `${MOCK_DEAL_ID_PREFIX}${windowIndex}-${batchIndex}-${itemIndex}-${sourceDeal.id}`,
    createdAt: slotStartedAt,
    expiresAt,
    currentClaims,
    claimCount: currentClaims,
    maxClaims: sourceDeal.maxClaims ?? 999,
    status: expiresAt > Date.now() ? 'active' : 'expired',
    featured: batchIndex === 0 ? true : sourceDeal.featured,
    adminTag: batchIndex <= 1 ? 'trending' : sourceDeal.adminTag ?? null,
  };
};

export const isMockRotatedDealId = (dealId: string) => dealId.startsWith(MOCK_DEAL_ID_PREFIX);

export const isManagedMockOnlineDeal = (deal: Deal) =>
  deal.businessType === 'online'
  && (isMockRotatedDealId(deal.id) || deal.id.startsWith(BASE_SEEDED_ONLINE_ID_PREFIX));

export const buildMockOnlineDealPipeline = (seedDeals: Deal[], now = Date.now()): MockDealPipelineSnapshot => {
  const onlineSeedDeals = sortDealsNewestFirst(
    seedDeals.filter((deal) => deal.businessType === 'online'),
  );

  if (onlineSeedDeals.length === 0) {
    const windowStartedAt = getWindowStart(now);
    return {
      deals: [],
      status: 'no-new-deals',
      totalPublished: 0,
      publishedBatches: 0,
      maxBatchesPerWindow: 0,
      nextRefreshAt: windowStartedAt + MOCK_DEAL_REFRESH_INTERVAL_MS,
      windowStartedAt,
    };
  }

  const windowStartedAt = getWindowStart(now);
  const windowIndex = Math.floor(windowStartedAt / MOCK_DEAL_WINDOW_MS);
  const refreshAttempts = Math.floor((now - windowStartedAt) / MOCK_DEAL_REFRESH_INTERVAL_MS) + 1;
  const maxBatchesPerWindow = Math.floor(
    Math.min(MOCK_DEAL_MAX_PER_WINDOW, onlineSeedDeals.length) / MOCK_DEAL_BATCH_SIZE,
  );
  const publishedBatches = Math.min(refreshAttempts, maxBatchesPerWindow);
  const nextRefreshAt = windowStartedAt + refreshAttempts * MOCK_DEAL_REFRESH_INTERVAL_MS;

  if (maxBatchesPerWindow === 0 || publishedBatches === 0) {
    return {
      deals: [],
      status: 'no-new-deals',
      totalPublished: 0,
      publishedBatches: 0,
      maxBatchesPerWindow,
      nextRefreshAt,
      windowStartedAt,
    };
  }

  const rotationOffset = (windowIndex * maxBatchesPerWindow * MOCK_DEAL_BATCH_SIZE) % onlineSeedDeals.length;
  const rotatedPool = rotatePool(onlineSeedDeals, rotationOffset);
  const deals: Deal[] = [];

  for (let batchIndex = 0; batchIndex < publishedBatches; batchIndex += 1) {
    const slotStartedAt = windowStartedAt + batchIndex * MOCK_DEAL_REFRESH_INTERVAL_MS;

    for (let itemIndex = 0; itemIndex < MOCK_DEAL_BATCH_SIZE; itemIndex += 1) {
      const sourceDeal = rotatedPool[batchIndex * MOCK_DEAL_BATCH_SIZE + itemIndex];
      if (!sourceDeal) break;

      deals.push(buildMockDealFromSeed(sourceDeal, batchIndex, itemIndex, windowIndex, slotStartedAt));
    }
  }

  const totalPublished = deals.length;
  const status: MockDealPipelineStatus = totalPublished >= MOCK_DEAL_MAX_PER_WINDOW
    ? 'cap-reached'
    : publishedBatches >= maxBatchesPerWindow
      ? 'no-new-deals'
      : 'active';

  return {
    deals: sortDealsNewestFirst(deals),
    status,
    totalPublished,
    publishedBatches,
    maxBatchesPerWindow,
    nextRefreshAt,
    windowStartedAt,
  };
};

export const mergeDealsWithMockOnlinePipeline = (existingDeals: Deal[], seedDeals: Deal[], now = Date.now()) => {
  const pipeline = buildMockOnlineDealPipeline(seedDeals, now);
  const mergedDeals = new Map<string, Deal>();

  pipeline.deals.forEach((deal) => {
    mergedDeals.set(deal.id, deal);
  });

  existingDeals
    .filter((deal) => !isManagedMockOnlineDeal(deal))
    .forEach((deal) => {
      mergedDeals.set(deal.id, deal);
    });

  return {
    deals: sortDealsNewestFirst([...mergedDeals.values()]),
    pipeline,
  };
};
