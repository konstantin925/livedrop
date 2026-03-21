import { AppNotification, CatalogCoupon, Claim, UserRole } from '../types';

export interface CloudAppState {
  claims: Claim[];
  catalog_coupons: CatalogCoupon[];
  notifications: AppNotification[];
  preferences: {
    radius?: number;
    selectedCategory?: string;
    selectedFeedFilter?: 'all' | 'trending' | 'ending-soon' | 'just-dropped';
    role?: UserRole;
  };
}

export const emptyCloudAppState: CloudAppState = {
  claims: [],
  catalog_coupons: [],
  notifications: [],
  preferences: {},
};

export function mergeById<T extends { id: string }>(localItems: T[], remoteItems: T[]): T[] {
  const merged = new Map<string, T>();

  for (const item of remoteItems) {
    merged.set(item.id, item);
  }

  for (const item of localItems) {
    if (!merged.has(item.id)) {
      merged.set(item.id, item);
    }
  }

  return Array.from(merged.values());
}

export function mergeCloudState(localState: CloudAppState, remoteState: CloudAppState | null): CloudAppState {
  if (!remoteState) return localState;

  return {
    claims: mergeById(localState.claims, remoteState.claims ?? []),
    catalog_coupons: mergeById(localState.catalog_coupons, remoteState.catalog_coupons ?? []),
    notifications: mergeById(localState.notifications, remoteState.notifications ?? []),
    preferences: {
      ...localState.preferences,
      ...remoteState.preferences,
    },
  };
}
