export const DEAL_STATUS_FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'new-deals', label: 'New Deals' },
  { id: 'popular', label: 'Popular' },
  { id: 'best-deals', label: 'Best Deals' },
  { id: 'leaving-soon', label: 'Leaving Soon' },
] as const;

export type DealStatusFilterId = (typeof DEAL_STATUS_FILTER_OPTIONS)[number]['id'];
export type DealStatusTagId = Exclude<DealStatusFilterId, 'all'>;

const DEAL_STATUS_TAG_SET = new Set<DealStatusTagId>([
  'new-deals',
  'popular',
  'best-deals',
  'leaving-soon',
]);

const DEAL_STATUS_TAG_ALIASES: Record<string, DealStatusTagId> = {
  new: 'new-deals',
  newdeal: 'new-deals',
  newdeals: 'new-deals',
  'new-deal': 'new-deals',
  'new-deals': 'new-deals',
  fresh: 'new-deals',
  latest: 'new-deals',
  popular: 'popular',
  hot: 'popular',
  trending: 'popular',
  best: 'best-deals',
  bestdeal: 'best-deals',
  bestdeals: 'best-deals',
  'best-deal': 'best-deals',
  'best-deals': 'best-deals',
  leavingsoon: 'leaving-soon',
  'leaving-soon': 'leaving-soon',
  leaving: 'leaving-soon',
  ending: 'leaving-soon',
  endingsoon: 'leaving-soon',
  urgent: 'leaving-soon',
  timesensitive: 'leaving-soon',
};

const normalizeTagToken = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export const normalizeDealStatusTag = (value: unknown): DealStatusTagId | null => {
  if (typeof value !== 'string') return null;
  const normalized = normalizeTagToken(value.trim());
  if (!normalized) return null;
  if (DEAL_STATUS_TAG_SET.has(normalized as DealStatusTagId)) {
    return normalized as DealStatusTagId;
  }

  const aliasMatch = DEAL_STATUS_TAG_ALIASES[normalized];
  return aliasMatch ?? null;
};

export const sanitizeDealStatusTags = (value: unknown): DealStatusTagId[] => {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n|]/g)
      : [];

  const normalized = rawValues
    .map((entry) => normalizeDealStatusTag(entry))
    .filter((entry): entry is DealStatusTagId => Boolean(entry));

  return Array.from(new Set(normalized));
};

export const getDealStatusFilterLabel = (filterId: DealStatusFilterId) =>
  DEAL_STATUS_FILTER_OPTIONS.find((entry) => entry.id === filterId)?.label ?? 'All';
