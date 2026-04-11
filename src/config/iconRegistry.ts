import { DEAL_ICON_MANIFEST, type CanonicalDealIconName } from './dealIcons';

type DealIconAssetExtension = 'webp' | 'png';

type DealIconAssetEntry = {
  iconName: CanonicalDealIconName;
  webp?: string;
  png?: string;
  all: string[];
  primary: string;
};

const CANONICAL_ICON_SET = new Set<string>(DEAL_ICON_MANIFEST as readonly string[]);

const iconModules = import.meta.glob('../assets/category-icons/*.{webp,png}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const mutableRegistry: Partial<Record<CanonicalDealIconName, { webp?: string; png?: string }>> = {};

Object.entries(iconModules).forEach(([modulePath, url]) => {
  const match = modulePath.match(/\/([^/]+)\.(webp|png)$/i);
  if (!match) return;

  const stem = match[1].toLowerCase();
  if (!CANONICAL_ICON_SET.has(stem)) return;

  const extension = match[2].toLowerCase() as DealIconAssetExtension;
  const iconName = stem as CanonicalDealIconName;
  const current = mutableRegistry[iconName] ?? {};

  mutableRegistry[iconName] = {
    ...current,
    [extension]: url,
  };
});

const iconRegistry = DEAL_ICON_MANIFEST.reduce((acc, iconName) => {
  const entry = mutableRegistry[iconName] ?? {};
  const all = [entry.webp, entry.png].filter(Boolean) as string[];

  acc[iconName] = {
    iconName,
    webp: entry.webp,
    png: entry.png,
    all,
    primary: entry.webp || entry.png || '',
  };

  return acc;
}, {} as Record<CanonicalDealIconName, DealIconAssetEntry>);

export const DEAL_ICON_REGISTRY = iconRegistry;

export const getDealIconRegistryEntry = (iconName?: string | null) => {
  if (!iconName) return null;
  const key = iconName as CanonicalDealIconName;
  return DEAL_ICON_REGISTRY[key] ?? null;
};

export const getDealIconRegistryCandidates = (iconName?: string | null) =>
  getDealIconRegistryEntry(iconName)?.all ?? [];

export const getDealIconRegistryAsset = (
  iconName?: string | null,
  extension: DealIconAssetExtension = 'png',
) => {
  const entry = getDealIconRegistryEntry(iconName);
  if (!entry) return '';
  return extension === 'webp' ? (entry.webp || '') : (entry.png || '');
};

export const hasDealIconRegistryAsset = (iconName?: string | null) =>
  getDealIconRegistryCandidates(iconName).length > 0;

