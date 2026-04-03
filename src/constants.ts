import { Deal, UserLocation } from './types';

// Neutral fallback only. Never treat this as a real user location.
export const DEFAULT_LOCATION: UserLocation = {
  lat: 0,
  lng: 0,
};

export const CATEGORY_OPTIONS = [
  'All',
  'Fast Food',
  'Coffee',
  'Fitness',
  'Pet',
  'Home'
] as const;

export const ONLINE_CATEGORY_OPTIONS = [
  'All',
  'Tech',
  'Fashion',
  'Gaming',
  'Digital',
  'Home',
  'Food',
] as const;
