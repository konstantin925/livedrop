export interface Deal {
  id: string;
  businessType?: 'local' | 'online';
  businessName: string;
  logoUrl?: string;
  imageUrl?: string;
  title: string;
  description: string;
  offerText: string;
  websiteUrl?: string;
  productUrl?: string;
  hasTimer?: boolean;
  distance: string; // This will now be a label, but we'll compute actual distance
  lat: number;
  lng: number;
  createdAt: number;
  expiresAt: number;
  maxClaims: number;
  currentClaims: number;
  claimCount: number;
  category: string;
}

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface Claim {
  id: string;
  dealId: string;
  dealTitle: string;
  businessName: string;
  logoUrl?: string;
  category: string;
  claimCode: string;
  claimedAt: number;
  expiresAt: number;
  status: 'active' | 'redeemed' | 'expired';
}

export interface CatalogCoupon {
  id: string;
  dealId: string;
  businessName: string;
  logoUrl?: string;
  title: string;
  description: string;
  category: string;
  offerText: string;
  originalDiscount: number | null;
  currentDiscount: number | null;
  savedAt: number;
  lastDiscountUpdateAt: number;
  lastViewedDiscount: number | null;
  expiresAt?: number;
  status: 'active' | 'redeemed' | 'expired';
}

export interface AppNotification {
  id: string;
  message: string;
  type: 'new_deal' | 'ending_soon' | 'catalog_drop';
  timestamp: number;
  read: boolean;
  dealId?: string;
  couponId?: string;
}

export type UserRole = 'customer' | 'business';
export type SubscriptionStatus = 'inactive' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete';

export interface UserProfileState {
  role: UserRole;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export type View = 'live-deals' | 'my-claims' | 'catalog' | 'business-portal';
