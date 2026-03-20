export interface Deal {
  id: string;
  businessName: string;
  title: string;
  description: string;
  offerText: string;
  distance: string; // This will now be a label, but we'll compute actual distance
  lat: number;
  lng: number;
  createdAt: number;
  expiresAt: number;
  maxClaims: number;
  currentClaims: number;
  category?: string;
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
  claimCode: string;
  claimedAt: number;
  expiresAt: number;
  status: 'active' | 'redeemed' | 'expired';
}

export type View = 'live-deals' | 'my-claims' | 'business-portal';
