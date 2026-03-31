/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { Layout } from './components/Layout';
import { DealCard } from './components/DealCard';
import { ClaimModal } from './components/ClaimModal';
import { CreateDealForm } from './components/CreateDealForm';
import { Deal, Claim, View, UserLocation, CatalogCoupon, AppNotification, UserRole, SubscriptionStatus } from './types';
import { CATEGORY_OPTIONS, DEFAULT_LOCATION, ONLINE_CATEGORY_OPTIONS } from './constants';
import { Timer } from './components/Timer';
import { calculateDistance, formatDistance } from './utils/distance';
import { generateSeededDeals, generateSeededOnlineDeals } from './utils/seed';
import { formatDateTime } from './utils/time';
import { copyTextToClipboard, ClipboardCopyResult } from './utils/clipboard';
import {
  getCategoryIconName,
  getCategoryLabel,
  getDefaultCategoryForMode,
  normalizeCategoryValue,
  normalizeSubcategoryValue,
} from './utils/categories';
import { mergeDealsWithMockOnlinePipeline, MOCK_DEAL_REFRESH_INTERVAL_MS } from './utils/dealPipeline';
import { canSaveDealToCatalog, createCatalogCouponFromDeal, refreshCatalogCoupons } from './utils/catalog';
import { CompanyLogo } from './components/CompanyLogo';
import { ToastStack } from './components/ToastStack';
import { AuthModal } from './components/AuthModal';
import { BusinessPaywall } from './components/BusinessPaywall';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { DealEngagementAction, DealEngagementBar } from './components/DealEngagementBar';
import { DealArtwork } from './components/DealArtwork';
import { getAuthRedirectUrl, hasSupabaseAnonKey, hasSupabaseConfig, resolvedSupabaseUrl, supabase, supabaseConfigIssue, supabaseEdgeClient } from './lib/supabase';
import { emptyCloudAppState, mergeCloudState } from './utils/cloudState';
import { AppIcon } from './components/AppIcon';
import brandBoltLogo from './assets/logo-bolt.svg';
import brandBoltLogo3d from './assets/bolt-3d.png';
import brandBoltLogo3dActive from './assets/bolt-3d-active.png';

const DEALS_STORAGE_KEY = 'livedrop_deals';
const CLAIMS_STORAGE_KEY = 'livedrop_claims';
const CATALOG_STORAGE_KEY = 'livedrop_catalog';
const NOTIFICATIONS_STORAGE_KEY = 'livedrop_notifications';
const ROLE_STORAGE_KEY = 'livedrop_user_role';
const HIDDEN_DEALS_STORAGE_KEY = 'livedrop_hidden_deals';
const RADIUS_OPTIONS = [1, 3, 5, 10, 25];
const LOCAL_ADMIN_MODE = false;
const ADMIN_SESSION_STORAGE_KEY = 'livedrop_admin_session';
const ADMIN_EMAIL_STORAGE_KEY = 'livedrop_admin_email';
const ADMIN_FLAG_STORAGE_KEY = 'livedrop_is_admin';
const APPROVED_ADMIN_EMAIL = 'konstantin.perekipchenko@gmail.com';
const APPROVED_ADMIN_PASSWORD = 'konstantin';

const USER_PROFILE_TABLE = 'profiles';
const USER_STATE_TABLE = 'user_app_state';
const DEALS_TABLE = 'deals';
const DEALS_SCHEMA = 'public';
const BUSINESS_PLAN_ID = 'business_monthly';
const AI_DEAL_FINDER_FUNCTION = 'ai-deal-finder';
const hashStringToUnit = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 1000;
};

const extractPriceDropPercent = (value: string) => {
  const priceDropMatch = value.match(/\$?\s*(\d{1,4}(?:,\d{3})?(?:\.\d{1,2})?)\s*(?:->|→|to)\s*\$?\s*(\d{1,4}(?:,\d{3})?(?:\.\d{1,2})?)/i);
  if (!priceDropMatch) return null;

  const beforePrice = Number(priceDropMatch[1].replace(/,/g, ''));
  const afterPrice = Number(priceDropMatch[2].replace(/,/g, ''));
  if (!Number.isFinite(beforePrice) || !Number.isFinite(afterPrice) || beforePrice <= 0 || afterPrice >= beforePrice) {
    return null;
  }

  return Math.min(100, Math.max(0, Math.round(((beforePrice - afterPrice) / beforePrice) * 100)));
};

const getDropModeDiscountScore = (deal: Deal) => {
  if (typeof deal.discountPercent === 'number' && Number.isFinite(deal.discountPercent)) {
    return Math.max(0, deal.discountPercent);
  }

  const sourceSignal = [deal.offerText, deal.title, deal.description]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');

  const parsedPriceDropPercent = extractPriceDropPercent(sourceSignal);
  if (parsedPriceDropPercent !== null) {
    return parsedPriceDropPercent;
  }

  const offerSignal = sourceSignal.toUpperCase();

  const percentMatch = offerSignal.match(/(\d{1,3})\s*%/);
  if (percentMatch) {
    return Math.min(100, Math.max(0, Number(percentMatch[1])));
  }

  if (offerSignal.includes('FREE')) return 58;
  if (offerSignal.includes('FLASH')) return 42;
  if (offerSignal.includes('BUNDLE')) return 36;
  if (offerSignal.includes('LIMITED')) return 28;

  return 16;
};

const getDropModeUrgencyScore = (deal: Deal, now: number) => {
  if (deal.hasTimer === false) return 8;

  const minutesLeft = Math.max(1, Math.round((deal.expiresAt - now) / 60000));
  if (minutesLeft <= 30) return 48;
  if (minutesLeft <= 60) return 38;
  if (minutesLeft <= 120) return 30;
  if (minutesLeft <= 240) return 20;
  return 10;
};

const getDropModePriorityScore = (deal: Deal, seed: number, now: number) => {
  const discountScore = getDropModeDiscountScore(deal);
  const urgencyScore = getDropModeUrgencyScore(deal, now);
  const popularityScore = Math.min(16, Math.round(((deal.claimCount ?? deal.currentClaims ?? 0) / 20)));
  const freshnessScore = Math.max(0, 12 - Math.floor((now - deal.createdAt) / (35 * 60 * 1000)));
  const featuredScore = deal.featured || deal.adminTag === 'featured' ? 12 : 0;
  const randomnessScore = Math.round(hashStringToUnit(`${seed}:${deal.id}`) * 14);

  return discountScore * 1.7 + urgencyScore + popularityScore + freshnessScore + featuredScore + randomnessScore;
};

const isDropModeEligible = (deal: Deal) => {
  if (deal.hasTimer === false) return false;

  const sourceSignal = [deal.offerText, deal.title, deal.description]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toUpperCase();

  return (
    typeof deal.discountPercent === 'number'
    || /(\d{1,3})\s*%/.test(sourceSignal)
    || /\$?\s*(\d{1,4}(?:,\d{3})?(?:\.\d{1,2})?)\s*(?:->|→|to)\s*\$?\s*(\d{1,4}(?:,\d{3})?(?:\.\d{1,2})?)/i.test(sourceSignal)
    || sourceSignal.includes('FREE')
    || sourceSignal.includes('FLASH')
    || sourceSignal.includes('LIMITED')
    || sourceSignal.includes('DROP')
  );
};

const BULK_IMPORT_SAMPLE = JSON.stringify(
  [
    {
      businessName: 'Amazon Fire TV',
      title: 'Amazon Fire TV Stick 4K Plus (Newest Model) with AI-Powered Fire TV Search and Wi-Fi 6',
      description: 'Streaming stick deal with 4K support, AI-powered Fire TV search, and faster Wi-Fi 6 playback.',
      category: 'Tech',
      offerText: '$49.99 -> $29.99',
      originalPrice: 49.99,
      discountPercent: 40,
      productUrl: 'https://www.amazon.com/dp/B0F7Z4QZTT',
      affiliateUrl: 'https://www.amazon.com/dp/B0F7Z4QZTT',
      websiteUrl: 'https://www.amazon.com',
      durationMinutes: 140,
      claimCount: 126,
      maxClaims: 999,
      isOnline: true,
    },
    {
      businessName: 'D-Link',
      title: 'D-Link Pro Series Compact Full HD Pan & Tilt Wi-Fi Camera',
      description: 'Compact indoor security camera with pan-and-tilt coverage, Full HD video, and smart home monitoring.',
      category: 'Home',
      offerText: '$79.99 -> $29.99',
      originalPrice: 79.99,
      discountPercent: 63,
      productUrl: 'https://www.amazon.com/dp/B00PS13QSO',
      affiliateUrl: 'https://www.amazon.com/dp/B00PS13QSO',
      websiteUrl: 'https://www.amazon.com',
      durationMinutes: 105,
      claimCount: 92,
      maxClaims: 999,
      isOnline: true,
    },
    {
      businessName: 'INNOCN',
      title: 'INNOCN 27\" Gaming Monitor 2K QHD 320Hz IPS (27G2T)',
      description: 'Fast-refresh QHD gaming monitor with up to 320Hz performance, 1ms response time, and IPS color.',
      category: 'Gaming',
      offerText: '$280.00 -> $169.98',
      originalPrice: 280,
      discountPercent: 39,
      productUrl: 'https://www.amazon.com/dp/B0FPFTPPYN',
      affiliateUrl: 'https://www.amazon.com/dp/B0FPFTPPYN',
      websiteUrl: 'https://www.amazon.com',
      durationMinutes: 135,
      claimCount: 64,
      maxClaims: 999,
      isOnline: true,
    },
    {
      businessName: 'Orgain',
      title: 'Orgain Organic Wonder Gut Fiber Supplement Powder, Strawberry Lemonade',
      description: 'Digestive fiber powder deal with a steep markdown and frequent coupon-style stacking on Amazon.',
      category: 'Home',
      offerText: '$29.99 -> $9.73',
      originalPrice: 29.99,
      discountPercent: 68,
      productUrl: 'https://www.amazon.com/dp/B0CXV56J4G',
      affiliateUrl: 'https://www.amazon.com/dp/B0CXV56J4G',
      websiteUrl: 'https://www.amazon.com',
      durationMinutes: 95,
      claimCount: 51,
      maxClaims: 999,
      isOnline: true,
    },
    {
      businessName: 'KK Lights',
      title: 'Cordless Table Lamp Rechargeable Gold, 2-Pack 5000mAh Battery Lamps',
      description: 'Rechargeable cordless lamp set with a gold finish and promo-style pricing for bedside or patio setups.',
      category: 'Home',
      offerText: 'PROMO PRICE ~ $14.99',
      productUrl: 'https://www.amazon.com/dp/B0DJYFJGQW',
      affiliateUrl: 'https://www.amazon.com/dp/B0DJYFJGQW',
      websiteUrl: 'https://www.amazon.com',
      durationMinutes: 120,
      claimCount: 38,
      maxClaims: 999,
      isOnline: true,
    },
  ],
  null,
  2,
);

const getNotificationMessage = (
  type: 'new_deal' | 'ending_soon' | 'catalog_drop',
  title?: string,
) => {
  if (type === 'new_deal') return `New deal nearby: ${title}`;
  if (type === 'ending_soon') return `Hurry! ${title} is ending soon`;
  return 'Your saved deal dropped in value';
};

const getNotificationIconName = (type: AppNotification['type']) => {
  if (type === 'new_deal') return 'live' as const;
  if (type === 'ending_soon') return 'ending' as const;
  return 'percent' as const;
};

const normalizeNotificationMessage = (message: string) =>
  message
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/\s+/g, ' ')
    .trim();

const getFeedFilterIconName = (filter: 'all' | 'trending' | 'ending-soon' | 'just-dropped') => {
  if (filter === 'trending') return 'trending' as const;
  if (filter === 'ending-soon') return 'ending' as const;
  if (filter === 'just-dropped') return 'dropped' as const;
  return 'deal' as const;
};

const getFeedTagIconName = (tag: 'Trending' | 'Ending Soon' | 'Just Dropped') => {
  if (tag === 'Trending') return 'trending' as const;
  if (tag === 'Ending Soon') return 'ending' as const;
  return 'dropped' as const;
};

const LOCAL_SUBCATEGORY_OPTIONS: Record<string, readonly string[]> = {
  'Fast Food': ['Burgers', 'Tacos', 'Sandwiches', 'Sweets'],
  Coffee: ['Hot Coffee', 'Iced Coffee', 'Espresso', 'Bakery'],
  Fitness: ['Gyms', 'Protein', 'Supplements', 'Activewear'],
  Pet: ['Grooming', 'Treats', 'Toys', 'Wellness'],
  Home: ['Cleaning', 'Books', 'Furniture', 'Services'],
};

const ONLINE_TECH_SUBCATEGORY_OPTIONS = [
  'All',
  'Phones',
  'Laptops',
  'Tablets',
  'Smartwatches',
  'Headphones',
  'Earbuds',
  'Speakers',
  'Gaming',
  'PC Accessories',
  'Keyboards',
  'Mice',
  'Monitors',
  'TVs',
  'Cameras',
  'Drones',
] as const;

const ONLINE_TECH_SUBCATEGORY_KEYWORDS: Record<string, string[]> = {
  Phones: ['phone', 'iphone', 'galaxy', 'pixel', 'smartphone', 'mobile'],
  Laptops: ['laptop', 'macbook', 'notebook', 'chromebook', 'ultrabook'],
  Tablets: ['tablet', 'ipad', 'fire hd', 'galaxy tab', 'surface go'],
  Smartwatches: ['watch', 'smartwatch', 'fitbit', 'galaxy watch', 'apple watch'],
  Headphones: ['headphone', 'over-ear', 'over ear', 'studio pro'],
  Earbuds: ['earbud', 'earbuds', 'in-ear', 'airpods'],
  Speakers: ['speaker', 'soundbar', 'audio system'],
  Gaming: ['gaming', 'ps5', 'xbox', 'switch', 'controller', 'console'],
  'PC Accessories': ['pc accessory', 'pc accessories', 'dock', 'hub', 'ssd enclosure'],
  Keyboards: ['keyboard', 'keychron', 'mechanical keyboard'],
  Mice: ['mouse', 'gaming mouse', 'trackball'],
  Monitors: ['monitor', 'display', 'screen'],
  TVs: ['tv', 'oled', 'qled', 'led tv', 'fire tv'],
  Cameras: ['camera', 'dslr', 'mirrorless', 'security camera', 'webcam'],
  Drones: ['drone', 'quadcopter'],
};

const ONLINE_HOME_SUBCATEGORY_OPTIONS = [
  'All',
  'Furniture',
  'Home Decor',
  'Kitchen',
  'Bedding',
  'Bath',
  'Storage',
  'Cleaning',
  'Appliances',
  'Smart Home',
  'Lighting',
  'Outdoor',
  'Patio',
] as const;

const ONLINE_HOME_SUBCATEGORY_KEYWORDS: Record<string, string[]> = {
  Furniture: ['sofa', 'couch', 'chair', 'table', 'desk', 'dresser', 'bed frame', 'furniture'],
  'Home Decor': ['decor', 'throw pillow', 'wall art', 'rug', 'vase', 'frame', 'decorative'],
  Kitchen: ['kitchen', 'cookware', 'pan', 'pot', 'knife', 'blender', 'food processor'],
  Bedding: ['bedding', 'comforter', 'duvet', 'sheet', 'pillowcase', 'bedspread', 'quilt'],
  Bath: ['bath', 'towel', 'shower', 'bathroom', 'bath mat'],
  Storage: ['storage', 'organizer', 'bin', 'basket', 'shelf', 'closet', 'drawer'],
  Cleaning: ['cleaning', 'vacuum', 'mop', 'broom', 'cleaner', 'detergent'],
  Appliances: ['appliance', 'microwave', 'toaster', 'air fryer', 'fridge', 'washer', 'dryer', 'dishwasher'],
  'Smart Home': ['smart home', 'smart plug', 'smart bulb', 'smart switch', 'homekit', 'google home', 'alexa'],
  Lighting: ['lamp', 'lighting', 'light', 'bulb', 'lantern'],
  Outdoor: ['outdoor', 'garden', 'lawn', 'grill', 'hose'],
  Patio: ['patio', 'outdoor furniture', 'umbrella', 'deck'],
};

const ONLINE_FASHION_SUBCATEGORY_OPTIONS = [
  'All',
  'Men’s Clothing',
  'Women’s Clothing',
  'Shoes',
  'Sneakers',
  'Boots',
  'Sandals',
  'Jackets',
  'Hoodies',
  'T-Shirts',
  'Jeans',
  'Dresses',
  'Activewear',
  'Loungewear',
  'Bags',
  'Wallets',
] as const;

const ONLINE_FASHION_SUBCATEGORY_KEYWORDS: Record<string, string[]> = {
  'Men’s Clothing': ['mens', 'men’s', 'men ', 'man ', 'male', 'menswear'],
  'Women’s Clothing': ['women', 'women’s', 'womens', 'lady', 'ladies', 'womenswear'],
  Shoes: ['shoe', 'shoes', 'footwear'],
  Sneakers: ['sneaker', 'sneakers', 'jordans', 'running shoe', 'trainer'],
  Boots: ['boot', 'boots'],
  Sandals: ['sandal', 'sandals', 'slides', 'flip flop'],
  Jackets: ['jacket', 'parka', 'coat', 'outerwear'],
  Hoodies: ['hoodie', 'hooded', 'pullover', 'sweatshirt'],
  'T-Shirts': ['t-shirt', 'tee', 'tees', 'graphic tee'],
  Jeans: ['jean', 'jeans', 'denim'],
  Dresses: ['dress', 'dresses', 'maxi', 'midi'],
  Activewear: ['activewear', 'athletic', 'training', 'performance', 'gym'],
  Loungewear: ['lounge', 'loungewear', 'pajama', 'pj', 'sweatpant'],
  Bags: ['bag', 'tote', 'backpack', 'handbag', 'crossbody'],
  Wallets: ['wallet', 'card holder'],
};

const LOCAL_SUBCATEGORY_KEYWORDS: Record<string, Record<string, string[]>> = {
  'Fast Food': {
    Burgers: ['burger', 'burgers', 'cheeseburger', 'fries', 'slider'],
    Tacos: ['taco', 'tacos', 'burrito', 'quesadilla', 'nacho'],
    Sandwiches: ['sandwich', 'sandwiches', 'sub', 'subs', 'wrap', 'panini'],
    Sweets: ['sweet', 'sweets', 'dessert', 'desserts', 'donut', 'donuts', 'cookie', 'cookies', 'ice cream', 'milkshake'],
  },
  Coffee: {
    'Hot Coffee': ['latte', 'lattes', 'coffee', 'drip', 'cappuccino', 'mocha', 'brew'],
    'Iced Coffee': ['iced', 'cold brew', 'coldbrew', 'frappe', 'frapp', 'frappuccino'],
    Espresso: ['espresso', 'americano', 'macchiato', 'cortado', 'shot'],
    Bakery: ['bagel', 'croissant', 'muffin', 'pastry', 'scone'],
  },
  Fitness: {
    Gyms: ['gym', 'yoga', 'studio', 'class', 'training', 'workout', 'mat space'],
    Protein: ['protein', 'smoothie', 'shake', 'recovery'],
    Supplements: ['supplement', 'supplements', 'creatine', 'pre-workout', 'vitamin', 'vitamins'],
    Activewear: ['leggings', 'shorts', 'sports bra', 'activewear', 'sneakers', 'joggers'],
  },
  Pet: {
    Grooming: ['groom', 'grooming', 'wash', 'spa'],
    Treats: ['treat', 'treats', 'snack', 'snacks', 'chew', 'chews'],
    Toys: ['toy', 'toys', 'ball', 'rope', 'fetch'],
    Wellness: ['vet', 'wellness', 'checkup', 'supplement', 'supplements'],
  },
  Home: {
    Cleaning: ['clean', 'cleaning', 'wash', 'shine', 'detail'],
    Books: ['book', 'books', 'bookstore', 'reading', 'novel'],
    Furniture: ['chair', 'table', 'sofa', 'couch', 'furniture'],
    Services: ['service', 'services', 'repair', 'install', 'delivery'],
  },
};

const getLocalDealSubcategory = (deal: Deal) => {
  const explicitSubcategory = normalizeSubcategoryValue(
    deal.localSubcategory,
    'local',
    deal.category,
  );
  if (explicitSubcategory) return explicitSubcategory;

  const matchers = LOCAL_SUBCATEGORY_KEYWORDS[deal.category];
  if (!matchers) return null;

  const sourceText = [deal.title, deal.description, deal.offerText, deal.businessName]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  for (const [subcategory, keywords] of Object.entries(matchers)) {
    if (keywords.some((keyword) => sourceText.includes(keyword))) {
      return subcategory;
    }
  }

  return null;
};

const getOnlineTechSubcategory = (deal: Deal) => {
  if (deal.category !== 'Tech') return null;

  const haystack = [deal.title, deal.description, deal.offerText, deal.businessName, deal.brand, deal.merchant]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  for (const [subcategory, keywords] of Object.entries(ONLINE_TECH_SUBCATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      return subcategory;
    }
  }

  return null;
};

const getOnlineHomeSubcategory = (deal: Deal) => {
  if (deal.category !== 'Home') return null;

  const haystack = [deal.title, deal.description, deal.offerText, deal.businessName, deal.brand, deal.merchant]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  for (const [subcategory, keywords] of Object.entries(ONLINE_HOME_SUBCATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      return subcategory;
    }
  }

  return null;
};

const getOnlineFashionSubcategory = (deal: Deal) => {
  if (deal.category !== 'Fashion') return null;

  const haystack = [deal.title, deal.description, deal.offerText, deal.businessName, deal.brand, deal.merchant]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  for (const [subcategory, keywords] of Object.entries(ONLINE_FASHION_SUBCATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      return subcategory;
    }
  }

  return null;
};

const getOnlineDealSubcategory = (deal: Deal) => {
  const explicitSubcategory = normalizeSubcategoryValue(
    deal.onlineSubcategory,
    'online',
    deal.category,
  );
  if (explicitSubcategory) return explicitSubcategory;

  if (deal.category === 'Tech') return getOnlineTechSubcategory(deal);
  if (deal.category === 'Home') return getOnlineHomeSubcategory(deal);
  if (deal.category === 'Fashion') return getOnlineFashionSubcategory(deal);
  return null;
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const formatPriceValue = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  if (value <= 0) {
    return 'FREE';
  }

  return currencyFormatter.format(value);
};

const chunkItems = <T,>(items: T[], chunkSize: number) => {
  if (chunkSize <= 0) return [items];

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
};

const extractPriceDropSavings = (value: string) => {
  const priceDropMatch = value.match(/\$?\s*(\d{1,4}(?:,\d{3})?(?:\.\d{1,2})?)\s*(?:->|â†’|to)\s*\$?\s*(\d{1,4}(?:,\d{3})?(?:\.\d{1,2})?)/i);
  if (!priceDropMatch) return null;

  const beforePrice = Number(priceDropMatch[1].replace(/,/g, ''));
  const afterPrice = Number(priceDropMatch[2].replace(/,/g, ''));
  if (!Number.isFinite(beforePrice) || !Number.isFinite(afterPrice) || afterPrice >= beforePrice) {
    return null;
  }

  return beforePrice - afterPrice;
};

const getDealSavingsValue = (deal: Deal) => {
  if (typeof deal.originalPrice === 'number' && typeof deal.discountPercent === 'number') {
    return Math.max(0, deal.originalPrice * (deal.discountPercent / 100));
  }

  const sourceSignal = [deal.offerText, deal.title, deal.description]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');

  return extractPriceDropSavings(sourceSignal) ?? 0;
};

const extractPricePair = (value: string) => {
  const priceDropMatch = value.match(/\$?\s*(\d{1,4}(?:,\d{3})?(?:\.\d{1,2})?)\s*(?:->|\u2192|Ã¢â€ â€™|to)\s*\$?\s*(\d{1,4}(?:,\d{3})?(?:\.\d{1,2})?)/i);
  if (!priceDropMatch) return null;

  const originalPrice = Number(priceDropMatch[1].replace(/,/g, ''));
  const currentPrice = Number(priceDropMatch[2].replace(/,/g, ''));
  if (!Number.isFinite(originalPrice) || !Number.isFinite(currentPrice)) {
    return null;
  }

  return { originalPrice, currentPrice };
};

const extractStandalonePrice = (value: string) => {
  const priceMatch = value.match(/\$\s*(\d{1,4}(?:,\d{3})?(?:\.\d{1,2})?)/);
  if (!priceMatch) return null;

  const parsedValue = Number(priceMatch[1].replace(/,/g, ''));
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const extractPercentValue = (value: string) => {
  const percentMatch = value.match(/(\d{1,3})\s*%/i);
  if (!percentMatch) return null;

  const parsedValue = Number(percentMatch[1]);
  return Number.isFinite(parsedValue) ? Math.min(100, Math.max(0, parsedValue)) : null;
};

const getDealPriceSnapshot = (deal: Deal) => {
  const sourceSignal = [deal.offerText, deal.title, deal.description]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');

  const pairedPrices = extractPricePair(sourceSignal);
  const fallbackDiscountPercent = extractPercentValue(sourceSignal);

  let currentPrice: number | null = pairedPrices?.currentPrice ?? null;
  let originalPrice: number | null =
    typeof deal.originalPrice === 'number' && Number.isFinite(deal.originalPrice)
      ? deal.originalPrice
      : pairedPrices?.originalPrice ?? null;
  let discountPercent: number | null =
    typeof deal.discountPercent === 'number' && Number.isFinite(deal.discountPercent)
      ? deal.discountPercent
      : fallbackDiscountPercent;

  if (currentPrice === null) {
    currentPrice = extractStandalonePrice(sourceSignal);
  }

  if (currentPrice === null && /\bFREE\b/i.test(sourceSignal)) {
    currentPrice = 0;
  }

  if (currentPrice === null && originalPrice !== null && discountPercent !== null && discountPercent > 0 && discountPercent < 100) {
    currentPrice = originalPrice * (1 - discountPercent / 100);
  }

  if (originalPrice === null && currentPrice !== null && discountPercent !== null && discountPercent > 0 && discountPercent < 100) {
    originalPrice = currentPrice / (1 - discountPercent / 100);
  }

  if (discountPercent === null && originalPrice !== null && currentPrice !== null && originalPrice > currentPrice && originalPrice > 0) {
    discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
  }

  return {
    currentPrice,
    originalPrice,
    discountPercent,
  };
};

const hasUsableCoordinates = (lat: unknown, lng: unknown) =>
  typeof lat === 'number' &&
  Number.isFinite(lat) &&
  typeof lng === 'number' &&
  Number.isFinite(lng) &&
  !(lat === 0 && lng === 0);

const hasUsableUserLocation = (location?: UserLocation | null) =>
  Boolean(location && hasUsableCoordinates(location.lat, location.lng));

const isStoredManagedLocalSeedDeal = (deal: Partial<Deal>) =>
  (deal.businessType ?? 'local') !== 'online' &&
  typeof deal.id === 'string' &&
  deal.id.startsWith('seed-');

const readStoredDeals = (): Deal[] => {
  try {
    const raw = localStorage.getItem(DEALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readStoredClaims = (): Claim[] => {
  try {
    const raw = localStorage.getItem(CLAIMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readStoredCatalog = (): CatalogCoupon[] => {
  try {
    const raw = localStorage.getItem(CATALOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readStoredNotifications = (): AppNotification[] => {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((notification) => ({
          ...notification,
          message: normalizeNotificationMessage(notification.message ?? ''),
        }))
      : [];
  } catch {
    return [];
  }
};

const readStoredRole = (): UserRole => {
  try {
    const raw = localStorage.getItem(ROLE_STORAGE_KEY);
    if (raw === 'business') return 'business';
    if (raw === 'customer') return LOCAL_ADMIN_MODE ? 'business' : 'customer';
    return LOCAL_ADMIN_MODE ? 'business' : 'customer';
  } catch {
    return LOCAL_ADMIN_MODE ? 'business' : 'customer';
  }
};

const readHiddenDealIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(HIDDEN_DEALS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))
      : new Set();
  } catch {
    return new Set();
  }
};

const getDistanceForDeal = (location: UserLocation, deal: Deal) =>
  calculateDistance(location.lat, location.lng, deal.lat, deal.lng);

const getRadiusForDeal = (location: UserLocation, deal: Deal) => {
  const distance =
    hasUsableUserLocation(location) && hasUsableCoordinates(deal.lat, deal.lng)
      ? getDistanceForDeal(location, deal)
      : parseDistanceLabel(deal.distance) ?? Number.POSITIVE_INFINITY;
  return RADIUS_OPTIONS.find(option => distance <= option) ?? RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1];
};

const parseDistanceLabel = (distanceLabel?: string | null): number | null => {
  const normalized = (typeof distanceLabel === 'string' ? distanceLabel : '').trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('<')) {
    const value = Number.parseFloat(normalized.replace(/[^0-9.]/g, ''));
    return Number.isFinite(value) ? value : 0.1;
  }

  const value = Number.parseFloat(normalized.replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) ? value : null;
};

const getEffectiveLocalDealDistance = (
  location: UserLocation,
  deal: Deal,
  allowCoordinateDistance: boolean,
): number => {
  const canUseCoordinateDistance =
    allowCoordinateDistance &&
    hasUsableUserLocation(location) &&
    hasUsableCoordinates(deal.lat, deal.lng);

  if (canUseCoordinateDistance) {
    return calculateDistance(location.lat, location.lng, deal.lat, deal.lng);
  }

  if (!allowCoordinateDistance) {
    const fallbackDistance = parseDistanceLabel(deal.distance);
    return fallbackDistance ?? Number.POSITIVE_INFINITY;
  }

  return Number.POSITIVE_INFINITY;
};

const EXCLUDED_ONLINE_DEAL_TITLES = new Set([
  'Laptop Stand Bundle Deal',
  'Creator Desk Essentials Sale',
]);

const isExcludedOnlineDeal = (deal: Deal) => {
  return deal.businessType === 'online' && EXCLUDED_ONLINE_DEAL_TITLES.has(deal.title);
};

const isManagedLocalSeedDeal = (deal: Deal) =>
  deal.businessType !== 'online' && deal.id.startsWith('seed-');

const MOCK_ONLINE_SOURCE_ID_PATTERN = /^mock-online-\d+-\d+-\d+-(.+)$/;

const extractMockOnlineSourceId = (dealId: string) => {
  const match = dealId.match(MOCK_ONLINE_SOURCE_ID_PATTERN);
  return match?.[1] ?? null;
};

const normalizeDealUrlForMatch = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return '';
  }
};

const normalizeDealIdentityText = (value?: string | null) =>
  (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

const isLikelySameOnlineDeal = (left: Deal, right: Deal) => {
  const leftSourceId = extractMockOnlineSourceId(left.id);
  const rightSourceId = extractMockOnlineSourceId(right.id);
  const leftCanonicalId = leftSourceId ?? left.id;
  const rightCanonicalId = rightSourceId ?? right.id;
  if (leftCanonicalId === rightCanonicalId) return true;

  const leftProductUrl = normalizeDealUrlForMatch(left.productUrl);
  const rightProductUrl = normalizeDealUrlForMatch(right.productUrl);
  if (leftProductUrl && rightProductUrl && leftProductUrl === rightProductUrl) return true;

  const leftAffiliateUrl = normalizeDealUrlForMatch(left.affiliateUrl);
  const rightAffiliateUrl = normalizeDealUrlForMatch(right.affiliateUrl);
  if (leftAffiliateUrl && rightAffiliateUrl && leftAffiliateUrl === rightAffiliateUrl) return true;

  const leftKey = `${normalizeDealIdentityText(left.businessName)}::${normalizeDealIdentityText(left.title)}`;
  const rightKey = `${normalizeDealIdentityText(right.businessName)}::${normalizeDealIdentityText(right.title)}`;
  return Boolean(leftKey && rightKey && leftKey === rightKey);
};

const hydrateSeededOnlineDealsWithOverrides = (existingDeals: Deal[]) => {
  const baseSeedDeals = generateSeededOnlineDeals();
  const overrideCandidates = existingDeals.filter(
    (deal) => deal.businessType === 'online' && !deal.id.startsWith('mock-online-'),
  );

  return baseSeedDeals.map((seedDeal) => {
    const override = overrideCandidates.find((candidate) => isLikelySameOnlineDeal(candidate, seedDeal));
    if (!override) return seedDeal;

    return {
      ...seedDeal,
      ...override,
      id: seedDeal.id,
      businessType: 'online' as const,
      createdAt: seedDeal.createdAt,
      expiresAt: seedDeal.expiresAt,
      currentClaims: seedDeal.currentClaims,
      claimCount: seedDeal.claimCount,
      maxClaims: seedDeal.maxClaims,
      status: seedDeal.status,
      hasTimer: seedDeal.hasTimer,
    };
  });
};

const syncSharedOnlineDeals = (existingDeals: Deal[]): Deal[] => {
  const seededOnlineDeals = hydrateSeededOnlineDealsWithOverrides(existingDeals);
  const synced = mergeDealsWithMockOnlinePipeline(existingDeals, seededOnlineDeals).deals;
  return synced.filter((deal) => !isExcludedOnlineDeal(deal));
};

const composeDealsWithLocationContext = (
  sourceDeals: Deal[],
  location: UserLocation,
  includeManagedLocalSeeds: boolean,
): Deal[] => {
  const syncedDeals = syncSharedOnlineDeals(sourceDeals).filter((deal) => !isManagedLocalSeedDeal(deal));

  if (!includeManagedLocalSeeds || !hasUsableUserLocation(location)) {
    return syncedDeals;
  }

  return [...generateSeededDeals(location), ...syncedDeals];
};

const deriveWebsiteOrigin = (value?: string | null) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
};

const EXTERNAL_ACTION_COOLDOWN_MS = 900;

const normalizeSafeExternalUrl = (value?: string | null) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
};

const getFirstSafeExternalUrl = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const normalizedUrl = normalizeSafeExternalUrl(value);
    if (normalizedUrl) {
      return normalizedUrl;
    }
  }

  return null;
};

const getDealPrimaryActionUrl = (deal: Deal) =>
  getFirstSafeExternalUrl(deal.affiliateUrl, deal.productUrl, deal.websiteUrl);

const getDealExternalUrl = (deal: Deal) => getDealPrimaryActionUrl(deal);

const getDealShareUrl = (deal: Deal) => {
  const externalUrl = getDealExternalUrl(deal);
  if (externalUrl) {
    return externalUrl;
  }

  const baseUrl = getAuthRedirectUrl().replace(/\/+$/, '');
  return `${baseUrl}/?deal=${encodeURIComponent(deal.id)}`;
};

const getDetailPricePrimaryLabel = (deal: Deal) => {
  const priceSnapshot = getDealPriceSnapshot(deal);
  return formatPriceValue(priceSnapshot.currentPrice) ?? 'Live Deal';
};

const getDetailOriginalPriceLabel = (deal: Deal) => {
  const priceSnapshot = getDealPriceSnapshot(deal);
  return formatPriceValue(priceSnapshot.originalPrice) ?? 'Store Price';
};

const getDetailDiscountLabel = (deal: Deal) => {
  const priceSnapshot = getDealPriceSnapshot(deal);
  if (priceSnapshot.discountPercent !== null) {
    return `${priceSnapshot.discountPercent}% OFF`;
  }

  return deal.offerText || 'Limited Offer';
};

const applyDealEngagement = (deal: Deal, action: DealEngagementAction): Deal => ({
  ...deal,
  likeCount: (deal.likeCount ?? 0) + (action === 'like' ? 1 : 0),
  dislikeCount: (deal.dislikeCount ?? 0) + (action === 'dislike' ? 1 : 0),
  shareCount: (deal.shareCount ?? 0) + (action === 'share' ? 1 : 0),
});

const normalizeRoutePath = (path: string) => {
  if (path === '/admin') return '/admin';
  if (path === '/dashboard') return '/dashboard';
  return '/';
};

const readAdminSessionEmail = () => {
  if (typeof window === 'undefined') return null;

  try {
    const isAdmin = window.localStorage.getItem(ADMIN_FLAG_STORAGE_KEY);
    if (isAdmin !== 'true') return null;

    const emailValue = window.localStorage.getItem(ADMIN_EMAIL_STORAGE_KEY);
    const rawValue = window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    const candidate = rawValue ?? emailValue;
    if (!candidate) return null;

    const normalizedValue = candidate.trim().toLowerCase();
    return normalizedValue || null;
  } catch (error) {
    console.warn('[LiveDrop] Failed to read admin session state', error);
    return null;
  }
};

type BulkImportDealInput = {
  businessName: string;
  title: string;
  description: string;
  category: string;
  subcategory?: string;
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
  sourceType?: 'keyword' | 'url';
  sourceQuery?: string;
  sourceProductUrl?: string;
  maxPriceMatched?: boolean;
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

type AIDealFinderStage = 'idle' | 'searching' | 'results-loaded' | 'result-selected' | 'coupon-generated';
type AIDealFinderRankLabel = 'Best Overall' | 'Best Budget' | 'Best Trusted' | 'Best Discount';

type AIDealFinderCandidate = {
  title: string;
  url: string;
  snippet: string;
  merchant: string;
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
  rankLabels?: AIDealFinderRankLabel[];
  extractionStatus?: 'Raw candidate' | 'Partial extraction' | 'Enriched';
};

type AIDealFinderValidationWarning = {
  field: string;
  severity: 'warning' | 'error';
  message: string;
};

type AIDealFinderValidationFieldState = {
  field: string;
  status: 'ready' | 'missing' | 'weak';
  confidence: 'high' | 'medium' | 'low' | 'missing';
  source: string | null;
  message: string;
};

type AIDealFinderValidationResult = {
  status: 'ready' | 'partial' | 'blocked';
  warnings: AIDealFinderValidationWarning[];
  missingRequiredFields: string[];
  weakFields: string[];
  fieldStates: AIDealFinderValidationFieldState[];
  completionPercent: number;
};

type AIDealFinderMappedForm = {
  payload: PortalAutofillPayload;
  fieldMappings: Array<{
    field: keyof PortalAutofillPayload;
    sourceField: string | null;
    value: string;
    note?: string;
  }>;
  draft: BulkImportDealInput;
};

type AIDealFinderResult = {
  rawResults?: Array<{
    title?: string;
    url?: string;
    content?: string;
    raw_content?: string;
    score?: number;
  }>;
  normalizedDeal: BulkImportDealInput;
  generatedJson: string;
  missingFields: string[];
  dealScore: number;
  summary?: string;
  resultQuality?: 'basic' | 'enriched';
  partialData?: boolean;
  enrichmentError?: string | null;
  completionPercent?: number;
  missingGroups?: {
    required?: string[];
    optional?: string[];
    filled?: string[];
  };
  sourceAssets?: {
    websiteUrl?: string | null;
    productUrl?: string | null;
    affiliateUrl?: string | null;
    imageUrl?: string | null;
  };
  extractionStatus?: string;
  extractionDebug?: {
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
  searchCandidates?: AIDealFinderCandidate[];
  validProductCandidates?: AIDealFinderCandidate[];
  rejectedCandidates?: AIDealFinderCandidate[];
  searchStats?: {
    totalResults: number;
    validProductPages: number;
    rejectedNonProductPages: number;
    selectedSource: string | null;
  };
  searchStatus?: 'Search not run' | 'Search running' | 'Search succeeded' | 'Search returned 0 results' | 'Search failed' | string;
  searchQuery?: string;
  requestPayload?: {
    query: string | null;
    url?: string | null;
    affiliateUrl?: string | null;
    merchant: string | null;
    category: string | null;
    maxPrice: number | null;
    minDiscount: number | null;
  };
  responseMeta?: {
    responseStatus: number;
    rawResultCount: number;
    filteredResultCount: number;
  };
  queryAttempts?: Array<{
    label: string;
    query: string;
    responseStatus: number;
    rawResultCount: number;
  }>;
  appliedFilters?: {
    merchant?: string | null;
    category?: string | null;
    maxPrice?: number | null;
    minDiscount?: number | null;
  };
  scanResult?: Record<string, unknown>;
  normalizedDigest?: Record<string, unknown>;
  validationResult?: AIDealFinderValidationResult;
  mappedForm?: AIDealFinderMappedForm;
  message?: string;
};

type AIDealFinderRuntimeState = {
  requestSent: boolean;
  responseReceived: boolean;
  actualQuery: string;
  currentAction: 'idle' | 'validating' | 'building query' | 'invoking edge function' | 'response received' | 'filtering results' | 'completed';
  lastError: string;
};

type PortalCoverageField = {
  key: string;
  label: string;
  value: string;
  filled: boolean;
};

type PortalAutofillPayload = {
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

type PortalAutofillStatus = {
  state: 'idle' | 'pending' | 'success' | 'failure';
  attempted: boolean;
  message: string;
  failureReason: string;
};

type PortalAutofillRequest = {
  id: number;
  payload: PortalAutofillPayload;
};

type AdminLogEntry = {
  id: string;
  level: 'info' | 'error';
  message: string;
  detail?: string;
  timestamp: number;
};

type AdminActivityStatus = 'success' | 'warning' | 'error';

type AdminActivityCard = {
  id: string;
  title: string;
  summary: string;
  timestamp: number;
  status: AdminActivityStatus;
  rawMessage: string;
  rawDetail?: string;
};

const normalizePortalFieldValue = (value: string | number | null | undefined) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
};

const buildPortalFieldCoverage = (portalState: Deal | null) => {
  const required: PortalCoverageField[] = [
    { key: 'businessName', label: 'Store Name', value: normalizePortalFieldValue(portalState?.businessName) },
    { key: 'title', label: 'Deal Title', value: normalizePortalFieldValue(portalState?.title) },
    { key: 'description', label: 'Description', value: normalizePortalFieldValue(portalState?.description) },
    { key: 'category', label: 'Category', value: normalizePortalFieldValue(portalState?.category) },
    { key: 'offerText', label: 'Deal / Discount Text', value: normalizePortalFieldValue(portalState?.offerText) },
  ].map((field) => ({
    ...field,
    filled: Boolean(field.value),
  }));

  const optional: PortalCoverageField[] = [
    { key: 'websiteUrl', label: 'Website URL', value: normalizePortalFieldValue(portalState?.websiteUrl) },
    { key: 'productUrl', label: 'Source Product URL', value: normalizePortalFieldValue(portalState?.productUrl) },
    { key: 'affiliateUrl', label: 'Affiliate / Outbound Link', value: normalizePortalFieldValue(portalState?.affiliateUrl) },
    { key: 'imageUrl', label: 'Upload Image', value: normalizePortalFieldValue(portalState?.imageUrl) },
  ].map((field) => ({
    ...field,
    filled: Boolean(field.value),
  }));

  const allFields = [...required, ...optional];
  const filled = allFields.filter((field) => field.filled);

  return {
    required,
    optional,
    filled,
    missingRequired: required.filter((field) => !field.filled),
    missingOptional: optional.filter((field) => !field.filled),
    completionPercent: allFields.length ? Math.round((filled.length / allFields.length) * 100) : 0,
  };
};

const resolveImportedLinkSet = (source: {
  websiteUrl?: string;
  sourceProductUrl?: string;
  productUrl?: string;
  productLink?: string;
  affiliateUrl?: string;
}) => {
  const productUrl = getFirstSafeExternalUrl(source.sourceProductUrl, source.productUrl, source.productLink);
  const affiliateUrl = normalizeSafeExternalUrl(source.affiliateUrl);
  const websiteUrl =
    deriveWebsiteOrigin(source.websiteUrl)
    ?? deriveWebsiteOrigin(productUrl)
    ?? deriveWebsiteOrigin(affiliateUrl)
    ?? '';

  return {
    productUrl: productUrl ?? '',
    affiliateUrl: affiliateUrl ?? '',
    websiteUrl,
  };
};

const PORTAL_FIELD_FALLBACK_SOURCES: Record<keyof PortalAutofillPayload, string[]> = {
  storeName: ['businessName', 'merchant', 'brand'],
  websiteUrl: ['websiteUrl'],
  productUrl: ['productUrl', 'productLink'],
  affiliateUrl: ['affiliateUrl'],
  imageUrl: ['imageUrl'],
  dealTitle: ['title'],
  description: ['summary', 'description'],
  category: ['category'],
  offerText: ['couponText', 'offerText'],
};

const ONLINE_CATEGORY_SUBCATEGORY_HINTS: Record<string, readonly string[]> = {
  Tech: ['Phones', 'Laptops', 'Tablets', 'Smartwatches', 'Headphones', 'Earbuds', 'Speakers', 'Gaming', 'PC Accessories', 'Keyboards', 'Mice', 'Monitors', 'TVs', 'Cameras', 'Drones'],
  Home: ['Furniture', 'Home Decor', 'Kitchen', 'Bedding', 'Bath', 'Storage', 'Cleaning', 'Appliances', 'Smart Home', 'Lighting', 'Outdoor', 'Patio'],
  Fashion: ['Men Clothing', 'Women Clothing', 'Shoes', 'Sneakers', 'Boots', 'Sandals', 'Jackets', 'Hoodies', 'T-Shirts', 'Jeans', 'Dresses', 'Activewear', 'Loungewear', 'Bags', 'Wallets'],
};

const ONLINE_SUBCATEGORY_KEYWORDS: Record<string, readonly string[]> = {
  Phones: ['phone', 'iphone', 'android', 'pixel', 'galaxy'],
  Laptops: ['laptop', 'notebook', 'macbook', 'chromebook'],
  Tablets: ['tablet', 'ipad', 'fire hd'],
  Smartwatches: ['smartwatch', 'apple watch', 'wearable'],
  Headphones: ['headphone', 'over-ear', 'noise cancelling'],
  Earbuds: ['earbud', 'airpods', 'buds'],
  Speakers: ['speaker', 'soundbar', 'bluetooth speaker'],
  Gaming: ['gaming', 'xbox', 'playstation', 'nintendo'],
  'PC Accessories': ['pc accessory', 'pc accessories'],
  Keyboards: ['keyboard', 'mechanical'],
  Mice: ['mouse', 'mice'],
  Monitors: ['monitor', 'display'],
  TVs: ['tv', 'television', 'oled', 'qled'],
  Cameras: ['camera', 'dslr', 'mirrorless'],
  Drones: ['drone', 'quadcopter'],
  Furniture: ['sofa', 'chair', 'table', 'desk', 'furniture'],
  'Home Decor': ['decor', 'wall art', 'vase', 'rug'],
  Kitchen: ['kitchen', 'cookware', 'knife', 'blender', 'air fryer'],
  Bedding: ['bedding', 'sheet', 'comforter', 'pillow'],
  Bath: ['bath', 'towel', 'shower'],
  Storage: ['storage', 'organizer', 'shelf', 'bin'],
  Cleaning: ['cleaning', 'vacuum', 'mop', 'detergent'],
  Appliances: ['appliance', 'microwave', 'fridge', 'dishwasher'],
  'Smart Home': ['smart home', 'smart plug', 'smart bulb', 'alexa'],
  Lighting: ['lamp', 'lighting', 'light bulb'],
  Outdoor: ['outdoor', 'garden', 'yard'],
  Patio: ['patio', 'deck', 'outdoor furniture'],
  'Men Clothing': ['men', 'mens'],
  'Women Clothing': ['women', 'womens'],
  Shoes: ['shoe', 'footwear'],
  Sneakers: ['sneaker', 'trainer'],
  Boots: ['boot'],
  Sandals: ['sandal'],
  Jackets: ['jacket', 'coat'],
  Hoodies: ['hoodie', 'sweatshirt'],
  'T-Shirts': ['t-shirt', 'tee shirt', 'tee'],
  Jeans: ['jean', 'denim'],
  Dresses: ['dress', 'gown'],
  Activewear: ['activewear', 'workout', 'gym wear', 'athletic'],
  Loungewear: ['loungewear', 'pajama', 'sleepwear'],
  Bags: ['bag', 'backpack', 'tote'],
  Wallets: ['wallet'],
};

const buildPortalAutofillPayload = (
  source:
    | {
        businessName?: string;
        storeName?: string;
        businessType?: Deal['businessType'];
        merchant?: string;
        brand?: string;
        websiteUrl?: string;
        sourceProductUrl?: string;
        productUrl?: string;
        productLink?: string;
        affiliateUrl?: string;
        imageUrl?: string;
        title?: string;
        dealTitle?: string;
        description?: string;
        summary?: string;
        category?: string;
        offerText?: string;
      }
    | null
    | undefined,
): PortalAutofillPayload => {
  const mode = source?.businessType === 'local' ? 'local' : 'online';
  const linkSet = resolveImportedLinkSet({
    websiteUrl: source?.websiteUrl,
    sourceProductUrl: source?.sourceProductUrl,
    productUrl: source?.productUrl,
    productLink: source?.productLink,
    affiliateUrl: source?.affiliateUrl,
  });

  return {
    storeName: normalizePortalFieldValue(source?.businessName ?? source?.storeName ?? source?.merchant ?? source?.brand),
    websiteUrl: normalizePortalFieldValue(linkSet.websiteUrl),
    productUrl: normalizePortalFieldValue(linkSet.productUrl),
    affiliateUrl: normalizePortalFieldValue(linkSet.affiliateUrl),
    imageUrl: normalizePortalFieldValue(source?.imageUrl),
    dealTitle: normalizePortalFieldValue(source?.title ?? source?.dealTitle),
    description: normalizePortalFieldValue(source?.description ?? source?.summary),
    category: normalizeCategoryValue(source?.category, mode, [
      source?.title ?? source?.dealTitle,
      source?.description ?? source?.summary,
      source?.businessName ?? source?.storeName,
      source?.merchant,
      source?.brand,
    ]),
    offerText: normalizePortalFieldValue(source?.offerText),
  };
};

const mapNormalizedDealToPortalFormFields = (normalizedDeal: BulkImportDealInput): PortalAutofillPayload =>
  buildPortalAutofillPayload(normalizedDeal);

const titleCaseFromSlug = (value: string) =>
  value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const deriveMerchantFromSourceUrl = (...urlCandidates: Array<string | null | undefined>) => {
  const safeUrl = getFirstSafeExternalUrl(...urlCandidates);
  if (!safeUrl) return '';

  try {
    const hostname = new URL(safeUrl).hostname.toLowerCase();
    const cleaned = hostname.replace(/^www\./, '').split('.').slice(0, -1).join(' ') || hostname.replace(/^www\./, '');
    return titleCaseFromSlug(cleaned);
  } catch {
    return '';
  }
};

const guessSubcategoryFromText = (category: string, textSignals: string[]) => {
  const candidateSubcategories = ONLINE_CATEGORY_SUBCATEGORY_HINTS[category];
  if (!candidateSubcategories?.length) return '';

  const haystack = textSignals.join(' ').toLowerCase();
  for (const subcategory of candidateSubcategories) {
    const keywordList = ONLINE_SUBCATEGORY_KEYWORDS[subcategory] ?? [subcategory.toLowerCase()];
    if (keywordList.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return subcategory;
    }
  }

  return '';
};

const buildOfferTextFallback = (deal: BulkImportDealInput) => {
  const existingOffer = trimDealTextValue(deal.offerText ?? deal.couponText);
  if (existingOffer) return existingOffer;

  if (typeof deal.discountPercent === 'number' && Number.isFinite(deal.discountPercent) && deal.discountPercent > 0) {
    return `${Math.round(deal.discountPercent)}% OFF`;
  }

  const currentPrice = deal.currentPrice ?? deal.price;
  if (typeof currentPrice === 'number' && Number.isFinite(currentPrice) && currentPrice >= 0) {
    return `Now $${currentPrice.toFixed(2)}`;
  }

  return DEAL_OFFER_FALLBACK;
};

const TEST_COUPON_AUTOFILL: PortalAutofillPayload = {
  storeName: 'Amazon',
  websiteUrl: 'https://www.amazon.com',
  productUrl: 'https://www.amazon.com/dp/test',
  affiliateUrl: 'https://amzn.to/test',
  imageUrl: '',
  dealTitle: 'Test Deal',
  description: 'Test description',
  category: 'Tech',
  offerText: 'Limited-time deal',
};

const REQUIRED_PORTAL_AUTOFILL_FIELDS: Array<keyof PortalAutofillPayload> = [
  'storeName',
  'websiteUrl',
  'productUrl',
  'imageUrl',
  'dealTitle',
  'description',
  'category',
  'offerText',
];

const buildFallbackMappedFieldMappings = (
  payload: PortalAutofillPayload,
  deal?: BulkImportDealInput | null,
): AIDealFinderMappedForm['fieldMappings'] =>
  (Object.entries(payload) as Array<[keyof PortalAutofillPayload, string]>).map(([field, value]) => {
    const sourceField = PORTAL_FIELD_FALLBACK_SOURCES[field].find((candidateField) => {
      const sourceValue = deal?.[candidateField as keyof BulkImportDealInput];
      return typeof sourceValue === 'string' ? sourceValue.trim().length > 0 : Boolean(sourceValue);
    }) ?? null;

    return {
      field,
      sourceField,
      value,
      note: value ? undefined : 'This field was left empty because no reliable source value was available.',
    };
  });

const normalizeImportedDealInput = (deal?: BulkImportDealInput | null): BulkImportDealInput | null => {
  if (!deal) return null;

  const businessType = deal.isOnline === false ? 'local' : 'online';
  const sourceUrlCandidate = getFirstSafeExternalUrl(
    deal.sourceProductUrl,
    deal.productUrl,
    deal.productLink,
    deal.sourceQuery,
  );
  const sourceWebsiteCandidate = deriveWebsiteOrigin(deal.websiteUrl) || deriveWebsiteOrigin(sourceUrlCandidate) || '';
  const merchantFromUrl = deriveMerchantFromSourceUrl(sourceWebsiteCandidate, sourceUrlCandidate);
  const linkSet = resolveImportedLinkSet({
    websiteUrl: sourceWebsiteCandidate || deal.websiteUrl,
    sourceProductUrl: sourceUrlCandidate || deal.sourceProductUrl,
    productUrl: sourceUrlCandidate || deal.productUrl,
    productLink: sourceUrlCandidate || deal.productLink,
    affiliateUrl: deal.affiliateUrl,
  });
  const businessName = trimDealTextWithFallback(
    deal.businessName ?? deal.merchant ?? deal.brand ?? merchantFromUrl,
    DEAL_BUSINESS_FALLBACK,
    DEAL_MAX_TEXT_LENGTH.businessName,
  );
  const title = trimDealTextWithFallback(deal.title, DEAL_TITLE_FALLBACK, DEAL_MAX_TEXT_LENGTH.title);
  const textSignals = [title, deal.description, deal.summary, businessName, deal.merchant, deal.brand, deal.category, deal.offerText].filter(Boolean) as string[];
  const inferredCategory = normalizeCategoryValue(deal.category, businessType, textSignals);
  const inferredSubcategory = guessSubcategoryFromText(inferredCategory, textSignals);
  const descriptionFallback = merchantFromUrl
    ? `Imported from ${merchantFromUrl}. Add product details before publishing.`
    : DEAL_DESCRIPTION_FALLBACK;
  const description = trimDealTextWithFallback(
    deal.description ?? deal.summary,
    descriptionFallback,
    DEAL_MAX_TEXT_LENGTH.description,
  );
  const offerText = trimDealTextWithFallback(buildOfferTextFallback(deal), DEAL_OFFER_FALLBACK, DEAL_MAX_TEXT_LENGTH.offerText);
  const primaryImageUrl = trimDealTextValue(deal.imageUrl)
    || (deal.galleryImages ?? []).map((image) => trimDealTextValue(image)).find(Boolean)
    || '';
  const safeTags = (deal.tags ?? [])
    .map((tag) => trimDealTextValue(tag))
    .filter(Boolean);
  if (inferredSubcategory && !safeTags.includes(inferredSubcategory)) {
    safeTags.push(inferredSubcategory);
  }

  return {
    ...deal,
    isOnline: businessType === 'online',
    businessName,
    merchant: trimDealTextValue(deal.merchant) || businessName,
    brand: trimDealTextValue(deal.brand) || undefined,
    title,
    description,
    summary: trimDealTextValue(deal.summary) || undefined,
    offerText,
    category: inferredCategory,
    subcategory: trimDealTextValue(deal.subcategory) || inferredSubcategory || undefined,
    tags: safeTags.length ? safeTags : undefined,
    websiteUrl: linkSet.websiteUrl || undefined,
    sourceProductUrl: linkSet.productUrl || undefined,
    productUrl: linkSet.productUrl || undefined,
    productLink: linkSet.productUrl || undefined,
    affiliateUrl: linkSet.affiliateUrl || undefined,
    imageUrl: primaryImageUrl || undefined,
    availability: trimDealTextValue(deal.availability) || trimDealTextValue(deal.stockStatus) || undefined,
    stockStatus: trimDealTextValue(deal.stockStatus) || trimDealTextValue(deal.availability) || undefined,
    sourceQuery: trimDealTextValue(deal.sourceQuery) || sourceUrlCandidate || undefined,
  };
};

const buildFallbackNormalizedDigest = (deal?: BulkImportDealInput | null) => {
  const normalizedDeal = normalizeImportedDealInput(deal);
  if (!normalizedDeal) return null;

  return {
    sourceProvider: normalizedDeal.sourceProvider ?? 'legacy-response',
    merchant: normalizedDeal.merchant ?? normalizedDeal.businessName ?? null,
    brand: normalizedDeal.brand ?? null,
    productTitle: normalizedDeal.title ?? null,
    sourceUrl: normalizedDeal.productUrl ?? normalizedDeal.sourceQuery ?? normalizedDeal.websiteUrl ?? null,
    affiliateUrl: normalizedDeal.affiliateUrl ?? null,
    asin: normalizedDeal.asin ?? null,
    category: normalizedDeal.category ?? null,
    subcategory: normalizedDeal.subcategory ?? null,
    image: normalizedDeal.imageUrl ?? null,
    galleryImages: normalizedDeal.galleryImages ?? [],
    currentPrice: normalizedDeal.currentPrice ?? normalizedDeal.price ?? null,
    originalPrice: normalizedDeal.originalPrice ?? null,
    discountAmount: normalizedDeal.discountAmount ?? null,
    discountPercent: normalizedDeal.discountPercent ?? null,
    couponText: normalizedDeal.couponText ?? null,
    couponType: normalizedDeal.couponType ?? null,
    couponValue: normalizedDeal.couponValue ?? null,
    rating: normalizedDeal.rating ?? null,
    reviewCount: normalizedDeal.reviewCount ?? null,
    availability: normalizedDeal.availability ?? normalizedDeal.stockStatus ?? null,
    shippingInfo: normalizedDeal.shippingInfo ?? null,
    seller: normalizedDeal.seller ?? null,
    featureBullets: normalizedDeal.featureBullets ?? [],
    summary: normalizedDeal.summary ?? null,
    description: normalizedDeal.description ?? null,
    tags: normalizedDeal.tags ?? [],
    importedAt: normalizedDeal.importedAt ?? new Date().toISOString(),
  };
};

const buildFallbackMappedForm = (
  deal?: BulkImportDealInput | null,
): AIDealFinderMappedForm | null => {
  const normalizedDeal = normalizeImportedDealInput(deal);
  if (!normalizedDeal) return null;

  const payload = mapNormalizedDealToPortalFormFields(normalizedDeal);
  return {
    payload,
    fieldMappings: buildFallbackMappedFieldMappings(payload, normalizedDeal),
    draft: {
      ...normalizedDeal,
      businessName: payload.storeName,
      websiteUrl: payload.websiteUrl || undefined,
      productUrl: payload.productUrl || undefined,
      productLink: payload.productUrl || undefined,
      affiliateUrl: payload.affiliateUrl || undefined,
      title: payload.dealTitle,
      description: payload.description,
      category: payload.category,
      offerText: payload.offerText,
    },
  };
};

const buildFallbackValidationResult = (
  result?: AIDealFinderResult | null,
): AIDealFinderValidationResult | null => {
  if (!result?.normalizedDeal) return null;

  const mappedForm = result.mappedForm ?? buildFallbackMappedForm(result.normalizedDeal);
  if (!mappedForm) return null;

  const missingRequiredFields = REQUIRED_PORTAL_AUTOFILL_FIELDS.filter(
    (field) => !mappedForm.payload[field],
  );
  const weakFields = [...(result.missingFields ?? [])].filter(
    (field) => !missingRequiredFields.includes(field as keyof PortalAutofillPayload),
  );

  const fieldStates: AIDealFinderValidationFieldState[] = (Object.entries(mappedForm.payload) as Array<[keyof PortalAutofillPayload, string]>).map(([field, value]) => {
    const isMissing = !value;
    const isWeak = !isMissing && weakFields.includes(field);

    return {
      field,
      status: isMissing ? 'missing' : isWeak ? 'weak' : 'ready',
      confidence: isMissing ? 'missing' : isWeak ? 'low' : 'medium',
      source: `legacy:${field}`,
      message: isMissing
        ? 'This field is still empty in the generated response.'
        : isWeak
          ? 'This field was generated, but should be reviewed before publishing.'
          : 'This field is ready.',
    };
  });

  const warnings: AIDealFinderValidationWarning[] = [
    ...missingRequiredFields.map((field) => ({
      field,
      severity: 'error' as const,
      message: 'This required portal field is still missing in the generated response.',
    })),
    ...weakFields.map((field) => ({
      field,
      severity: 'warning' as const,
      message: 'This field came from a legacy or partial response and should be reviewed.',
    })),
  ];

  const totalFields = fieldStates.length || 1;
  const filledFields = fieldStates.filter((state) => state.status === 'ready').length;
  const weakFieldCount = fieldStates.filter((state) => state.status === 'weak').length;
  const completionPercent = Math.round(((filledFields + weakFieldCount * 0.5) / totalFields) * 100);

  return {
    status: missingRequiredFields.length > 0 ? 'blocked' : weakFields.length > 0 ? 'partial' : 'ready',
    warnings,
    missingRequiredFields,
    weakFields,
    fieldStates,
    completionPercent,
  };
};

const finalizeAIDealPipelineResult = (
  result: AIDealFinderResult,
  options?: {
    sourceUrl?: string | null;
    affiliateUrl?: string | null;
  },
): AIDealFinderResult => {
  const preferredDraft = result.mappedForm?.draft ?? result.normalizedDeal;
  const sourceUrl =
    canonicalizeSourceProductUrl(
      getFirstSafeExternalUrl(
        result.mappedForm?.payload.productUrl,
        result.sourceAssets?.productUrl,
        preferredDraft.sourceProductUrl,
        preferredDraft.productUrl,
        preferredDraft.productLink,
        preferredDraft.sourceQuery,
        options?.sourceUrl,
      ) ?? '',
    );
  const affiliateUrl =
    normalizeSafeExternalUrl(options?.affiliateUrl)
    ?? normalizeSafeExternalUrl(result.mappedForm?.payload.affiliateUrl)
    ?? normalizeSafeExternalUrl(result.sourceAssets?.affiliateUrl)
    ?? normalizeSafeExternalUrl(preferredDraft.affiliateUrl)
    ?? '';

  const normalizedDeal =
    normalizeImportedDealInput({
      ...preferredDraft,
      sourceType: 'url',
      sourceQuery: sourceUrl || preferredDraft.sourceQuery,
      sourceProductUrl: sourceUrl || preferredDraft.sourceProductUrl || preferredDraft.productUrl,
      productUrl: sourceUrl || preferredDraft.productUrl || preferredDraft.sourceProductUrl,
      productLink: sourceUrl || preferredDraft.productLink || preferredDraft.productUrl,
      affiliateUrl: affiliateUrl || preferredDraft.affiliateUrl,
      websiteUrl:
        deriveWebsiteOrigin(preferredDraft.websiteUrl)
        || deriveWebsiteOrigin(sourceUrl)
        || preferredDraft.websiteUrl,
      importedAt: preferredDraft.importedAt ?? new Date().toISOString(),
      isOnline: true,
    })
    ?? normalizeImportedDealInput({
      businessName: deriveMerchantFromSourceUrl(sourceUrl) || DEAL_BUSINESS_FALLBACK,
      title: preferredDraft.title || DEAL_TITLE_FALLBACK,
      description: preferredDraft.description || preferredDraft.summary || DEAL_DESCRIPTION_FALLBACK,
      category: preferredDraft.category || getDefaultCategoryForMode('online'),
      offerText: preferredDraft.offerText || DEAL_OFFER_FALLBACK,
      sourceType: 'url',
      sourceQuery: sourceUrl || undefined,
      sourceProductUrl: sourceUrl || undefined,
      productUrl: sourceUrl || undefined,
      productLink: sourceUrl || undefined,
      affiliateUrl: affiliateUrl || undefined,
      websiteUrl: deriveWebsiteOrigin(sourceUrl) || undefined,
      imageUrl: preferredDraft.imageUrl,
      isOnline: true,
    });

  if (!normalizedDeal) {
    return result;
  }

  const fallbackPayload = mapNormalizedDealToPortalFormFields(normalizedDeal);
  const serverPayload = result.mappedForm?.payload;
  const resolvePayloadField = (serverValue: string | undefined, fallbackValue: string) =>
    normalizePortalFieldValue(serverValue) || fallbackValue;
  const resolvedPayload: PortalAutofillPayload = {
    storeName: resolvePayloadField(serverPayload?.storeName, fallbackPayload.storeName),
    websiteUrl: resolvePayloadField(serverPayload?.websiteUrl, fallbackPayload.websiteUrl),
    productUrl: resolvePayloadField(serverPayload?.productUrl, fallbackPayload.productUrl),
    affiliateUrl: resolvePayloadField(serverPayload?.affiliateUrl, fallbackPayload.affiliateUrl),
    imageUrl: resolvePayloadField(serverPayload?.imageUrl, fallbackPayload.imageUrl),
    dealTitle: resolvePayloadField(serverPayload?.dealTitle, fallbackPayload.dealTitle),
    description: resolvePayloadField(serverPayload?.description, fallbackPayload.description),
    category: resolvePayloadField(serverPayload?.category, fallbackPayload.category),
    offerText: resolvePayloadField(serverPayload?.offerText, fallbackPayload.offerText),
  };
  const resolvedMappedForm: AIDealFinderMappedForm = {
    payload: resolvedPayload,
    fieldMappings:
      result.mappedForm?.fieldMappings?.length
        ? result.mappedForm.fieldMappings.map((mapping) => ({
          ...mapping,
          value: resolvedPayload[mapping.field],
        }))
        : buildFallbackMappedFieldMappings(resolvedPayload, normalizedDeal),
    draft: {
      ...normalizedDeal,
      businessName: resolvedPayload.storeName || normalizedDeal.businessName,
      title: resolvedPayload.dealTitle || normalizedDeal.title,
      description: resolvedPayload.description || normalizedDeal.description,
      category: resolvedPayload.category || normalizedDeal.category,
      offerText: resolvedPayload.offerText || normalizedDeal.offerText,
      websiteUrl: resolvedPayload.websiteUrl || normalizedDeal.websiteUrl,
      sourceProductUrl: resolvedPayload.productUrl || normalizedDeal.sourceProductUrl,
      productUrl: resolvedPayload.productUrl || normalizedDeal.productUrl,
      productLink: resolvedPayload.productUrl || normalizedDeal.productLink,
      affiliateUrl: resolvedPayload.affiliateUrl || normalizedDeal.affiliateUrl,
      imageUrl: resolvedPayload.imageUrl || normalizedDeal.imageUrl,
    },
  };
  const normalizedDigest = buildFallbackNormalizedDigest(resolvedMappedForm.draft);
  const validationResult = buildFallbackValidationResult({
    ...result,
    normalizedDeal: resolvedMappedForm.draft,
    mappedForm: resolvedMappedForm,
  });
  const generatedJson = JSON.stringify(resolvedMappedForm.draft, null, 2);

  return {
    ...result,
    normalizedDeal: resolvedMappedForm.draft,
    generatedJson,
    sourceAssets: {
      websiteUrl: resolvedMappedForm.payload.websiteUrl || deriveWebsiteOrigin(sourceUrl) || result.sourceAssets?.websiteUrl || null,
      productUrl: resolvedMappedForm.payload.productUrl || sourceUrl || result.sourceAssets?.productUrl || null,
      affiliateUrl: resolvedMappedForm.payload.affiliateUrl || affiliateUrl || result.sourceAssets?.affiliateUrl || null,
      imageUrl: resolvedMappedForm.payload.imageUrl || resolvedMappedForm.draft.imageUrl || result.sourceAssets?.imageUrl || null,
    },
    normalizedDigest: normalizedDigest ?? result.normalizedDigest,
    mappedForm: resolvedMappedForm,
    validationResult: validationResult ?? result.validationResult,
    missingFields: Array.from(
      new Set([
        ...(result.missingFields ?? []),
        ...(validationResult?.missingRequiredFields ?? []),
      ]),
    ),
  };
};

const buildFallbackScanLayer = (result?: AIDealFinderResult | null) => {
  if (!result) return null;
  if (result.scanResult) return result.scanResult;
  if (!result.extractionDebug && !result.sourceAssets && !result.normalizedDeal) return null;

  return {
    provider: 'legacy-response',
    extractionStatus: result.extractionStatus ?? null,
    extractionDebug: result.extractionDebug ?? null,
    sourceAssets: result.sourceAssets ?? null,
    missingFields: result.missingFields ?? [],
    normalizedDealPreview: result.normalizedDeal
      ? {
          title: result.normalizedDeal.title,
          businessName: result.normalizedDeal.businessName,
          productUrl: result.normalizedDeal.productUrl ?? null,
          affiliateUrl: result.normalizedDeal.affiliateUrl ?? null,
        }
      : null,
  };
};

const applyAffiliateTrackingOverride = (
  normalizedDeal: BulkImportDealInput,
  affiliateOverride?: string | null,
) => {
  const nextAffiliateUrl = normalizeSafeExternalUrl(affiliateOverride);
  if (!nextAffiliateUrl || nextAffiliateUrl === normalizedDeal.affiliateUrl) {
    return normalizedDeal;
  }

  return {
    ...normalizedDeal,
    affiliateUrl: nextAffiliateUrl,
  };
};

const applyAffiliateTrackingOverrideToResult = (
  result: AIDealFinderResult,
  affiliateOverride?: string | null,
): AIDealFinderResult => {
  const nextAffiliateUrl = normalizeSafeExternalUrl(affiliateOverride);
  if (!nextAffiliateUrl) {
    return result;
  }

  return finalizeAIDealPipelineResult(
    {
      ...result,
      normalizedDeal: applyAffiliateTrackingOverride(result.normalizedDeal, nextAffiliateUrl),
      sourceAssets: {
        ...result.sourceAssets,
        affiliateUrl: nextAffiliateUrl,
      },
    },
    {
      sourceUrl:
        result.sourceAssets?.productUrl
        ?? result.normalizedDeal.productUrl
        ?? result.normalizedDeal.productLink
        ?? result.normalizedDeal.sourceQuery
        ?? null,
      affiliateUrl: nextAffiliateUrl,
    },
  );
};

const validateAffiliateTrackingInput = (value?: string | null) => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return {
      url: null,
      error: null,
    };
  }

  const normalizedUrl = normalizeSafeExternalUrl(trimmed);
  if (!normalizedUrl) {
    return {
      url: null,
      error: 'Paste a valid affiliate / outbound URL or leave it blank.',
    };
  }

  return {
    url: normalizedUrl,
    error: null,
  };
};

const formatFinderPrice = (value?: number | null) =>
  value != null ? `$${value.toFixed(2)}` : null;

const getFinderScoreTone = (score?: number | null) => {
  if ((score ?? 0) >= 80) return 'bg-emerald-100 text-emerald-700';
  if ((score ?? 0) >= 60) return 'bg-indigo-100 text-indigo-700';
  if ((score ?? 0) >= 40) return 'bg-amber-100 text-amber-700';
  return 'bg-slate-100 text-slate-600';
};

const getFinderRankTone = (label: AIDealFinderRankLabel) => {
  if (label === 'Best Overall') return 'bg-indigo-600 text-white';
  if (label === 'Best Budget') return 'bg-emerald-100 text-emerald-700';
  if (label === 'Best Trusted') return 'bg-sky-100 text-sky-700';
  return 'bg-fuchsia-100 text-fuchsia-700';
};

type AppShellRouteProps = {
  routePath: string;
  renderAdminPage: () => React.ReactNode;
  renderPublicShell: () => React.ReactNode;
  fallback: React.ReactNode;
};

function AppShellRoute({ routePath, renderAdminPage, renderPublicShell, fallback }: AppShellRouteProps) {
  if (routePath === '/admin') {
    return <>{renderAdminPage()}</>;
  }

  if (routePath === '/' || routePath === '/dashboard') {
    return <>{renderPublicShell()}</>;
  }

  return <>{fallback}</>;
}

type DealRow = {
  id: string;
  business_type: 'local' | 'online';
  status: 'active' | 'expired' | 'draft';
  featured: boolean | null;
  admin_tag: 'featured' | 'trending' | null;
  business_name: string | null;
  merchant: string | null;
  logo_url: string | null;
  image_url: string | null;
  image: string | null;
  title: string;
  description: string;
  offer_text: string;
  like_count: number | null;
  dislike_count: number | null;
  share_count: number | null;
  original_price: number | null;
  discount_percent: number | null;
  affiliate_url: string | null;
  review_count: number | null;
  stock_status: string | null;
  website_url: string | null;
  product_link: string | null;
  product_url: string | null;
  has_timer: boolean;
  distance: string;
  lat: number;
  lng: number;
  created_at: string;
  expires_at: string;
  max_claims: number;
  current_claims: number;
  claim_count: number;
  category: string;
  local_subcategory: string | null;
  online_subcategory: string | null;
  owner_id: string | null;
};

type DealPublishPayload = Partial<DealRow>;

type SharedPublishFailure = {
  deal: Deal;
  mode: 'insert' | 'update';
  payload: DealPublishPayload;
  projectUrl: string;
  schema: string;
  table: string;
  reason: string;
  errorCode: string | null;
  errorDetails: string | null;
  errorHint: string | null;
  missingColumns: string[];
  occurredAt: number;
};

type DealsSchemaPreflightResult = {
  schemaColumns: string[];
  schemaSource: 'rpc' | 'local-fallback';
  payloadKeys: string[];
  missingColumns: string[];
  requiredSchemaMissingColumns: string[];
  extraFieldsRemoved: string[];
  payload: DealPublishPayload;
};

const PUBLIC_DEALS_SCHEMA_FIELDS = [
  'id',
  'business_type',
  'status',
  'featured',
  'admin_tag',
  'business_name',
  'merchant',
  'logo_url',
  'image_url',
  'image',
  'title',
  'description',
  'offer_text',
  'like_count',
  'dislike_count',
  'share_count',
  'original_price',
  'discount_percent',
  'affiliate_url',
  'review_count',
  'stock_status',
  'website_url',
  'product_link',
  'product_url',
  'has_timer',
  'distance',
  'lat',
  'lng',
  'created_at',
  'expires_at',
  'max_claims',
  'current_claims',
  'claim_count',
  'category',
  'local_subcategory',
  'online_subcategory',
  'owner_id',
] as const satisfies ReadonlyArray<keyof DealRow>;

const PUBLIC_DEALS_SCHEMA_FIELD_SET = new Set<string>(PUBLIC_DEALS_SCHEMA_FIELDS);

const REQUIRED_PUBLIC_DEALS_SCHEMA_FIELDS = [
  'id',
  'business_name',
  'title',
  'description',
  'offer_text',
  'category',
] as const satisfies ReadonlyArray<keyof DealRow>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuidOrNull = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed && UUID_PATTERN.test(trimmed) ? trimmed : null;
};

const hashString32 = (value: string, seed: number) => {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createStableUuidFromString = (value: string) => {
  const normalized = value.trim().toLowerCase();
  const hash1 = hashString32(normalized, 0x811c9dc5).toString(16).padStart(8, '0');
  const hash2 = hashString32(normalized, 0x9e3779b1).toString(16).padStart(8, '0');
  const hash3 = hashString32(normalized, 0x85ebca77).toString(16).padStart(8, '0');
  const hash4 = hashString32(normalized, 0xc2b2ae3d).toString(16).padStart(8, '0');
  const variant = ((parseInt(hash3.slice(0, 4), 16) & 0x3fff) | 0x8000).toString(16).padStart(4, '0');

  return `${hash1}-${hash2.slice(0, 4)}-4${hash2.slice(1, 4)}-${variant}-${hash3.slice(4, 8)}${hash4}`.toLowerCase();
};

const canonicalizeSourceProductUrl = (value?: string | null) => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return trimmed;
    }

    if (parsed.hostname.toLowerCase().includes('amazon.')) {
      const asinMatch = parsed.pathname.match(/\/(?:gp\/product|dp)\/([A-Z0-9]{10})/i)
        ?? parsed.pathname.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
      if (asinMatch?.[1]) {
        return `${parsed.protocol}//${parsed.hostname}/dp/${asinMatch[1].toUpperCase()}`;
      }
    }

    parsed.hash = '';
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

const validateDirectProductUrl = (value?: string | null) => {
  const trimmed = value?.trim() ?? '';

  if (!trimmed) {
    return {
      url: null,
      error: 'Paste the full product page URL to continue.',
    };
  }

  if (
    /could not insert to public\.deals/i.test(trimmed) ||
    /last backend error/i.test(trimmed) ||
    /schema mismatch/i.test(trimmed)
  ) {
    return {
      url: null,
      error: 'The source product URL field contains a backend error message, not a real product page URL.',
    };
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Unsupported protocol');
    }

    if (parsed.hostname.toLowerCase() === 'amzn.to') {
      return {
        url: null,
        error: 'Paste the full Amazon product page URL here. Put the SiteStripe amzn.to link in the affiliate link field.',
      };
    }

    return {
      url: canonicalizeSourceProductUrl(trimmed),
      error: null,
    };
  } catch {
    return {
      url: null,
      error: 'Paste a valid full product page URL to continue.',
    };
  }
};

const createUuid = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const ensureUuid = (value?: string | null) => {
  const normalized = normalizeUuidOrNull(value);
  if (normalized) return normalized;

  const trimmed = value?.trim();
  if (trimmed) return createStableUuidFromString(trimmed);

  return createUuid();
};

const parseDealTimestampOrFallback = (value: string | null | undefined, fallback: number) => {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseDealNumberOrFallback = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const DEAL_TITLE_FALLBACK = 'Limited-Time Deal';
const DEAL_BUSINESS_FALLBACK = 'LiveDrop Partner';
const DEAL_DESCRIPTION_FALLBACK = 'Fresh deal available right now.';
const DEAL_OFFER_FALLBACK = 'Live Deal';
const DEAL_CATEGORY_FALLBACK = 'Uncategorized';
const DEAL_MAX_TEXT_LENGTH = {
  businessName: 80,
  title: 180,
  description: 320,
  offerText: 90,
  stockStatus: 40,
  distance: 32,
} as const;

const trimDealTextValue = (value: unknown) =>
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim()
    : '';

const trimDealTextWithFallback = (value: unknown, fallback: string, maxLength: number) => {
  const normalized = trimDealTextValue(value);
  if (!normalized) return fallback;
  return normalized.slice(0, maxLength);
};

const parseNumberishValue = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const clampWholeNumber = (value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const parsedValue = parseNumberishValue(value);
  if (parsedValue === null) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsedValue)));
};

const clampDealCount = (value: unknown, fallback: number) =>
  clampWholeNumber(value, fallback, 0, 999_999);

const normalizeDealCategoryValue = (
  value: unknown,
  businessType: Deal['businessType'],
  contextValues: Array<unknown> = [],
) => normalizeCategoryValue(value, businessType === 'local' ? 'local' : 'online', contextValues);

const getDefaultDealExpiry = (createdAt: number, businessType: Deal['businessType']) =>
  createdAt + (businessType === 'online' ? 2 * 60 * 60 * 1000 : 60 * 60 * 1000);

const getDealDataPresenceScore = (deal: Deal) => {
  let score = 0;
  if (deal.imageUrl) score += 3;
  if (deal.affiliateUrl || deal.productUrl || deal.websiteUrl) score += 3;
  if (deal.description !== DEAL_DESCRIPTION_FALLBACK) score += 2;
  if (deal.category !== DEAL_CATEGORY_FALLBACK) score += 1;
  if (deal.offerText !== DEAL_OFFER_FALLBACK) score += 1;
  return score;
};

const choosePreferredDealRecord = (currentDeal: Deal, nextDeal: Deal) => {
  const currentScore = getDealDataPresenceScore(currentDeal);
  const nextScore = getDealDataPresenceScore(nextDeal);

  if (nextScore !== currentScore) {
    return nextScore > currentScore ? nextDeal : currentDeal;
  }

  if ((currentDeal.status ?? 'active') !== (nextDeal.status ?? 'active')) {
    return (nextDeal.status ?? 'active') === 'active' ? nextDeal : currentDeal;
  }

  return nextDeal.createdAt >= currentDeal.createdAt ? nextDeal : currentDeal;
};

const getDealDedupKey = (deal: Deal) => {
  const strongestUrl = getFirstSafeExternalUrl(deal.productUrl, deal.websiteUrl, deal.affiliateUrl);
  if (strongestUrl) {
    return `url:${strongestUrl}`;
  }

  return [
    deal.businessType ?? 'local',
    trimDealTextValue(deal.businessName).toLowerCase(),
    trimDealTextValue(deal.title).toLowerCase(),
    trimDealTextValue(deal.offerText).toLowerCase(),
  ].join('|');
};

const sanitizeDealRecord = (input: Partial<Deal> | null | undefined): Deal | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const rawHasMeaningfulContent = [
    input.id,
    input.businessName,
    input.title,
    input.description,
    input.offerText,
    input.imageUrl,
    input.affiliateUrl,
    input.productUrl,
    input.websiteUrl,
  ].some((value) => trimDealTextValue(value).length > 0);

  if (!rawHasMeaningfulContent) {
    return null;
  }

  const businessType = input.businessType === 'online' ? 'online' : 'local';
  const createdAt = clampWholeNumber(input.createdAt, Date.now(), 0);
  const requestedHasTimer = typeof input.hasTimer === 'boolean' ? input.hasTimer : true;
  const rawExpiresAt = clampWholeNumber(input.expiresAt, getDefaultDealExpiry(createdAt, businessType), 0);
  const expiresAt = rawExpiresAt >= createdAt ? rawExpiresAt : getDefaultDealExpiry(createdAt, businessType);
  const normalizedMaxClaims = clampWholeNumber(
    input.maxClaims,
    999,
    0,
    999_999,
  );
  const maxClaims = normalizedMaxClaims;
  const currentClaims = maxClaims === 0
    ? 0
    : Math.min(clampDealCount(input.currentClaims, 0), maxClaims);
  const claimCount = maxClaims === 0
    ? 0
    : Math.min(Math.max(clampDealCount(input.claimCount, currentClaims), currentClaims), maxClaims);
  const originalPriceValue = parseNumberishValue(input.originalPrice);
  const normalizedOriginalPrice =
    originalPriceValue !== null && originalPriceValue >= 0 ? originalPriceValue : null;
  const discountValue = parseNumberishValue(input.discountPercent);
  const normalizedDiscountPercent =
    discountValue !== null ? Math.min(100, Math.max(0, Math.round(discountValue))) : null;
  const normalizedAffiliateUrl = normalizeSafeExternalUrl(input.affiliateUrl);
  const normalizedProductUrl = getFirstSafeExternalUrl(input.productUrl);
  const normalizedWebsiteUrl =
    deriveWebsiteOrigin(input.websiteUrl)
    ?? deriveWebsiteOrigin(normalizedProductUrl)
    ?? deriveWebsiteOrigin(normalizedAffiliateUrl)
    ?? undefined;
  const normalizedBusinessName = trimDealTextWithFallback(
    input.businessName,
    DEAL_BUSINESS_FALLBACK,
    DEAL_MAX_TEXT_LENGTH.businessName,
  );
  const normalizedTitle = trimDealTextWithFallback(
    input.title,
    DEAL_TITLE_FALLBACK,
    DEAL_MAX_TEXT_LENGTH.title,
  );
  const normalizedDescription = trimDealTextWithFallback(
    input.description,
    DEAL_DESCRIPTION_FALLBACK,
    DEAL_MAX_TEXT_LENGTH.description,
  );
  const normalizedOfferText = trimDealTextWithFallback(
    input.offerText,
    DEAL_OFFER_FALLBACK,
    DEAL_MAX_TEXT_LENGTH.offerText,
  );
  const normalizedDistance = businessType === 'online'
    ? 'Online'
    : trimDealTextWithFallback(input.distance, 'Nearby', DEAL_MAX_TEXT_LENGTH.distance);
  const normalizedLat = parseNumberishValue(input.lat);
  const normalizedLng = parseNumberishValue(input.lng);
  const hasValidLocalCoordinates =
    businessType !== 'online' && hasUsableCoordinates(normalizedLat, normalizedLng);
  const nextStatus = input.status === 'draft'
    ? 'draft'
    : expiresAt <= Date.now()
      ? 'expired'
      : 'active';
  const normalizedCategory = normalizeDealCategoryValue(input.category, businessType, [
    input.title,
    input.description,
    input.offerText,
    input.businessName,
    input.merchant,
    input.brand,
  ]);
  const normalizedLocalSubcategory = businessType === 'local'
    ? normalizeSubcategoryValue(input.localSubcategory, 'local', normalizedCategory) || undefined
    : undefined;
  const normalizedOnlineSubcategory = businessType === 'online'
    ? normalizeSubcategoryValue(input.onlineSubcategory, 'online', normalizedCategory) || undefined
    : undefined;

  return {
    id: trimDealTextValue(input.id) || createUuid(),
    businessType,
    status: nextStatus,
    featured: Boolean(input.featured),
    adminTag: input.adminTag === 'featured' || input.adminTag === 'trending' ? input.adminTag : null,
    businessName: normalizedBusinessName,
    logoUrl: trimDealTextValue(input.logoUrl) || undefined,
    imageUrl: trimDealTextValue(input.imageUrl) || undefined,
    title: normalizedTitle,
    description: normalizedDescription,
    offerText: normalizedOfferText,
    likeCount: clampDealCount(input.likeCount, 0),
    dislikeCount: clampDealCount(input.dislikeCount, 0),
    shareCount: clampDealCount(input.shareCount, 0),
    currentPrice: parseNumberishValue(input.currentPrice),
    originalPrice: normalizedOriginalPrice,
    discountPercent: normalizedDiscountPercent,
    affiliateUrl: normalizedAffiliateUrl ?? undefined,
    merchant: trimDealTextValue(input.merchant) || undefined,
    brand: trimDealTextValue(input.brand) || undefined,
    rating: parseNumberishValue(input.rating),
    reviewCount: clampWholeNumber(input.reviewCount, 0, 0, 9_999_999),
    availability: trimDealTextValue(input.availability) || undefined,
    stockStatus: trimDealTextValue(input.stockStatus).slice(0, DEAL_MAX_TEXT_LENGTH.stockStatus) || undefined,
    websiteUrl: normalizedWebsiteUrl,
    productUrl: normalizedProductUrl ?? undefined,
    hasTimer: requestedHasTimer && nextStatus !== 'draft',
    distance: normalizedDistance,
    lat: businessType === 'online' ? 0 : hasValidLocalCoordinates ? Number(normalizedLat) : 0,
    lng: businessType === 'online' ? 0 : hasValidLocalCoordinates ? Number(normalizedLng) : 0,
    createdAt,
    expiresAt,
    maxClaims,
    currentClaims,
    claimCount,
    category: normalizedCategory,
    localSubcategory: normalizedLocalSubcategory,
    onlineSubcategory: normalizedOnlineSubcategory,
  };
};

const sanitizeDealsCollection = (input: Array<Partial<Deal> | null | undefined>) => {
  const dedupedDeals = new Map<string, Deal>();

  input.forEach((deal) => {
    const sanitizedDeal = sanitizeDealRecord(deal);
    if (!sanitizedDeal) {
      return;
    }

    const dedupeKey = getDealDedupKey(sanitizedDeal);
    const existingDeal = dedupedDeals.get(dedupeKey);
    dedupedDeals.set(
      dedupeKey,
      existingDeal ? choosePreferredDealRecord(existingDeal, sanitizedDeal) : sanitizedDeal,
    );
  });

  return [...dedupedDeals.values()].sort((left, right) => right.createdAt - left.createdAt);
};

const inferDealBusinessType = (row: Partial<DealRow>, fallback?: Deal['businessType']) => {
  if (row.business_type === 'local' || row.business_type === 'online') {
    return row.business_type;
  }

  if (fallback === 'local' || fallback === 'online') {
    return fallback;
  }

  return row.website_url || row.product_link || row.product_url || row.affiliate_url || row.image_url || row.image
    ? 'online'
    : 'local';
};

const mapDealRowToDeal = (row: Partial<DealRow>, fallback?: Partial<Deal>): Deal => {
  const businessType = inferDealBusinessType(row, fallback?.businessType);
  const createdAt = parseDealTimestampOrFallback(
    row.created_at,
    fallback?.createdAt ?? Date.now(),
  );
  const expiresAt = parseDealTimestampOrFallback(
    row.expires_at,
    fallback?.expiresAt ?? (
      businessType === 'online'
        ? createdAt + 7 * 24 * 60 * 60 * 1000
        : createdAt + 60 * 60 * 1000
    ),
  );
  const currentClaims = parseDealNumberOrFallback(
    row.current_claims,
    fallback?.currentClaims ?? 0,
  );
  const claimCount = parseDealNumberOrFallback(
    row.claim_count,
    fallback?.claimCount ?? currentClaims,
  );
  const maxClaims = parseDealNumberOrFallback(
    row.max_claims,
    fallback?.maxClaims ?? 999,
  );
  const rawLat = parseDealNumberOrFallback(row.lat, fallback?.lat ?? 0);
  const rawLng = parseDealNumberOrFallback(row.lng, fallback?.lng ?? 0);
  const hasValidLocalCoordinates = businessType !== 'online' && hasUsableCoordinates(rawLat, rawLng);
  const normalizedCategory = normalizeDealCategoryValue(
    row.category ?? fallback?.category ?? DEAL_CATEGORY_FALLBACK,
    businessType,
    [
      row.title ?? fallback?.title,
      row.description ?? fallback?.description,
      row.offer_text ?? fallback?.offerText,
      row.business_name ?? row.merchant ?? fallback?.businessName,
    ],
  );

  return sanitizeDealRecord({
    id: row.id ?? fallback?.id ?? createUuid(),
    businessType,
    status: row.status ?? fallback?.status ?? 'active',
    featured: row.featured ?? fallback?.featured ?? false,
    adminTag: row.admin_tag ?? fallback?.adminTag ?? null,
    businessName: row.business_name ?? row.merchant ?? fallback?.businessName ?? DEAL_BUSINESS_FALLBACK,
    logoUrl: row.logo_url ?? fallback?.logoUrl ?? undefined,
    imageUrl: row.image_url ?? row.image ?? fallback?.imageUrl ?? undefined,
    title: row.title ?? fallback?.title ?? DEAL_TITLE_FALLBACK,
    description: row.description ?? fallback?.description ?? DEAL_DESCRIPTION_FALLBACK,
    offerText: row.offer_text ?? fallback?.offerText ?? DEAL_OFFER_FALLBACK,
    likeCount: row.like_count ?? fallback?.likeCount ?? 0,
    dislikeCount: row.dislike_count ?? fallback?.dislikeCount ?? 0,
    shareCount: row.share_count ?? fallback?.shareCount ?? 0,
    originalPrice: row.original_price ?? fallback?.originalPrice ?? null,
    discountPercent: row.discount_percent ?? fallback?.discountPercent ?? null,
    affiliateUrl: row.affiliate_url ?? fallback?.affiliateUrl ?? undefined,
    merchant: row.merchant ?? fallback?.merchant ?? undefined,
    brand: fallback?.brand ?? undefined,
    rating: fallback?.rating ?? null,
    reviewCount: row.review_count ?? fallback?.reviewCount ?? null,
    availability: fallback?.availability ?? undefined,
    stockStatus: row.stock_status ?? fallback?.stockStatus ?? undefined,
    websiteUrl: row.website_url ?? fallback?.websiteUrl ?? undefined,
    productUrl: row.product_url ?? row.product_link ?? fallback?.productUrl ?? undefined,
    hasTimer: typeof row.has_timer === 'boolean' ? row.has_timer : fallback?.hasTimer ?? Boolean(row.expires_at),
    distance: row.distance ?? fallback?.distance ?? (businessType === 'online' ? 'Online' : 'Nearby'),
    lat: businessType === 'online' ? 0 : hasValidLocalCoordinates ? rawLat : 0,
    lng: businessType === 'online' ? 0 : hasValidLocalCoordinates ? rawLng : 0,
    createdAt,
    expiresAt,
    maxClaims,
    currentClaims,
    claimCount,
    category: normalizedCategory,
    localSubcategory: normalizeSubcategoryValue(
      row.local_subcategory ?? fallback?.localSubcategory,
      'local',
      normalizedCategory,
    ) || undefined,
    onlineSubcategory: normalizeSubcategoryValue(
      row.online_subcategory ?? fallback?.onlineSubcategory,
      'online',
      normalizedCategory,
    ) || undefined,
  })!;
};

const mapDealToDealRow = (deal: Deal, ownerId?: string | null): DealRow => {
  const sourceProductUrl = deal.productUrl ?? null;
  const affiliateUrl = deal.affiliateUrl ?? null;
  const normalizedOwnerId = normalizeUuidOrNull(ownerId);

  return {
    id: ensureUuid(deal.id),
    business_type: deal.businessType ?? 'local',
    status: deal.status ?? (deal.expiresAt <= Date.now() ? 'expired' : 'active'),
    featured: deal.featured ?? false,
    admin_tag: deal.adminTag ?? null,
    business_name: deal.businessName,
    merchant: deal.businessName,
    logo_url: deal.logoUrl ?? null,
    image_url: deal.imageUrl ?? null,
    image: deal.imageUrl ?? null,
    title: deal.title,
    description: deal.description,
    offer_text: deal.offerText,
    like_count: deal.likeCount ?? 0,
    dislike_count: deal.dislikeCount ?? 0,
    share_count: deal.shareCount ?? 0,
    original_price: deal.originalPrice ?? null,
    discount_percent: deal.discountPercent ?? null,
    affiliate_url: affiliateUrl,
    review_count: deal.reviewCount ?? null,
    stock_status: deal.stockStatus ?? null,
    website_url: deal.websiteUrl ?? null,
    product_link: sourceProductUrl,
    product_url: sourceProductUrl,
    has_timer: deal.hasTimer ?? true,
    distance: deal.distance,
    lat: deal.lat,
    lng: deal.lng,
    created_at: new Date(deal.createdAt).toISOString(),
    expires_at: new Date(deal.expiresAt).toISOString(),
    max_claims: deal.maxClaims,
    current_claims: deal.currentClaims,
    claim_count: deal.claimCount ?? deal.currentClaims,
    category: deal.category,
    local_subcategory: deal.localSubcategory ?? null,
    online_subcategory: deal.onlineSubcategory ?? null,
    owner_id: normalizedOwnerId,
  };
};

const formatAdminLogDetail = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    console.warn('[LiveDrop] Failed to stringify admin log detail', error);
    return String(value);
  }
};

const asAdminLogRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asAdminLogString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asAdminLogStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map((item) => asAdminLogString(item)).filter(Boolean)
    : [];

const humanizeAdminFieldName = (field: string) => {
  const overrides: Record<string, string> = {
    affiliate_url: 'affiliate link',
    affiliateUrl: 'affiliate link',
    business_name: 'store name',
    image_url: 'image',
    imageUrl: 'image',
    offer_text: 'offer text',
    offerText: 'offer text',
    original_price: 'original price',
    originalPrice: 'original price',
    product_link: 'source product URL',
    product_url: 'source product URL',
    productLink: 'source product URL',
    productUrl: 'source product URL',
    review_count: 'review count',
    reviewCount: 'review count',
    website_url: 'website URL',
    websiteUrl: 'website URL',
  };

  if (overrides[field]) {
    return overrides[field];
  }

  return field
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
};

const formatAdminFieldList = (fields: string[]) =>
  Array.from(
    new Set(fields.map((field) => humanizeAdminFieldName(field)).filter(Boolean)),
  ).join(', ');

const parseAdminLogDetailObject = (detail?: string): Record<string, unknown> | null => {
  if (!detail) return null;

  try {
    const parsed = JSON.parse(detail);
    return asAdminLogRecord(parsed);
  } catch {
    return null;
  }
};

const getAdminLogPrimaryPayload = (detailObject: Record<string, unknown> | null) => {
  const payload = detailObject?.payload;

  if (Array.isArray(payload)) {
    return payload.map((item) => asAdminLogRecord(item)).find(Boolean) ?? null;
  }

  return asAdminLogRecord(payload);
};

const getAdminLogPayloadTitle = (
  detailObject: Record<string, unknown> | null,
  fallbackMessage?: string,
) => {
  const payloadTitle = asAdminLogString(getAdminLogPrimaryPayload(detailObject)?.title);
  if (payloadTitle) return payloadTitle;

  const productTitle = asAdminLogString(detailObject?.productTitle);
  if (productTitle) return productTitle;

  const quotedMatch = fallbackMessage?.match(/"([^"]+)"/);
  return quotedMatch?.[1] ?? '';
};

const getAdminLogMerchant = (detailObject: Record<string, unknown> | null) => {
  const primaryPayload = getAdminLogPrimaryPayload(detailObject);

  return (
    asAdminLogString(detailObject?.sourceMerchant) ||
    asAdminLogString(detailObject?.merchant) ||
    asAdminLogString(detailObject?.businessName) ||
    asAdminLogString(primaryPayload?.merchant) ||
    asAdminLogString(primaryPayload?.business_name)
  );
};

const getAdminLogMissingOptionalFields = (
  detailObject: Record<string, unknown> | null,
  rawDetail?: string,
) => {
  const missingFromObject =
    asAdminLogStringArray(detailObject?.missingOptionalFields).length > 0
      ? asAdminLogStringArray(detailObject?.missingOptionalFields)
      : asAdminLogStringArray(detailObject?.missingFields);

  if (missingFromObject.length > 0) {
    return missingFromObject;
  }

  if (rawDetail && !rawDetail.trim().startsWith('{')) {
    const match = rawDetail.match(/Missing:\s*(.+)$/i);
    if (match?.[1]) {
      return match[1]
        .split(',')
        .map((field) => field.trim())
        .filter(Boolean);
    }
  }

  return [];
};

const getAdminLogErrorReason = (
  detailObject: Record<string, unknown> | null,
  rawDetail?: string,
) => {
  const errorContext = asAdminLogRecord(detailObject?.error);
  const explicitReason =
    asAdminLogString(errorContext?.reason) ||
    asAdminLogString(errorContext?.message) ||
    asAdminLogString(detailObject?.failureReason);

  if (explicitReason) return explicitReason;

  if (rawDetail && !rawDetail.trim().startsWith('{')) {
    return rawDetail.trim();
  }

  return '';
};

const humanizeAdminBackendReason = (reason: string) => {
  const trimmedReason = reason.trim();
  if (!trimmedReason) return '';

  const normalizedReason = trimmedReason.toLowerCase();

  if (
    normalizedReason.includes('missing vite_supabase_url') ||
    normalizedReason.includes('missing vite_supabase_anon_key') ||
    normalizedReason.includes('missing vite_supabase_url or vite_supabase_anon_key') ||
    normalizedReason.includes('supabase is not configured')
  ) {
    return 'Supabase is not connected in this build yet, so LiveDrop is using fallback data instead of shared syncing.';
  }

  if (
    normalizedReason.includes('failed to fetch') ||
    normalizedReason.includes('networkerror') ||
    normalizedReason.includes('network request failed')
  ) {
    return 'LiveDrop could not reach the shared backend right now, so it stayed on fallback data.';
  }

  if (normalizedReason.includes('row level security')) {
    return 'Supabase blocked this action with its current permissions policy.';
  }

  if (normalizedReason.includes('invalid input syntax for type uuid')) {
    return 'The shared backend rejected one of the deal IDs being sent for this action.';
  }

  return trimmedReason;
};

const summarizeAdminLogEntry = (entry: AdminLogEntry): AdminActivityCard | null => {
  const hiddenMessagePatterns = [
    /^Publishing "/i,
    /^Updating "/i,
    /^Bulk publishing /i,
    /^Retrying shared /i,
    /^Preflight checked /i,
  ];

  if (hiddenMessagePatterns.some((pattern) => pattern.test(entry.message))) {
    return null;
  }

  const detailObject = parseAdminLogDetailObject(entry.detail);
  const merchant = getAdminLogMerchant(detailObject);
  const dealTitle = getAdminLogPayloadTitle(detailObject, entry.message);
  const missingOptionalFields = getAdminLogMissingOptionalFields(detailObject, entry.detail);
  const errorReason = getAdminLogErrorReason(detailObject, entry.detail);
  const friendlyErrorReason = humanizeAdminBackendReason(errorReason);
  const unsupportedFields = asAdminLogStringArray(detailObject?.extraFieldsRemoved);
  const schemaMissingFields =
    asAdminLogStringArray(detailObject?.requiredSchemaMissingColumns).length > 0
      ? asAdminLogStringArray(detailObject?.requiredSchemaMissingColumns)
      : asAdminLogStringArray(detailObject?.missingColumns);
  const payloadCount = Array.isArray(detailObject?.payload) ? detailObject?.payload.length : null;
  const syncCountMatch = entry.message.match(/Fetched (\d+) shared deals/i);
  const syncedCount = syncCountMatch?.[1] ?? null;

  if (entry.message === 'Deal extracted successfully' || entry.message === 'Coupon generated') {
    const missingSummary = missingOptionalFields.length > 0
      ? `Missing optional fields: ${formatAdminFieldList(missingOptionalFields)}.`
      : 'All key coupon fields are available.';
    const summaryParts = [
      merchant ? `Source merchant: ${merchant}.` : '',
      dealTitle ? `Product: ${dealTitle}.` : '',
      missingSummary,
    ].filter(Boolean);

    return {
      id: entry.id,
      title: missingOptionalFields.length > 0 ? 'Missing optional fields' : entry.message,
      summary: summaryParts.join(' '),
      timestamp: entry.timestamp,
      status: missingOptionalFields.length > 0 ? 'warning' : 'success',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message === 'Direct URL extraction failed') {
    return {
      id: entry.id,
      title: 'Deal extraction failed',
      summary: friendlyErrorReason || 'LiveDrop could not extract source data from the pasted URL.',
      timestamp: entry.timestamp,
      status: 'error',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message.startsWith('Fetched ')) {
    return {
      id: entry.id,
      title: 'Shared deals synced',
      summary: syncedCount
        ? `Loaded ${syncedCount} shared deal${syncedCount === '1' ? '' : 's'} from the backend.`
        : 'Shared deals were refreshed from the backend.',
      timestamp: entry.timestamp,
      status: 'success',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message === 'Force refreshed shared deals') {
    return null;
  }

  if (entry.message === 'Shared deals fetch failed' || entry.message === 'Force refresh failed') {
    const isConfigIssue = friendlyErrorReason.includes('Supabase is not connected');

    return {
      id: entry.id,
      title: isConfigIssue ? 'Shared sync unavailable' : 'Shared deals sync failed',
      summary: friendlyErrorReason || 'LiveDrop could not load shared deals from the backend.',
      timestamp: entry.timestamp,
      status: isConfigIssue ? 'warning' : 'error',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (
    entry.message.startsWith('Published deal "') ||
    entry.message.startsWith('Updated deal "') ||
    entry.message.startsWith('Updated engagement for "') ||
    entry.message.startsWith('Retry insert succeeded') ||
    entry.message.startsWith('Retry update succeeded')
  ) {
    return {
      id: entry.id,
      title: entry.message.startsWith('Updated engagement for "') ? 'Engagement synced' : 'Publish succeeded',
      summary: dealTitle
        ? (
            entry.message.startsWith('Updated engagement for "')
              ? `Likes, dislikes, and shares for "${dealTitle}" are now saved to shared deals.`
              : `"${dealTitle}" is now saved to shared deals.`
          )
        : (
            entry.message.startsWith('Updated engagement for "')
              ? 'Deal engagement was saved to shared deals.'
              : 'The deal was saved to shared deals successfully.'
          ),
      timestamp: entry.timestamp,
      status: 'success',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message === 'Shared deal publish failed' || entry.message === 'Shared deal update failed') {
    return {
      id: entry.id,
      title: 'Publish failed',
      summary: dealTitle
        ? `Could not save "${dealTitle}" to shared deals. ${friendlyErrorReason || 'Please retry once the backend issue is fixed.'}`
        : friendlyErrorReason || 'LiveDrop could not save the deal to shared deals.',
      timestamp: entry.timestamp,
      status: 'error',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message.startsWith('Bulk upserted ')) {
    return {
      id: entry.id,
      title: 'Shared deals synced',
      summary: payloadCount && payloadCount > 1
        ? `${payloadCount} deals were saved to the shared backend.`
        : 'Bulk deal changes were saved to the shared backend.',
      timestamp: entry.timestamp,
      status: 'success',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message === 'Bulk shared deal import failed') {
    return {
      id: entry.id,
      title: 'Publish failed',
      summary: friendlyErrorReason || 'Bulk deal import could not be saved to the shared backend.',
      timestamp: entry.timestamp,
      status: 'error',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message.startsWith('Deleted deal ')) {
    return {
      id: entry.id,
      title: 'Deal removed',
      summary: 'The deal was removed from the shared backend.',
      timestamp: entry.timestamp,
      status: 'success',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message === 'Shared deal delete failed') {
    return {
      id: entry.id,
      title: 'Delete failed',
      summary: friendlyErrorReason || 'LiveDrop could not remove the deal from the shared backend.',
      timestamp: entry.timestamp,
      status: 'error',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message.startsWith('Omitted unsupported ')) {
    return {
      id: entry.id,
      title: 'Missing optional fields',
      summary: unsupportedFields.length > 0
        ? `The shared backend skipped unsupported optional fields: ${formatAdminFieldList(unsupportedFields)}.`
        : 'The shared backend skipped a few optional fields that are not part of the current schema.',
      timestamp: entry.timestamp,
      status: 'warning',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message.startsWith('Failed to inspect ')) {
    return {
      id: entry.id,
      title: 'Shared schema check failed',
      summary: 'LiveDrop could not inspect the live shared-deals schema and switched to its local schema map for now.',
      timestamp: entry.timestamp,
      status: 'warning',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message.startsWith('Falling back to local ')) {
    return null;
  }

  if (entry.message.startsWith('Schema mismatch on ')) {
    return {
      id: entry.id,
      title: 'Publish failed',
      summary: schemaMissingFields.length > 0
        ? `The shared backend is missing required fields: ${formatAdminFieldList(schemaMissingFields)}.`
        : friendlyErrorReason || 'The shared backend schema does not match the app expectations.',
      timestamp: entry.timestamp,
      status: 'error',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message.startsWith('Using local fallback after shared ')) {
    return {
      id: entry.id,
      title: 'Publish failed',
      summary: friendlyErrorReason
        ? `The deal stayed local because the shared backend write failed: ${friendlyErrorReason}`
        : 'The deal stayed local because the shared backend write failed.',
      timestamp: entry.timestamp,
      status: 'error',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message.startsWith('Retry ') && entry.message.includes('failed')) {
    return {
      id: entry.id,
      title: 'Publish failed',
      summary: friendlyErrorReason || 'The retry could not save the deal to the shared backend.',
      timestamp: entry.timestamp,
      status: 'error',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message.startsWith('Schema mismatch on ')) {
    return {
      id: entry.id,
      title: 'Publish failed',
      summary: schemaMissingFields.length > 0
        ? `The shared backend is missing required fields: ${formatAdminFieldList(schemaMissingFields)}.`
        : errorReason || 'The shared backend schema does not match the app’s expected deal fields.',
      timestamp: entry.timestamp,
      status: 'error',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message.startsWith('Using local fallback after shared ')) {
    return {
      id: entry.id,
      title: 'Publish failed',
      summary: errorReason
        ? `The deal stayed local because the shared backend write failed: ${errorReason}`
        : 'The deal stayed local because the shared backend write failed.',
      timestamp: entry.timestamp,
      status: 'error',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.message.startsWith('Retry ') && entry.message.includes('failed')) {
    return {
      id: entry.id,
      title: 'Publish failed',
      summary: errorReason || 'The retry could not save the deal to the shared backend.',
      timestamp: entry.timestamp,
      status: 'error',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  if (entry.level === 'error') {
    return {
      id: entry.id,
      title: 'Backend action failed',
      summary: friendlyErrorReason || entry.message,
      timestamp: entry.timestamp,
      status: 'error',
      rawMessage: entry.message,
      rawDetail: entry.detail,
    };
  }

  return {
    id: entry.id,
    title: entry.message,
    summary:
      asAdminLogString(detailObject?.message) ||
      (entry.detail && !entry.detail.trim().startsWith('{') ? entry.detail : 'Shared backend activity was recorded.'),
    timestamp: entry.timestamp,
    status: 'success',
    rawMessage: entry.message,
    rawDetail: entry.detail,
  };
};

const sanitizeDealRowForPublish = (
  row: DealRow,
  allowedFields: ReadonlyArray<string> = PUBLIC_DEALS_SCHEMA_FIELDS,
) => {
  const sanitizedFieldNames = allowedFields.filter((field): field is keyof DealRow =>
    PUBLIC_DEALS_SCHEMA_FIELD_SET.has(field),
  );
  const sanitized = Object.fromEntries(
    sanitizedFieldNames.map((field) => [field, row[field]]),
  ) as DealPublishPayload;
  const extraFieldsRemoved = Object.keys(row).filter((field) => !sanitizedFieldNames.includes(field as keyof DealRow));

  return {
    payload: sanitized,
    extraFieldsRemoved,
  };
};

const extractMissingDealColumns = (error: unknown) => {
  const haystacks: string[] = [];

  if (error instanceof Error) {
    haystacks.push(error.message);
  }

  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>;
    if (typeof errorRecord.message === 'string') haystacks.push(errorRecord.message);
    if (typeof errorRecord.details === 'string') haystacks.push(errorRecord.details);
    if (typeof errorRecord.hint === 'string') haystacks.push(errorRecord.hint);
  }

  const patterns = [
    /column ['"]?([a-z0-9_]+)['"]? of relation ['"]?[a-z0-9_]+['"]? does not exist/gi,
    /Could not find the ['"]([a-z0-9_]+)['"] column of ['"][a-z0-9_]+['"] in the schema cache/gi,
    /schema cache.*column ['"]([a-z0-9_]+)['"]/gi,
  ];

  const matches = new Set<string>();
  haystacks.forEach((value) => {
    patterns.forEach((pattern) => {
      for (const match of value.matchAll(pattern)) {
        if (match[1]) {
          matches.add(match[1]);
        }
      }
    });
  });

  return Array.from(matches);
};

const getSupabaseErrorContext = (error: unknown) => {
  const baseMessage =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown backend error';
  const errorRecord = error && typeof error === 'object'
    ? (error as Record<string, unknown>)
    : null;
  const explicitMissingColumns =
    errorRecord && Array.isArray(errorRecord.missingColumns)
      ? errorRecord.missingColumns.filter((value): value is string => typeof value === 'string')
      : [];
  const missingColumns = explicitMissingColumns.length > 0
    ? explicitMissingColumns
    : extractMissingDealColumns(error);

  if (!error || typeof error !== 'object') {
    return {
      code: null,
      message: baseMessage,
      details: null,
      hint: null,
      missingColumns,
      reason: missingColumns.length
        ? `${baseMessage} | Missing columns: ${missingColumns.join(', ')}`
        : baseMessage,
    };
  }

  const code = typeof errorRecord?.code === 'string' ? errorRecord.code : null;
  const message = typeof errorRecord?.message === 'string' ? errorRecord.message : baseMessage;
  const details = typeof errorRecord?.details === 'string' ? errorRecord.details : null;
  const hint = typeof errorRecord?.hint === 'string' ? errorRecord.hint : null;

  return {
    code,
    message,
    details,
    hint,
    missingColumns,
    reason: [
      code ? `Code ${code}` : null,
      message,
      details,
      hint,
      missingColumns.length ? `Missing columns: ${missingColumns.join(', ')}` : null,
    ].filter(Boolean).join(' | '),
  };
};

const buildSharedWriteLogDetail = (options: {
  operation: 'insert' | 'update' | 'upsert' | 'delete' | 'select' | 'bulk-upsert';
  payload?: DealPublishPayload | DealPublishPayload[];
  extraFieldsRemoved?: string[];
  schemaColumns?: string[];
  schemaSource?: 'rpc' | 'local-fallback';
  payloadKeys?: string[];
  missingColumns?: string[];
  requiredSchemaMissingColumns?: string[];
  error?: unknown;
}) =>
  formatAdminLogDetail({
    projectUrl: resolvedSupabaseUrl || '(missing VITE_SUPABASE_URL)',
    schema: DEALS_SCHEMA,
    table: DEALS_TABLE,
    operation: options.operation,
    extraFieldsRemoved: options.extraFieldsRemoved ?? [],
    schemaColumns: options.schemaColumns ?? [],
    schemaSource: options.schemaSource ?? 'rpc',
    payloadKeys: options.payloadKeys ?? [],
    missingColumns: options.missingColumns ?? [],
    requiredSchemaMissingColumns: options.requiredSchemaMissingColumns ?? [],
    payload: options.payload,
    error: options.error ? getSupabaseErrorContext(options.error) : null,
  });

const parseBulkImportDeals = (input: string): BulkImportDealInput[] => {
  const candidate = JSON.parse(input);

  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Import must be a JSON deal object or an array of deal objects.');
  }

  const rawDeals = Array.isArray(candidate) ? candidate : [candidate];

  if (rawDeals.length === 0) {
    throw new Error('Import JSON is empty.');
  }

  return rawDeals.map((item, index) => {
    if (
      !item ||
      typeof item.businessName !== 'string' ||
      typeof item.title !== 'string' ||
      typeof item.description !== 'string' ||
      typeof item.offerText !== 'string'
    ) {
      throw new Error(`Deal at index ${index} is missing required fields.`);
    }

    return normalizeImportedDealInput({
      businessName: item.businessName.trim(),
      title: item.title.trim(),
      description: item.description.trim(),
      category: typeof item.category === 'string' ? item.category.trim() : '',
      offerText: item.offerText.trim(),
      originalPrice:
        Number.isFinite(item.originalPrice) && Number(item.originalPrice) >= 0
          ? Number(item.originalPrice)
          : undefined,
      price:
        Number.isFinite(item.price) && Number(item.price) >= 0
          ? Number(item.price)
          : undefined,
      currentPrice:
        Number.isFinite(item.currentPrice) && Number(item.currentPrice) >= 0
          ? Number(item.currentPrice)
          : undefined,
      discountAmount:
        Number.isFinite(item.discountAmount) && Number(item.discountAmount) >= 0
          ? Number(item.discountAmount)
          : undefined,
      discountPercent:
        Number.isFinite(item.discountPercent) && Number(item.discountPercent) >= 0
          ? Number(item.discountPercent)
          : undefined,
      affiliateUrl: typeof item.affiliateUrl === 'string' ? item.affiliateUrl.trim() : undefined,
      rating:
        Number.isFinite(item.rating) && Number(item.rating) >= 0
          ? Number(item.rating)
          : undefined,
      reviewCount:
        Number.isFinite(item.reviewCount) && Number(item.reviewCount) >= 0
          ? Number(item.reviewCount)
          : undefined,
      merchant: typeof item.merchant === 'string' ? item.merchant.trim() : undefined,
      brand: typeof item.brand === 'string' ? item.brand.trim() : undefined,
      asin: typeof item.asin === 'string' ? item.asin.trim() : undefined,
      shippingInfo: typeof item.shippingInfo === 'string' ? item.shippingInfo.trim() : undefined,
      summary: typeof item.summary === 'string' ? item.summary.trim() : undefined,
      tags: Array.isArray(item.tags)
        ? item.tags.filter((tag) => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)
        : undefined,
      sourceType:
        item.sourceType === 'keyword' || item.sourceType === 'url'
          ? item.sourceType
          : undefined,
      sourceQuery: typeof item.sourceQuery === 'string' ? item.sourceQuery.trim() : undefined,
      sourceProductUrl: typeof item.sourceProductUrl === 'string' ? item.sourceProductUrl.trim() : undefined,
      maxPriceMatched: typeof item.maxPriceMatched === 'boolean' ? item.maxPriceMatched : undefined,
      stockStatus: typeof item.stockStatus === 'string' ? item.stockStatus.trim() : undefined,
      availability: typeof item.availability === 'string' ? item.availability.trim() : undefined,
      imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl.trim() : undefined,
      galleryImages: Array.isArray(item.galleryImages)
        ? item.galleryImages.filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean)
        : undefined,
      productLink: typeof item.productLink === 'string' ? item.productLink.trim() : undefined,
      productUrl: typeof item.productUrl === 'string' ? item.productUrl.trim() : undefined,
      websiteUrl: typeof item.websiteUrl === 'string' ? item.websiteUrl.trim() : undefined,
      durationMinutes:
        Number.isFinite(item.durationMinutes) && Number(item.durationMinutes) > 0
          ? Number(item.durationMinutes)
          : undefined,
      claimCount:
        Number.isFinite(item.claimCount) && Number(item.claimCount) >= 0
          ? Number(item.claimCount)
          : undefined,
      maxClaims:
        Number.isFinite(item.maxClaims) && Number(item.maxClaims) > 0
          ? Number(item.maxClaims)
          : undefined,
      isOnline: typeof item.isOnline === 'boolean' ? item.isOnline : undefined,
      couponText: typeof item.couponText === 'string' ? item.couponText.trim() : undefined,
      couponType:
        item.couponType === 'percent' || item.couponType === 'fixed' || item.couponType === 'text'
          ? item.couponType
          : undefined,
      couponValue:
        Number.isFinite(item.couponValue) && Number(item.couponValue) >= 0
          ? Number(item.couponValue)
          : undefined,
      seller: typeof item.seller === 'string' ? item.seller.trim() : undefined,
      featureBullets: Array.isArray(item.featureBullets)
        ? item.featureBullets.filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean)
        : undefined,
      importedAt: typeof item.importedAt === 'string' ? item.importedAt.trim() : undefined,
      sourceProvider: typeof item.sourceProvider === 'string' ? item.sourceProvider.trim() : undefined,
    })!;
  });
};

export default function App() {
  const [currentView, setCurrentView] = useState<View>('live-deals');
  const [routePath, setRoutePath] = useState(() =>
    typeof window !== 'undefined' ? normalizeRoutePath(window.location.pathname) : '/',
  );
  const [role, setRole] = useState<UserRole>('customer');
  const [deals, setRawDeals] = useState<Deal[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [catalogCoupons, setCatalogCoupons] = useState<CatalogCoupon[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [selectedDetailDealId, setSelectedDetailDealId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [dealDraft, setDealDraft] = useState<Deal | null>(null);
  const [portalFieldSnapshot, setPortalFieldSnapshot] = useState<Deal | null>(null);
  const [pendingPortalAutofill, setPendingPortalAutofill] = useState<{
    requestId: number;
    normalizedDeal: BulkImportDealInput;
    mappedPayload: PortalAutofillPayload;
  } | null>(null);
  const [portalAutofillRequest, setPortalAutofillRequest] = useState<PortalAutofillRequest | null>(null);
  const [portalAutofillStatus, setPortalAutofillStatus] = useState<PortalAutofillStatus>({
    state: 'idle',
    attempted: false,
    message: '',
    failureReason: '',
  });
  const [userLocation, setUserLocation] = useState<UserLocation>(DEFAULT_LOCATION);
  const [radius, setRadius] = useState<number>(5);
  const [hiddenDealIds, setHiddenDealIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    return readHiddenDealIds();
  });
  const hiddenDealIdsRef = useRef(hiddenDealIds);
  const [deletingDealIds, setDeletingDealIds] = useState<Set<string>>(new Set());
  const setDeals = (value: React.SetStateAction<Deal[]>) => {
    setRawDeals((previousDeals) => {
      const resolvedDeals = typeof value === 'function'
        ? (value as (currentDeals: Deal[]) => Deal[])(previousDeals)
        : value;

      const sanitizedDeals = sanitizeDealsCollection(Array.isArray(resolvedDeals) ? resolvedDeals : []);
      return sanitizedDeals.filter((deal) => !hiddenDealIdsRef.current.has(deal.id));
    });
  };
  const selectedDetailDeal = useMemo(
    () => deals.find((deal) => deal.id === selectedDetailDealId) ?? null,
    [deals, selectedDetailDealId],
  );
  const [dropMode, setDropMode] = useState<'local' | 'online'>('local');
  const [dropModeEnabled, setDropModeEnabled] = useState(false);
  const [dropModeShuffleSeed, setDropModeShuffleSeed] = useState<number>(() => Date.now());
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedLocalSubcategory, setSelectedLocalSubcategory] = useState<string>('All');
  const [selectedOnlineSubcategory, setSelectedOnlineSubcategory] = useState<string>('All');
  const [onlineCategoryPage, setOnlineCategoryPage] = useState(0);
  const [claimsFilter, setClaimsFilter] = useState<'all' | 'pending' | 'completed' | 'expired'>('all');
  const [selectedFeedFilter, setSelectedFeedFilter] = useState<'all' | 'trending' | 'ending-soon' | 'just-dropped'>('all');
  const [desktopSearchQuery, setDesktopSearchQuery] = useState('');
  const [locationStatus, setLocationStatus] = useState<'loading' | 'success' | 'denied' | 'error'>('loading');
  const [cityName, setCityName] = useState<string>('');
  const [showDebug, setShowDebug] = useState(false);
  const [claimCopyStatus, setClaimCopyStatus] = useState<Record<string, ClipboardCopyResult | null>>({});
  const [catalogDropWarnings, setCatalogDropWarnings] = useState<string[]>([]);
  const [catalogSaveFeedback, setCatalogSaveFeedback] = useState<Record<string, string | null>>({});
  const [dealEngagementPending, setDealEngagementPending] = useState<Record<string, DealEngagementAction | null>>({});
  const [viewedDealIds, setViewedDealIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    const stored = window.localStorage.getItem('livedrop_viewed_deals');
    if (!stored) return new Set();
    try {
      return new Set(JSON.parse(stored));
    } catch {
      return new Set();
    }
  });
  const [isMoreDealsAnimating, setIsMoreDealsAnimating] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toastNotifications, setToastNotifications] = useState<AppNotification[]>([]);
  const seenDealIdsRef = useRef<Set<string>>(new Set());
  const latestDealsRef = useRef<Deal[]>([]);
  const latestClaimsRef = useRef<Claim[]>([]);
  const latestUserLocationRef = useRef<UserLocation>(DEFAULT_LOCATION);
  const latestHasPreciseLocationRef = useRef(false);
  const dealEngagementLocksRef = useRef<Set<string>>(new Set());
  const recentExternalActionRef = useRef<{ key: string; at: number } | null>(null);
  const locationRequestIdRef = useRef(0);
  const reverseGeocodeRequestIdRef = useRef(0);
  const [portalSuccessMessage, setPortalSuccessMessage] = useState<string>('');
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authInfo, setAuthInfo] = useState('');
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [dealsError, setDealsError] = useState('');
  const [lastSharedPublishFailure, setLastSharedPublishFailure] = useState<SharedPublishFailure | null>(null);
  const [retryingSharedPublish, setRetryingSharedPublish] = useState(false);
  const [bulkImportJson, setBulkImportJson] = useState('');
  const [bulkImportLoading, setBulkImportLoading] = useState(false);
  const [bulkImportMessage, setBulkImportMessage] = useState('');
  const [bulkImportError, setBulkImportError] = useState('');
  const [bulkImportCandidates, setBulkImportCandidates] = useState<BulkImportDealInput[]>([]);
  const [selectedBulkImportIndex, setSelectedBulkImportIndex] = useState(0);
  const [aiFinderKeyword, setAiFinderKeyword] = useState('');
  const [aiFinderUrl, setAiFinderUrl] = useState('');
  const [aiFinderAffiliateUrl, setAiFinderAffiliateUrl] = useState('');
  const [aiFinderMerchant, setAiFinderMerchant] = useState('Any');
  const [aiFinderCategory, setAiFinderCategory] = useState('Tech');
  const [aiFinderMaxPrice, setAiFinderMaxPrice] = useState('');
  const [aiFinderMinDiscount, setAiFinderMinDiscount] = useState('');
  const [aiFinderLoading, setAiFinderLoading] = useState(false);
  const [aiFinderError, setAiFinderError] = useState('');
  const [aiFinderMessage, setAiFinderMessage] = useState('');
  const [aiFinderStage, setAiFinderStage] = useState<AIDealFinderStage>('idle');
  const [aiFinderResult, setAiFinderResult] = useState<AIDealFinderResult | null>(null);
  const [aiFinderCandidates, setAiFinderCandidates] = useState<AIDealFinderCandidate[]>([]);
  const [aiFinderSearchSnapshot, setAiFinderSearchSnapshot] = useState<AIDealFinderResult | null>(null);
  useEffect(() => {
    hiddenDealIdsRef.current = hiddenDealIds;
  }, [hiddenDealIds]);
  const [selectedAIFinderUrl, setSelectedAIFinderUrl] = useState('');
  const [aiFinderUseDirectUrlFallback, setAiFinderUseDirectUrlFallback] = useState(false);
  const [showSearchMeter, setShowSearchMeter] = useState(false);
  const [aiFinderRuntime, setAiFinderRuntime] = useState<AIDealFinderRuntimeState>({
    requestSent: false,
    responseReceived: false,
    actualQuery: '',
    currentAction: 'idle',
    lastError: '',
  });
  const [adminAccessError, setAdminAccessError] = useState('');
  const [adminLogs, setAdminLogs] = useState<AdminLogEntry[]>([]);
  const [showAdvancedBackendLogs, setShowAdvancedBackendLogs] = useState(false);
  const [adminDealsView, setAdminDealsView] = useState<'local' | 'online'>(() => {
    if (typeof window === 'undefined') return 'local';
    const stored = window.localStorage.getItem('livedrop_admin_deals_view');
    return stored === 'online' ? 'online' : 'local';
  });
  const [adminSessionEmail, setAdminSessionEmail] = useState<string | null>(() => readAdminSessionEmail());
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [hasUnsavedFormChanges, setHasUnsavedFormChanges] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>(LOCAL_ADMIN_MODE ? 'active' : 'inactive');
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null);
  const [subscriptionMessage, setSubscriptionMessage] = useState('');
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const aiFinderFieldCoverageRef = useRef<HTMLDivElement | null>(null);
  const aiFinderUrlInputRef = useRef<HTMLInputElement | null>(null);
  const cloudHydratedRef = useRef(false);
  const dealsSchemaColumnsCacheRef = useRef<{ columns: string[]; fetchedAt: number } | null>(null);
  const previousRoutePathRef = useRef(routePath);
  const isBusinessSubscribed = role === 'business' && subscriptionStatus === 'active';
  const hasPortalAccess = LOCAL_ADMIN_MODE || isBusinessSubscribed;
  const isAdminRoute = routePath === '/admin';
  const isDashboardRoute = routePath === '/dashboard';
  const hasPreciseUserLocation = hasUsableUserLocation(userLocation);
  const locationDisplayName =
    locationStatus === 'loading' && !hasPreciseUserLocation
      ? 'Locating...'
      : locationStatus === 'denied' && !hasPreciseUserLocation
        ? 'Location access denied'
        : locationStatus === 'error' && !hasPreciseUserLocation
          ? 'Location unavailable'
          : (cityName || 'Current area');

  useEffect(() => {
    latestUserLocationRef.current = userLocation;
    latestHasPreciseLocationRef.current = hasPreciseUserLocation;
  }, [hasPreciseUserLocation, userLocation]);
  const adminEmail = (adminSessionEmail ?? authUser?.email ?? '').toLowerCase();
  const hasAdminAccess = adminEmail === APPROVED_ADMIN_EMAIL;
  const adminDisplayName = (() => {
    const metadataName =
      typeof authUser?.user_metadata?.full_name === 'string'
        ? authUser.user_metadata.full_name.trim()
        : '';
    if (metadataName) return metadataName;
    return (authUser?.email ?? adminSessionEmail ?? '').trim();
  })();
  const adminStatusLabel = adminDisplayName || 'Admin';
  const selectedAIFinderCandidate = useMemo(
    () =>
      aiFinderCandidates.find((candidate) => candidate.url === selectedAIFinderUrl)
      ?? aiFinderSearchSnapshot?.searchCandidates?.find((candidate) => candidate.url === selectedAIFinderUrl)
      ?? null,
    [aiFinderCandidates, aiFinderSearchSnapshot?.searchCandidates, selectedAIFinderUrl],
  );
  const adminActivityCards = useMemo(
    () => adminLogs
      .map((entry) => summarizeAdminLogEntry(entry))
      .filter((entry): entry is AdminActivityCard => Boolean(entry)),
    [adminLogs],
  );
  const aiFinderSourceValidation = useMemo(
    () => validateDirectProductUrl(aiFinderUrl),
    [aiFinderUrl],
  );
  const aiFinderDirectUrl = aiFinderSourceValidation.url ?? '';
  const aiFinderHasDirectUrlFallback = aiFinderUseDirectUrlFallback && Boolean(aiFinderDirectUrl);
  const aiFinderSelectedSourceUrl = aiFinderDirectUrl;

  const getLocalCloudState = () => ({
    claims: readStoredClaims(),
    catalog_coupons: readStoredCatalog(),
    notifications: readStoredNotifications(),
    preferences: {
      radius,
      selectedCategory,
      selectedFeedFilter,
      role,
    },
  });

  const applyDealsState = (nextDeals: Deal[]) => {
    setDeals(nextDeals);
  };

  useEffect(() => {
    seenDealIdsRef.current = new Set(deals.map((deal) => deal.id));
    latestDealsRef.current = deals;
  }, [deals]);

  useEffect(() => {
    latestClaimsRef.current = claims;
  }, [claims]);

  useEffect(() => {
    setOnlineCategoryPage(0);
  }, [dropMode, selectedCategory, selectedFeedFilter]);

  useEffect(() => {
    if (dropMode !== 'local' || selectedCategory === 'All') {
      setSelectedLocalSubcategory('All');
      return;
    }

    const availableSubcategories = LOCAL_SUBCATEGORY_OPTIONS[selectedCategory] ?? [];
    if (!availableSubcategories.includes(selectedLocalSubcategory)) {
      setSelectedLocalSubcategory('All');
    }
  }, [dropMode, selectedCategory, selectedLocalSubcategory]);

  useEffect(() => {
    if (dropMode !== 'online') {
      setSelectedOnlineSubcategory('All');
      return;
    }

    const availableSubcategories =
      selectedCategory === 'Tech'
        ? ONLINE_TECH_SUBCATEGORY_OPTIONS
        : selectedCategory === 'Home'
          ? ONLINE_HOME_SUBCATEGORY_OPTIONS
          : selectedCategory === 'Fashion'
            ? ONLINE_FASHION_SUBCATEGORY_OPTIONS
            : ['All'];

    if (!availableSubcategories.includes(selectedOnlineSubcategory as (typeof availableSubcategories)[number])) {
      setSelectedOnlineSubcategory('All');
    }
  }, [dropMode, selectedCategory, selectedOnlineSubcategory]);

  useEffect(() => {
    if (currentView === 'deal-detail' && selectedDetailDealId && !selectedDetailDeal) {
      setCurrentView('live-deals');
      setSelectedDetailDealId(null);
    }
  }, [currentView, selectedDetailDeal, selectedDetailDealId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('livedrop_admin_deals_view', adminDealsView);
  }, [adminDealsView]);

  useEffect(() => {
    if (!pendingPortalAutofill || !portalFieldSnapshot) {
      return;
    }

    const livePortalValues = buildPortalAutofillPayload(portalFieldSnapshot);
    const expectedPortalValues = pendingPortalAutofill.mappedPayload;
    const finalCoverage = buildPortalFieldCoverage(portalFieldSnapshot);
    const fieldsChanged = Object.entries(expectedPortalValues).some(([key, value]) => {
      if (!value) return false;
      return livePortalValues[key as keyof PortalAutofillPayload] === value;
    });

    console.info('[LiveDrop] URL-to-deal pipeline trace', {
      stage2NormalizedDealObject: pendingPortalAutofill.normalizedDeal,
      stage3PortalFieldMapping: expectedPortalValues,
      stage4FormStateUpdate: livePortalValues,
    });

    if (fieldsChanged && finalCoverage.filled.length > 0) {
      const successMessage =
        finalCoverage.missingRequired.length === 0
          ? 'Portal form updated successfully.'
          : 'Portal form updated, but some required fields are still missing.';
      setAiFinderMessage(successMessage);
      setBulkImportMessage(successMessage);
      setAiFinderError('');
      setPortalAutofillStatus({
        state: 'success',
        attempted: true,
        message: successMessage,
        failureReason: '',
      });
    } else {
      const failureMessage = 'Portal mapping did not update the live form state.';
      setAiFinderError(failureMessage);
      setBulkImportError(failureMessage);
      setPortalAutofillStatus({
        state: 'failure',
        attempted: true,
        message: '',
        failureReason: failureMessage,
      });
    }

    setPortalAutofillRequest(null);
    setPendingPortalAutofill(null);
  }, [pendingPortalAutofill, portalFieldSnapshot]);

  const pushAdminLog = (level: 'info' | 'error', message: string, detail?: string) => {
    setAdminLogs((prev) => {
      const timestamp = Date.now();
      const latestEntry = prev[0];

      if (
        latestEntry &&
        latestEntry.level === level &&
        latestEntry.message === message &&
        latestEntry.detail === detail
      ) {
        return [
          {
            ...latestEntry,
            timestamp,
          },
          ...prev.slice(1),
        ];
      }

      return [
        {
          id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
          level,
          message,
          detail,
          timestamp,
        },
        ...prev,
      ].slice(0, 20);
    });
  };

  const getDealsTableClient = () => {
    if (!supabase || !hasSupabaseConfig) {
      throw new Error(supabaseConfigIssue || 'Supabase connection is unavailable.');
    }

    return supabase.schema(DEALS_SCHEMA).from(DEALS_TABLE);
  };

  const fetchDealsSchemaColumns = async (forceRefresh = false) => {
    if (!supabase || !hasSupabaseConfig) {
      throw new Error(supabaseConfigIssue || 'Supabase connection is unavailable.');
    }

    const cached = dealsSchemaColumnsCacheRef.current;
    if (!forceRefresh && cached && Date.now() - cached.fetchedAt < 60_000) {
      return {
        columns: cached.columns,
        source: 'rpc' as const,
      };
    }

    const { data, error } = await supabase.rpc('get_deals_schema_columns');

    if (error) {
      console.error('[LiveDrop] Failed to fetch public.deals schema columns', {
        projectUrl: resolvedSupabaseUrl,
        schema: DEALS_SCHEMA,
        table: DEALS_TABLE,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      pushAdminLog('error', `Failed to inspect ${DEALS_SCHEMA}.${DEALS_TABLE} schema`, buildSharedWriteLogDetail({
        operation: 'select',
        error,
      }));
      pushAdminLog('info', `Falling back to local ${DEALS_SCHEMA}.${DEALS_TABLE} schema fields`, buildSharedWriteLogDetail({
        operation: 'select',
        schemaColumns: [...PUBLIC_DEALS_SCHEMA_FIELDS],
        schemaSource: 'local-fallback',
      }));
      return {
        columns: [...PUBLIC_DEALS_SCHEMA_FIELDS],
        source: 'local-fallback' as const,
      };
    }

    const schemaColumns = (data ?? [])
      .map((row) => (typeof row?.column_name === 'string' ? row.column_name : ''))
      .filter(Boolean);

    dealsSchemaColumnsCacheRef.current = {
      columns: schemaColumns,
      fetchedAt: Date.now(),
    };

    return {
      columns: schemaColumns,
      source: 'rpc' as const,
    };
  };

  const runDealsPayloadPreflight = async (
    row: DealRow,
    operation: 'insert' | 'update' | 'upsert' | 'bulk-upsert',
  ): Promise<DealsSchemaPreflightResult> => {
    const { columns: schemaColumns, source: schemaSource } = await fetchDealsSchemaColumns();
    const { payload, extraFieldsRemoved } = sanitizeDealRowForPublish(row, schemaColumns);
    const payloadKeys = Object.keys(payload);
    const missingColumns = PUBLIC_DEALS_SCHEMA_FIELDS.filter(
      (field) => !schemaColumns.includes(field) && Object.prototype.hasOwnProperty.call(row, field),
    );
    const requiredSchemaMissingColumns = REQUIRED_PUBLIC_DEALS_SCHEMA_FIELDS.filter(
      (field) => !schemaColumns.includes(field),
    );

    const logDetail = buildSharedWriteLogDetail({
      operation,
      payload,
      extraFieldsRemoved,
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
      requiredSchemaMissingColumns,
    });

    pushAdminLog('info', `Preflight checked ${DEALS_SCHEMA}.${DEALS_TABLE} ${operation} payload`, logDetail);

    if (missingColumns.length > 0) {
      pushAdminLog(
        'info',
        `Omitted unsupported ${DEALS_SCHEMA}.${DEALS_TABLE} columns from ${operation} payload`,
        buildSharedWriteLogDetail({
          operation,
          payload,
          extraFieldsRemoved,
          schemaColumns,
          schemaSource,
          payloadKeys,
          missingColumns,
          requiredSchemaMissingColumns,
        }),
      );
    }

    if (requiredSchemaMissingColumns.length > 0) {
      const preflightError = Object.assign(
        new Error(`Schema mismatch on ${DEALS_SCHEMA}.${DEALS_TABLE}. Required columns missing: ${requiredSchemaMissingColumns.join(', ')}`),
        {
          code: 'SCHEMA_MISMATCH',
          details: `Required columns not present in ${DEALS_SCHEMA}.${DEALS_TABLE}: ${requiredSchemaMissingColumns.join(', ')}`,
          hint: 'Apply the latest supabase/schema.sql migration before retrying publish.',
          missingColumns: requiredSchemaMissingColumns,
          payloadKeys,
          schemaColumns,
          omittedColumns: missingColumns,
        },
      );

      pushAdminLog('error', `Preflight blocked ${operation} on ${DEALS_SCHEMA}.${DEALS_TABLE}`, logDetail);
      throw preflightError;
    }

    return {
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
      requiredSchemaMissingColumns,
      extraFieldsRemoved,
      payload,
    };
  };

  const createSharedPublishFailure = (
    deal: Deal,
    mode: 'insert' | 'update',
    error: unknown,
  ): SharedPublishFailure => {
    const { payload } = sanitizeDealRowForPublish(mapDealToDealRow(deal, authUser?.id ?? null));
    const errorContext = getSupabaseErrorContext(error);

    return {
      deal,
      mode,
      payload,
      projectUrl: resolvedSupabaseUrl || '(missing VITE_SUPABASE_URL)',
      schema: DEALS_SCHEMA,
      table: DEALS_TABLE,
      reason: errorContext.reason,
      errorCode: errorContext.code,
      errorDetails: errorContext.details,
      errorHint: errorContext.hint,
      missingColumns: errorContext.missingColumns,
      occurredAt: Date.now(),
    };
  };

  const logMissingDealColumns = (error: unknown) => {
    const { missingColumns } = getSupabaseErrorContext(error);

    if (missingColumns.length === 0) {
      return;
    }

    pushAdminLog(
      'error',
      `Schema mismatch on ${DEALS_SCHEMA}.${DEALS_TABLE}`,
      `Missing columns: ${missingColumns.join(', ')}`,
    );
  };

  const dedupeAIFinderQueries = (queries: string[]) => {
    const seen = new Set<string>();
    return queries.filter((query) => {
      const normalized = query.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  };

  const buildAIFinderQueries = (options: {
    keyword?: string;
    url?: string;
    merchant?: string | null;
    category?: string | null;
    maxPrice?: number | null;
    minDiscount?: number | null;
  }) => {
    const keyword = options.keyword?.trim() ?? '';
    const directUrl = options.url?.trim() ?? '';
    if (directUrl) return [directUrl];

    const merchant = options.merchant?.trim() || '';
    const priceConstraint = options.maxPrice ? `under $${options.maxPrice}` : '';
    const discountConstraint = options.minDiscount ? `${options.minDiscount}% off` : '';
    const queries = [
      [keyword, 'buy', 'price', priceConstraint, discountConstraint].filter(Boolean).join(' '),
      [keyword, merchant || 'Amazon'].filter(Boolean).join(' '),
      [keyword, 'deal'].filter(Boolean).join(' '),
      ['buy', keyword, 'online'].filter(Boolean).join(' '),
      [keyword, 'product'].filter(Boolean).join(' '),
    ];

    return dedupeAIFinderQueries(queries).slice(0, 5);
  };

  const createEmptyAIFinderSnapshot = (overrides?: Partial<AIDealFinderResult>): AIDealFinderResult => ({
    normalizedDeal: {
      businessName: '',
      title: '',
      description: '',
      category: '',
      offerText: '',
      isOnline: true,
    },
    generatedJson: '',
    missingFields: [],
    dealScore: 0,
    rawResults: [],
    searchCandidates: [],
    validProductCandidates: [],
    rejectedCandidates: [],
    ...overrides,
  });

  const selectAIFinderResult = (
    candidate: AIDealFinderCandidate,
    options?: {
      clearGeneratedResult?: boolean;
      message?: string;
    },
  ) => {
    setSelectedAIFinderUrl(candidate.url);
    setAiFinderUrl(candidate.url);
    setAiFinderUseDirectUrlFallback(false);
    setAiFinderStage('result-selected');
    setAiFinderError('');
    setAiFinderMessage(options?.message ?? 'Result selected. Generate coupon fields when you are ready.');
    if (options?.clearGeneratedResult !== false) {
      setAiFinderResult(null);
    }
  };

  const activateAIFinderDirectUrlFallback = () => {
    const directUrl = aiFinderDirectUrl;

    if (!directUrl) {
      const message = aiFinderSourceValidation.error || 'Paste a valid product URL in Advanced Filters to use the fallback path.';
      setAiFinderError(message);
      setAiFinderMessage("Tavily is a discovery tool. If search results are weak or empty, paste a specific product URL instead.");
      setShowSearchMeter(true);
      aiFinderUrlInputRef.current?.focus();
      return;
    }

    setSelectedAIFinderUrl('');
    setAiFinderUseDirectUrlFallback(true);
    setAiFinderStage('result-selected');
    setAiFinderResult(null);
    setAiFinderError('');
    setAiFinderMessage('Direct product URL selected as the fallback source. Generate coupon fields when you are ready.');
  };

  const ensureAIFinderSourceSelection = (overrideUrl?: string) => {
    const selectedSourceUrl = overrideUrl?.trim() || aiFinderUrl.trim() || '';
    const validation = validateDirectProductUrl(selectedSourceUrl);

    if (!validation.url) {
      const message = validation.error || 'Paste the full product page URL to continue.';
      console.warn('[LiveDrop] Invalid Quick Coupon Creator URL input', {
        attemptedValue: selectedSourceUrl,
        reason: message,
      });
      setAiFinderError(message);
      setAiFinderMessage('Quick Coupon Creator only works from a real source product URL.');
      return null;
    }

    return validation.url;
  };

  const navigateToPath = (path: string) => {
    if (typeof window === 'undefined') return;
    const nextPath = normalizeRoutePath(path);
    if (nextPath === routePath) {
      return;
    }

    setNotificationsOpen(false);
    console.info('[LiveDrop] Navigating', {
      from: routePath,
      to: nextPath,
      hasAdminAccess,
    });
    window.history.pushState({}, '', nextPath);
    setRoutePath(nextPath);
  };

  const resetAdminUiState = () => {
    console.info('[LiveDrop] Resetting admin-only UI state');
    setAdminAccessError('');
    setBulkImportError('');
    setBulkImportMessage('');
    setAiFinderError('');
    setAiFinderMessage('');
    setAiFinderStage('idle');
    setAiFinderResult(null);
    setAiFinderSearchSnapshot(null);
    setAiFinderCandidates([]);
    setSelectedAIFinderUrl('');
    setAiFinderUseDirectUrlFallback(false);
    setShowSearchMeter(false);
    setAiFinderRuntime({
      requestSent: false,
      responseReceived: false,
      actualQuery: '',
      currentAction: 'idle',
      lastError: '',
    });
    setPortalAutofillStatus({
      state: 'idle',
      attempted: false,
      message: '',
      failureReason: '',
    });
    setPortalAutofillRequest(null);
    setPendingPortalAutofill(null);
    setBulkImportCandidates([]);
    setSelectedBulkImportIndex(0);
    setEditingDealId(null);
    setDealDraft(null);
    setPortalFieldSnapshot(null);
    setIsCreating(false);
    setShowDebug(false);
    setShowAdvancedBackendLogs(false);
  };

  const handleReturnToPublicApp = () => {
    console.info('[LiveDrop] Public navigation flow', {
      routePath,
      isAdminRoute,
      hasAdminAccess,
      adminSessionEmail,
      userEmail: authUser?.email ?? null,
      currentView,
    });
    setAuthModalOpen(false);
    setAuthError('');
    setAuthInfo('');
    setAdminAccessError('');
    resetAdminUiState();
    setCurrentView('live-deals');
    navigateToPath('/');
  };

  const fetchSharedDeals = async () => {
    const includeAllStatuses = isAdminRoute && hasAdminAccess;
    console.info('[LiveDrop] Querying shared deals table:', `${DEALS_SCHEMA}.${DEALS_TABLE}`, {
      projectUrl: resolvedSupabaseUrl,
      includeAllStatuses,
    });

    const runSharedDealsQuery = async (options: { useStatusFilter: boolean; useCreatedAtSort: boolean }) => {
      let query = getDealsTableClient().select('*');
      if (options.useStatusFilter) {
        query = query.eq('status', 'active');
      }
      if (options.useCreatedAtSort) {
        query = query.order('created_at', { ascending: false });
      }
      return query;
    };

    let useStatusFilter = !includeAllStatuses;
    let useCreatedAtSort = true;

    let { data, error } = await runSharedDealsQuery({
      useStatusFilter,
      useCreatedAtSort,
    });

    if (error) {
      const missingColumns = extractMissingDealColumns(error);
      const needsStatusFallback = missingColumns.includes('status') && useStatusFilter;
      const needsCreatedAtFallback = missingColumns.includes('created_at') && useCreatedAtSort;

      if (needsStatusFallback || needsCreatedAtFallback) {
        if (needsStatusFallback) {
          useStatusFilter = false;
        }
        if (needsCreatedAtFallback) {
          useCreatedAtSort = false;
        }

        console.warn('[LiveDrop] Retrying shared deals fetch with legacy-compatible query', {
          projectUrl: resolvedSupabaseUrl,
          missingColumns,
          useStatusFilter,
          useCreatedAtSort,
        });

        pushAdminLog('warn', 'Shared deals fetch retried with legacy-compatible query', buildSharedWriteLogDetail({
          operation: 'select',
          error,
          missingColumns,
          payloadKeys: [
            useStatusFilter ? 'status-filter:on' : 'status-filter:off',
            useCreatedAtSort ? 'created_at-sort:on' : 'created_at-sort:off',
          ],
        }));

        const retryResult = await runSharedDealsQuery({
          useStatusFilter,
          useCreatedAtSort,
        });
        data = retryResult.data;
        error = retryResult.error;
      }
    }

    if (error) {
      console.error('[LiveDrop] Supabase deals query failed', {
        projectUrl: resolvedSupabaseUrl,
        schema: DEALS_SCHEMA,
        table: DEALS_TABLE,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      pushAdminLog('error', 'Shared deals fetch failed', buildSharedWriteLogDetail({
        operation: 'select',
        error,
      }));
      throw error;
    }

    pushAdminLog('info', `Fetched ${data?.length ?? 0} shared deals from Supabase`, buildSharedWriteLogDetail({
      operation: 'select',
    }));

    return (data ?? []).map((row) => mapDealRowToDeal(row as Partial<DealRow>));
  };

  const publishDealToBackend = async (deal: Deal) => {
    const { payload, extraFieldsRemoved, schemaColumns, schemaSource, payloadKeys, missingColumns } = await runDealsPayloadPreflight(
      mapDealToDealRow(deal, authUser?.id ?? null),
      'insert',
    );

    console.info('[LiveDrop] Publishing deal to shared backend', {
      projectUrl: resolvedSupabaseUrl,
      schema: DEALS_SCHEMA,
      table: DEALS_TABLE,
      operation: 'insert',
      extraFieldsRemoved,
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
      payload,
    });
    pushAdminLog('info', `Publishing "${deal.title}" to ${DEALS_SCHEMA}.${DEALS_TABLE}`, buildSharedWriteLogDetail({
      operation: 'insert',
      payload,
      extraFieldsRemoved,
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
    }));

    const { data, error } = await getDealsTableClient()
      .insert(payload)
      .select()
      .single();

    if (error) {
      logMissingDealColumns(error);
      console.error('[LiveDrop] Supabase deal insert failed', {
        projectUrl: resolvedSupabaseUrl,
        schema: DEALS_SCHEMA,
        table: DEALS_TABLE,
        payload,
        extraFieldsRemoved,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      pushAdminLog('error', 'Shared deal publish failed', buildSharedWriteLogDetail({
        operation: 'insert',
        payload,
        extraFieldsRemoved,
        schemaColumns,
        schemaSource,
        payloadKeys,
        missingColumns,
        error,
      }));
      throw error;
    }

    pushAdminLog('info', `Published deal "${deal.title}" to shared backend`, buildSharedWriteLogDetail({
      operation: 'insert',
      payload,
      extraFieldsRemoved,
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
    }));

    return mapDealRowToDeal(data as Partial<DealRow>, deal);
  };

  const publishDealsToBackend = async (inputDeals: Deal[]) => {
    const preparedPayload = await Promise.all(
      inputDeals.map((deal) =>
        runDealsPayloadPreflight(mapDealToDealRow(deal, authUser?.id ?? null), 'bulk-upsert'),
      ),
    );
    const payload = preparedPayload.map((entry) => entry.payload);
    const extraFieldsRemoved = preparedPayload.flatMap((entry) => entry.extraFieldsRemoved);
    const schemaColumns = preparedPayload[0]?.schemaColumns ?? [];
    const schemaSource = preparedPayload[0]?.schemaSource ?? 'local-fallback';
    const payloadKeys = preparedPayload[0]?.payloadKeys ?? [];
    const missingColumns = Array.from(new Set(preparedPayload.flatMap((entry) => entry.missingColumns)));

    console.info('[LiveDrop] Bulk publishing deals to shared backend', {
      projectUrl: resolvedSupabaseUrl,
      schema: DEALS_SCHEMA,
      table: DEALS_TABLE,
      operation: 'bulk-upsert',
      payloadCount: payload.length,
      extraFieldsRemoved,
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
      payload,
    });
    pushAdminLog('info', `Bulk publishing ${payload.length} deals to ${DEALS_SCHEMA}.${DEALS_TABLE}`, buildSharedWriteLogDetail({
      operation: 'bulk-upsert',
      payload,
      extraFieldsRemoved,
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
    }));

    const { data, error } = await getDealsTableClient()
      .upsert(payload, { onConflict: 'id' })
      .select();

    if (error) {
      logMissingDealColumns(error);
      console.error('[LiveDrop] Supabase bulk deal upsert failed', {
        projectUrl: resolvedSupabaseUrl,
        schema: DEALS_SCHEMA,
        table: DEALS_TABLE,
        payloadCount: payload.length,
        payload,
        extraFieldsRemoved,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      pushAdminLog('error', 'Bulk shared deal import failed', buildSharedWriteLogDetail({
        operation: 'bulk-upsert',
        payload,
        extraFieldsRemoved,
        schemaColumns,
        schemaSource,
        payloadKeys,
        missingColumns,
        error,
      }));
      throw error;
    }

    pushAdminLog('info', `Bulk upserted ${data?.length ?? inputDeals.length} deals to shared backend`, buildSharedWriteLogDetail({
      operation: 'bulk-upsert',
      payload,
      extraFieldsRemoved,
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
    }));

    const inputDealsById = new Map(inputDeals.map((deal) => [ensureUuid(deal.id), deal]));
    return (data ?? []).map((row) => {
      const fallbackDeal = inputDealsById.get(String((row as Partial<DealRow>).id ?? ''));
      return mapDealRowToDeal(row as Partial<DealRow>, fallbackDeal);
    });
  };

  const updateDealInBackend = async (deal: Deal) => {
    const { payload, extraFieldsRemoved, schemaColumns, schemaSource, payloadKeys, missingColumns } = await runDealsPayloadPreflight(
      mapDealToDealRow(deal, authUser?.id ?? null),
      'update',
    );

    console.info('[LiveDrop] Updating deal in shared backend', {
      projectUrl: resolvedSupabaseUrl,
      schema: DEALS_SCHEMA,
      table: DEALS_TABLE,
      operation: 'update',
      extraFieldsRemoved,
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
      payload,
    });
    pushAdminLog('info', `Updating "${deal.title}" in ${DEALS_SCHEMA}.${DEALS_TABLE}`, buildSharedWriteLogDetail({
      operation: 'update',
      payload,
      extraFieldsRemoved,
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
    }));

    const { data, error } = await getDealsTableClient()
      .update(payload)
      .eq('id', ensureUuid(deal.id))
      .select()
      .single();

    if (error) {
      logMissingDealColumns(error);
      console.error('[LiveDrop] Supabase deal update failed', {
        projectUrl: resolvedSupabaseUrl,
        schema: DEALS_SCHEMA,
        table: DEALS_TABLE,
        payload,
        extraFieldsRemoved,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      pushAdminLog('error', 'Shared deal update failed', buildSharedWriteLogDetail({
        operation: 'update',
        payload,
        extraFieldsRemoved,
        schemaColumns,
        schemaSource,
        payloadKeys,
        missingColumns,
        error,
      }));
      throw error;
    }

    pushAdminLog('info', `Updated deal "${deal.title}" in shared backend`, buildSharedWriteLogDetail({
      operation: 'update',
      payload,
      extraFieldsRemoved,
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
    }));
    return mapDealRowToDeal(data as Partial<DealRow>, deal);
  };

  const upsertDealInBackend = async (deal: Deal) => {
    const { payload, extraFieldsRemoved, schemaColumns, schemaSource, payloadKeys, missingColumns } = await runDealsPayloadPreflight(
      mapDealToDealRow(deal, authUser?.id ?? null),
      'upsert',
    );

    console.info('[LiveDrop] Upserting deal in shared backend', {
      projectUrl: resolvedSupabaseUrl,
      schema: DEALS_SCHEMA,
      table: DEALS_TABLE,
      operation: 'upsert',
      extraFieldsRemoved,
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
      payload,
    });
    pushAdminLog('info', `Updating engagement for "${deal.title}" in ${DEALS_SCHEMA}.${DEALS_TABLE}`, buildSharedWriteLogDetail({
      operation: 'upsert',
      payload,
      extraFieldsRemoved,
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
    }));

    const { data, error } = await getDealsTableClient()
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      logMissingDealColumns(error);
      console.error('[LiveDrop] Supabase deal upsert failed', {
        projectUrl: resolvedSupabaseUrl,
        schema: DEALS_SCHEMA,
        table: DEALS_TABLE,
        payload,
        extraFieldsRemoved,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      pushAdminLog('error', 'Shared deal update failed', buildSharedWriteLogDetail({
        operation: 'upsert',
        payload,
        extraFieldsRemoved,
        schemaColumns,
        schemaSource,
        payloadKeys,
        missingColumns,
        error,
      }));
      throw error;
    }

    pushAdminLog('info', `Updated engagement for "${deal.title}" in shared backend`, buildSharedWriteLogDetail({
      operation: 'upsert',
      payload,
      extraFieldsRemoved,
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
    }));

    return mapDealRowToDeal(data as Partial<DealRow>, deal);
  };

const deleteDealFromBackend = async (dealId: string) => {
  const { error } = await getDealsTableClient()
    .delete()
    .eq('id', ensureUuid(dealId));

    if (error) {
      console.error('[LiveDrop] Supabase deal delete failed', {
        projectUrl: resolvedSupabaseUrl,
        schema: DEALS_SCHEMA,
        table: DEALS_TABLE,
        dealId,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      pushAdminLog('error', 'Shared deal delete failed', buildSharedWriteLogDetail({
        operation: 'delete',
        error,
      }));
      throw error;
    }

    pushAdminLog('info', `Deleted deal ${dealId} from shared backend`, buildSharedWriteLogDetail({
      operation: 'delete',
    }));
  };

  const handleLoadBulkImportSample = () => {
    setBulkImportJson(BULK_IMPORT_SAMPLE);
    setBulkImportError('');
    setBulkImportMessage('Sample JSON loaded.');
    setBulkImportCandidates([]);
    setSelectedBulkImportIndex(0);
  };

  const extractAIDealFinderErrorMessage = async (error: unknown) => {
    const fallback =
      error instanceof Error ? error.message : 'Affiliate Deal Finder request failed.';

    try {
      if (error && typeof error === 'object' && 'context' in error) {
        const context = (error as { context?: Response }).context;
        if (context) {
          console.error('[LiveDrop] Affiliate Deal Finder HTTP error response', {
            status: context.status,
            statusText: context.statusText,
          });
          const payload = await context.clone().json().catch(() => null);
          const details = typeof payload?.details === 'string' ? payload.details : null;
          const stage = typeof payload?.stage === 'string' ? payload.stage : null;
          const structuredMessage =
            typeof payload?.error === 'string'
              ? payload.error
              : typeof payload?.message === 'string'
                ? payload.message
                : null;

          if (structuredMessage) {
            return [structuredMessage, details, stage ? `Stage: ${stage}` : null].filter(Boolean).join(' | ');
          }

          if (context.status === 404) {
            return `Could not find the ${AI_DEAL_FINDER_FUNCTION} Edge Function in this Supabase project. Deploy the function, then try again.`;
          }
        }
      }
    } catch (parseError) {
      console.warn('[LiveDrop] Failed to parse AI Deal Finder error payload', parseError);
    }

    if (fallback.includes('Failed to send a request to the Edge Function')) {
      return `Could not reach the ${AI_DEAL_FINDER_FUNCTION} Edge Function. Verify it is deployed and your Supabase project URL/API key are correct.`;
    }

    return fallback;
  };

  const runAIDealFinder = async (
    mode: 'extract' | 'generate' = 'extract',
    options?: {
      overrideUrl?: string;
    },
  ) => {
    const keyword = aiFinderKeyword.trim();
    const sourceUrlInput = options?.overrideUrl?.trim() || aiFinderUrl.trim();
    const affiliateTrackingValidation = validateAffiliateTrackingInput(aiFinderAffiliateUrl);
    const affiliateTrackingUrl = affiliateTrackingValidation.url;
    const sourceValidation = validateDirectProductUrl(sourceUrlInput);

    setAiFinderRuntime({
      requestSent: true,
      responseReceived: false,
      actualQuery: sourceUrlInput,
      currentAction: 'validating',
      lastError: '',
    });

    if (!supabaseEdgeClient || !hasSupabaseConfig) {
      const message = supabaseConfigIssue || 'Supabase is required for Affiliate Deal Finder.';
      setAiFinderError(message);
      setAiFinderRuntime((prev) => ({
        ...prev,
        currentAction: 'idle',
        lastError: message,
      }));
      throw new Error(message);
    }

    if (affiliateTrackingValidation.error) {
      setAiFinderError(affiliateTrackingValidation.error);
      setAiFinderMessage('Fix the affiliate / outbound link before continuing, or leave it blank.');
      setAiFinderRuntime((prev) => ({
        ...prev,
        currentAction: 'idle',
        lastError: affiliateTrackingValidation.error!,
      }));
      throw new Error(affiliateTrackingValidation.error);
    }

    if (!sourceValidation.url) {
      const message = sourceValidation.error || 'Paste the full product page URL to continue.';
      console.warn('[LiveDrop] Quick Coupon Creator validation blocked request', {
        attemptedValue: sourceUrlInput,
        mode,
        reason: message,
      });
      setAiFinderError(message);
      setAiFinderMessage('Quick Coupon Creator needs the full product page URL in the source field before it can import anything.');
      setAiFinderRuntime((prev) => ({
        ...prev,
        currentAction: 'idle',
        lastError: message,
      }));
      throw new Error(message);
    }

    const sourceUrl = sourceValidation.url;

    setAiFinderRuntime((prev) => ({
      ...prev,
      actualQuery: sourceUrl,
    }));

    setAiFinderLoading(true);
    setAiFinderError('');
    setAiFinderMessage(
      mode === 'extract'
        ? 'Source URL accepted. Starting extraction...'
        : 'Generating coupon fields from the source product URL...',
    );
    setAiFinderStage('searching');
    setAiFinderSearchSnapshot(null);
    setAiFinderCandidates([]);
    setSelectedAIFinderUrl('');
    setAiFinderUseDirectUrlFallback(false);

    const requestPayload = {
      phase: mode,
      keyword: keyword || undefined,
      url: sourceUrl,
      affiliateUrl: affiliateTrackingUrl || undefined,
    };

    try {
      setAiFinderRuntime((prev) => ({
        ...prev,
        currentAction: 'invoking edge function',
      }));

      console.info('[LiveDrop] Invoking direct URL deal extraction', {
        supabaseUrl: resolvedSupabaseUrl,
        hasSupabaseUrl: Boolean(resolvedSupabaseUrl),
        hasSupabaseAnonKey,
        functionName: AI_DEAL_FINDER_FUNCTION,
        mode,
        payload: requestPayload,
      });

      const { data, error } = await supabaseEdgeClient.functions.invoke(AI_DEAL_FINDER_FUNCTION, {
        body: requestPayload,
      });

      if (error) {
        const message = await extractAIDealFinderErrorMessage(error);
        pushAdminLog('error', 'Direct URL extraction failed', message);
        throw new Error(message);
      }

      if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
        throw new Error(data.error);
      }

      const result = data as AIDealFinderResult | null;
      if (!result?.normalizedDeal) {
        throw new Error('Direct URL extraction returned an incomplete response.');
      }

      const pipelineResult = finalizeAIDealPipelineResult(
        affiliateTrackingUrl
          ? applyAffiliateTrackingOverrideToResult(result, affiliateTrackingUrl)
          : result,
        {
          sourceUrl,
          affiliateUrl: affiliateTrackingUrl,
        },
      );

      setAiFinderRuntime((prev) => ({
        ...prev,
        responseReceived: true,
        currentAction: 'completed',
      }));
      setAiFinderResult(pipelineResult);

      if (mode === 'extract') {
        const extractionSucceeded = pipelineResult.extractionStatus === 'Extraction succeeded';
        setAiFinderStage(extractionSucceeded ? 'result-selected' : 'idle');
        setAiFinderMessage(
          extractionSucceeded
            ? 'Stage 1 complete. Source data was extracted and is ready for normalization.'
            : 'Stage 1 completed with partial data. Source and affiliate link fields were still mapped so you can continue to Generate Deal.',
        );
      } else {
        const extractionSucceeded = pipelineResult.extractionStatus === 'Extraction succeeded';
        const effectiveMappedForm = pipelineResult.mappedForm ?? buildFallbackMappedForm(pipelineResult.normalizedDeal);
        const effectiveValidationResult = pipelineResult.validationResult ?? buildFallbackValidationResult(pipelineResult);
        const hasBlockingMappedFields =
          (effectiveValidationResult?.missingRequiredFields.length ?? 0) > 0;
        const hasReviewWarnings =
          (effectiveValidationResult?.warnings.length ?? pipelineResult.missingFields.length ?? 0) > 0;
        setAiFinderStage('coupon-generated');
        setAiFinderMessage(
          hasBlockingMappedFields
            ? 'Deal JSON generated, but some required portal fields are still missing. Review the mapped values before autofill.'
            : extractionSucceeded && !hasReviewWarnings
            ? 'Stage 2 complete. A normalized deal object is ready for portal mapping.'
            : 'Deal JSON generated with partial source data. Review the mapped values before autofill.',
        );
        syncGeneratedDealToPortalFields(pipelineResult);
        setBulkImportMessage(
          extractionSucceeded
            ? 'Generated coupon JSON inserted into the portal intake box.'
            : 'Fallback coupon JSON inserted into the portal intake box. Add any missing source assets before publishing.',
        );
      }

      pushAdminLog(
        'info',
        mode === 'extract' ? 'Deal extracted successfully' : 'Coupon generated',
        formatAdminLogDetail({
          sourceMerchant:
            pipelineResult.normalizedDeal.merchant ??
            pipelineResult.normalizedDeal.businessName ??
            '',
          productTitle: pipelineResult.normalizedDeal.title ?? '',
          missingOptionalFields: pipelineResult.missingFields,
          extractionStatus: pipelineResult.extractionStatus ?? '',
          sourceUrl,
          affiliateUrl: affiliateTrackingUrl,
        }),
      );

      return pipelineResult;
    } catch (error) {
      const message = await extractAIDealFinderErrorMessage(error);
      setAiFinderError(message);
      setAiFinderMessage(mode === 'extract' ? 'Extraction failed.' : 'Coupon generation failed.');
      setAiFinderRuntime((prev) => ({
        ...prev,
        currentAction: 'idle',
        lastError: message,
      }));
      setAiFinderStage('idle');
      console.error('[LiveDrop] Direct URL intake failed', {
        supabaseUrl: resolvedSupabaseUrl,
        functionName: AI_DEAL_FINDER_FUNCTION,
        mode,
        sourceUrl,
        error,
        message,
      });
      throw error instanceof Error ? error : new Error(message);
    } finally {
      setAiFinderLoading(false);
    }
  };

  const handleExtractAIDeal = async () => {
    try {
      await runAIDealFinder('extract');
    } catch {
      // surfaced in UI state
    }
  };

  const handleSearchAIDeal = handleExtractAIDeal;

  const handleGenerateAIDealJson = async (overrideUrl?: string) => {
    const sourceUrl = ensureAIFinderSourceSelection(overrideUrl);
    if (!sourceUrl) return;

    try {
      const generatedResult = await runAIDealFinder('generate', { overrideUrl: sourceUrl });
      const portalReadyDeal = generatedResult.mappedForm?.draft ?? generatedResult.normalizedDeal;
      const mappedPortalPayload = generatedResult.mappedForm?.payload ?? mapNormalizedDealToPortalFormFields(portalReadyDeal);
      console.info('[LiveDrop] URL-to-deal pipeline trace', {
        stage1RawExtractionResult: generatedResult.scanResult ?? generatedResult.extractionDebug ?? null,
        stage2NormalizedDealObject: portalReadyDeal,
        stage3PortalFieldMapping: mappedPortalPayload,
      });
      const previewDealCard = createLivePreviewDealFromImport(portalReadyDeal);
      setDeals((prevDeals) => [previewDealCard, ...prevDeals]);
      openPortalWithAutofillPayload(mappedPortalPayload, portalReadyDeal, {
        serializedDeal: generatedResult.generatedJson || JSON.stringify(portalReadyDeal, null, 2),
        message: 'Generated deal mapped and applied to the Business Portal form.',
      });
    } catch (error) {
      console.error('[LiveDrop] AI Deal Finder JSON generation failed', error);
    }
  };

  const handleFillPortalFromAIDeal = async (overrideUrl?: string) => {
    const sourceUrl = ensureAIFinderSourceSelection(overrideUrl);
    if (!sourceUrl) return;

    const affiliateTrackingValidation = validateAffiliateTrackingInput(aiFinderAffiliateUrl);
    if (affiliateTrackingValidation.error) {
      setAiFinderError(affiliateTrackingValidation.error);
      return;
    }

    try {
      const result = aiFinderResult?.generatedJson
        ? aiFinderResult
        : await runAIDealFinder('generate', { overrideUrl: sourceUrl });
      const portalReadyResult = finalizeAIDealPipelineResult(
        affiliateTrackingValidation.url
          ? applyAffiliateTrackingOverrideToResult(result, affiliateTrackingValidation.url)
          : result,
        {
          sourceUrl,
          affiliateUrl: affiliateTrackingValidation.url ?? null,
        },
      );
      const portalReadyDeal = portalReadyResult.mappedForm?.draft ?? portalReadyResult.normalizedDeal;
      const mappedPortalPayload = portalReadyResult.mappedForm?.payload ?? mapNormalizedDealToPortalFormFields(portalReadyDeal);
      console.info('[LiveDrop] URL-to-deal pipeline trace', {
        stage1RawExtractionResult: portalReadyResult.scanResult ?? portalReadyResult.extractionDebug ?? null,
        stage2NormalizedDealObject: portalReadyDeal,
        stage3PortalFieldMapping: mappedPortalPayload,
      });
      const previewDealCard = createLivePreviewDealFromImport(portalReadyDeal);
      setDeals((prevDeals) => [previewDealCard, ...prevDeals]);
      openPortalWithAutofillPayload(mappedPortalPayload, portalReadyDeal, {
        serializedDeal: portalReadyResult.generatedJson || JSON.stringify(portalReadyDeal, null, 2),
        message: 'Applying normalized deal data to the Business Portal form...',
      });
    } catch (error) {
      console.error('[LiveDrop] AI Deal Finder portal fill failed', error);
    }
  };

  const handleFillTestCoupon = () => {
    const normalizedDeal: BulkImportDealInput = {
      businessName: TEST_COUPON_AUTOFILL.storeName,
      title: TEST_COUPON_AUTOFILL.dealTitle,
      description: TEST_COUPON_AUTOFILL.description,
      category: TEST_COUPON_AUTOFILL.category,
      offerText: TEST_COUPON_AUTOFILL.offerText,
      websiteUrl: TEST_COUPON_AUTOFILL.websiteUrl,
      productUrl: TEST_COUPON_AUTOFILL.productUrl,
      affiliateUrl: TEST_COUPON_AUTOFILL.affiliateUrl,
      isOnline: true,
    };

    openPortalWithAutofillPayload(TEST_COUPON_AUTOFILL, normalizedDeal, {
      message: 'Applying hardcoded test coupon values to the Business Portal form...',
    });
  };

  const handleCopyAIDealJson = async () => {
    if (!aiFinderResult?.generatedJson) return;

    const copyResult = await copyTextToClipboard(aiFinderResult.generatedJson);
    if (copyResult === 'success') {
      setAiFinderMessage('Coupon JSON copied to clipboard.');
      setAiFinderError('');
      return;
    }

    setAiFinderError('Could not copy coupon JSON automatically.');
  };

  const handleReviewAIDealMissingFields = () => {
    aiFinderFieldCoverageRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    const portalCoverage = buildPortalFieldCoverage(portalFieldSnapshot ?? dealDraft);
    const requiredMissing = portalCoverage.missingRequired;
    const optionalMissing = portalCoverage.missingOptional;

    if (requiredMissing.length || optionalMissing.length) {
      setAiFinderMessage('Scrolled to the missing-fields review section.');
    } else {
      setAiFinderMessage('All mapped portal fields are already filled.');
    }
  };

  const handleEnhanceAIDeal = async () => {
    if (!aiFinderResult?.normalizedDeal) {
      await handleSearchAIDeal();
      return;
    }

    if (!supabaseEdgeClient || !hasSupabaseConfig) {
      const message = supabaseConfigIssue || 'Supabase is required for Affiliate Deal Finder.';
      setAiFinderError(message);
      return;
    }

    const affiliateTrackingValidation = validateAffiliateTrackingInput(aiFinderAffiliateUrl);
    if (affiliateTrackingValidation.error) {
      setAiFinderError(affiliateTrackingValidation.error);
      return;
    }

    setAiFinderLoading(true);
    setAiFinderError('');
    setAiFinderMessage('');

    try {
      const requestPayload = {
        phase: 'generate',
        keyword: aiFinderKeyword.trim() || aiFinderResult.normalizedDeal.title,
        url: (
          selectedAIFinderUrl ||
          (
            aiFinderResult.normalizedDeal.productUrl ??
            aiFinderResult.normalizedDeal.sourceQuery ??
            aiFinderResult.normalizedDeal.affiliateUrl ??
            aiFinderResult.normalizedDeal.websiteUrl ??
            aiFinderUrl.trim()
          )
        ) || undefined,
        affiliateUrl: affiliateTrackingValidation.url ?? aiFinderResult.normalizedDeal.affiliateUrl ?? undefined,
        merchant: aiFinderMerchant === 'Any' ? undefined : aiFinderMerchant,
        category: aiFinderCategory || undefined,
        maxPrice: aiFinderMaxPrice.trim() ? Number(aiFinderMaxPrice) : null,
        minDiscount: aiFinderMinDiscount.trim() ? Number(aiFinderMinDiscount) : null,
        enhance: true,
      };

      console.info('[LiveDrop] Enhancing deal via Edge Function', {
        functionName: AI_DEAL_FINDER_FUNCTION,
        payload: requestPayload,
      });

      const { data, error } = await supabaseEdgeClient.functions.invoke(AI_DEAL_FINDER_FUNCTION, {
        body: requestPayload,
      });

      if (error) {
        const message = await extractAIDealFinderErrorMessage(error);
        throw new Error(message);
      }

      if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
        throw new Error(data.error);
      }

      const result = data as AIDealFinderResult | null;
      if (!result?.normalizedDeal || !result?.generatedJson) {
        throw new Error('Enhance Deal returned an incomplete response.');
      }

      const normalizedResult = affiliateTrackingValidation.url
        ? applyAffiliateTrackingOverrideToResult(result, affiliateTrackingValidation.url)
        : result;

      setAiFinderResult(normalizedResult);
      setBulkImportJson(normalizedResult.generatedJson);
      setBulkImportMessage('Enhanced deal JSON is ready and synced into the portal intake box.');
      setAiFinderMessage(normalizedResult.resultQuality === 'enriched' ? 'Deal upgraded with full product-page data.' : 'Enhancement attempted. Partial data is still available.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Enhance Deal failed.';
      setAiFinderError(message);
      console.error('[LiveDrop] Enhance Deal failed', { error, message });
    } finally {
      setAiFinderLoading(false);
    }
  };

  const createDraftFromBulkImport = (item: BulkImportDealInput, index = 0): Deal => {
    const normalizedItem = normalizeImportedDealInput(item) ?? item;
    const durationMinutes = normalizedItem.durationMinutes && normalizedItem.durationMinutes > 0 ? normalizedItem.durationMinutes : 120;
    const currentClaims = normalizedItem.claimCount && normalizedItem.claimCount >= 0 ? normalizedItem.claimCount : 0;
    const maxClaims = normalizedItem.maxClaims && normalizedItem.maxClaims > 0 ? normalizedItem.maxClaims : 999;
    const createdAt = Date.now() - index * 60 * 1000;
    const businessType = normalizedItem.isOnline === false ? 'local' : 'online';
    const sourceProductUrl = normalizedItem.sourceProductUrl || normalizedItem.productUrl || normalizedItem.productLink || undefined;
    const affiliateUrl = normalizedItem.affiliateUrl || undefined;
    const websiteUrl = normalizedItem.websiteUrl || deriveWebsiteOrigin(sourceProductUrl) || deriveWebsiteOrigin(affiliateUrl) || undefined;

    return {
      id: createUuid(),
      businessType,
      status: 'draft',
      businessName: normalizedItem.businessName,
      title: normalizedItem.title,
      description: normalizedItem.description,
      offerText: normalizedItem.offerText,
      currentPrice: normalizedItem.currentPrice ?? normalizedItem.price ?? null,
      originalPrice: normalizedItem.originalPrice ?? null,
      discountPercent: normalizedItem.discountPercent ?? extractPriceDropPercent(normalizedItem.offerText) ?? null,
      affiliateUrl,
      merchant: normalizedItem.merchant ?? normalizedItem.businessName,
      brand: normalizedItem.brand ?? null,
      rating: normalizedItem.rating ?? null,
      reviewCount: normalizedItem.reviewCount ?? null,
      availability: normalizedItem.availability ?? normalizedItem.stockStatus ?? null,
      stockStatus: normalizedItem.stockStatus ?? normalizedItem.availability ?? null,
      imageUrl: normalizedItem.imageUrl || undefined,
      websiteUrl,
      productUrl: sourceProductUrl,
      hasTimer: true,
      distance: businessType === 'online' ? 'Online' : '1 mi',
      lat: businessType === 'online' ? 0 : (hasPreciseUserLocation ? userLocation.lat : DEFAULT_LOCATION.lat),
      lng: businessType === 'online' ? 0 : (hasPreciseUserLocation ? userLocation.lng : DEFAULT_LOCATION.lng),
      createdAt,
      expiresAt: createdAt + durationMinutes * 60 * 1000,
      maxClaims,
      currentClaims,
      claimCount: currentClaims,
      category: normalizeCategoryValue(normalizedItem.category, businessType, [
        normalizedItem.title,
        normalizedItem.description,
        normalizedItem.businessName,
        normalizedItem.merchant,
        normalizedItem.brand,
      ]),
    };
  };

  const createLivePreviewDealFromImport = (item: BulkImportDealInput) => {
    const now = Date.now();
    const draftDeal = createDraftFromBulkImport(item, 0);

    return {
      ...draftDeal,
      id: createUuid(),
      businessType: 'online' as const,
      status: 'active' as const,
      distance: 'Online',
      lat: 0,
      lng: 0,
      hasTimer: true,
      createdAt: now,
      expiresAt: now + 2 * 60 * 60 * 1000,
      currentClaims: 0,
      claimCount: 0,
      featured: false,
      adminTag: null,
    };
  };

  const syncGeneratedDealToPortalFields = (
    result: AIDealFinderResult,
    options?: {
      openPortal?: boolean;
    },
  ) => {
    const serializedDeal = result.generatedJson || JSON.stringify(result.mappedForm?.draft ?? result.normalizedDeal, null, 2);
    const parsedDeals = parseBulkImportDeals(serializedDeal);
    const nextDraft = createDraftFromBulkImport(parsedDeals[0], 0);

    setDealDraft(nextDraft);
    setPortalFieldSnapshot(nextDraft);
    setBulkImportJson(serializedDeal);
    setBulkImportCandidates(parsedDeals);
    setSelectedBulkImportIndex(0);
    setBulkImportError('');

    if (options?.openPortal) {
      setPortalSuccessMessage('');
      setDropMode(nextDraft.businessType === 'online' ? 'online' : 'local');
      setCurrentView('business-portal');
      setIsCreating(true);
    }

    return {
      serializedDeal,
      parsedDeals,
      nextDraft,
    };
  };

  const openPortalWithAutofillPayload = (
    mappedPayload: PortalAutofillPayload,
    normalizedDeal: BulkImportDealInput,
    options?: {
      serializedDeal?: string;
      message?: string;
    },
  ) => {
    const serializedDeal = options?.serializedDeal ?? JSON.stringify(normalizedDeal, null, 2);
    const parsedDeals = parseBulkImportDeals(serializedDeal);
    const nextDraft = createDraftFromBulkImport(parsedDeals[0], 0);
    const requestId = Date.now();

    console.info('[LiveDrop] Preparing portal autofill', {
      normalizedDealObject: normalizedDeal,
      mappedPortalPayload: mappedPayload,
    });

    setPortalSuccessMessage('');
    setDealDraft(nextDraft);
    setPortalFieldSnapshot(null);
    setPortalAutofillRequest({
      id: requestId,
      payload: mappedPayload,
    });
    setPendingPortalAutofill({
      requestId,
      normalizedDeal,
      mappedPayload,
    });
    setPortalAutofillStatus({
      state: 'pending',
      attempted: true,
      message: options?.message ?? 'Applying data to the Business Portal form...',
      failureReason: '',
    });
    setBulkImportJson(serializedDeal);
    setBulkImportCandidates(parsedDeals);
    setSelectedBulkImportIndex(0);
    setBulkImportError('');
    setBulkImportMessage(options?.message ?? 'Applying data to the Business Portal form...');
    setAiFinderMessage(options?.message ?? 'Applying data to the Business Portal form...');
    setDropMode(nextDraft.businessType === 'online' ? 'online' : 'local');
    setCurrentView('business-portal');
    setIsCreating(true);
  };

  const loadBulkImportCandidateIntoPortal = (items: BulkImportDealInput[], index = 0) => {
    const safeIndex = Math.min(Math.max(index, 0), items.length - 1);
    const nextDraft = createDraftFromBulkImport(items[safeIndex], safeIndex);

    setPortalSuccessMessage('');
    setBulkImportCandidates(items);
    setSelectedBulkImportIndex(safeIndex);
    setBulkImportError('');
    setBulkImportMessage(
      items.length > 1
        ? `Loaded item ${safeIndex + 1} of ${items.length} into the portal form.`
        : 'Deal loaded into the portal form.',
    );
    setDealDraft(nextDraft);
    setPortalFieldSnapshot(null);
    setPortalAutofillRequest(null);
    setPendingPortalAutofill(null);
    setDropMode(nextDraft.businessType === 'online' ? 'online' : 'local');
    setCurrentView('business-portal');
    setIsCreating(true);
  };

  const handleLoadBulkImportIntoPortal = () => {
    setBulkImportLoading(true);
    setBulkImportError('');
    setBulkImportMessage('');

    try {
      const parsedDeals = parseBulkImportDeals(bulkImportJson);
      loadBulkImportCandidateIntoPortal(parsedDeals, 0);
    } catch (error) {
      console.error('[LiveDrop] Bulk import JSON parse failed', {
        error,
        input: bulkImportJson,
      });
      setBulkImportError(error instanceof Error ? error.message : 'Invalid JSON for portal import.');
    } finally {
      setBulkImportLoading(false);
    }
  };

  const handleAdminLogout = () => {
    console.info('[LiveDrop] Admin logout started', {
      routePath,
      isAdminRoute,
      hasAdminAccess,
      adminSessionEmail,
      userEmail: authUser?.email ?? null,
    });
    setAuthModalOpen(false);
    setAuthError('');
    setAuthInfo('');
    setAdminAccessError('');
    setAdminSessionEmail(null);
    resetAdminUiState();
    setCurrentView('live-deals');

    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      window.localStorage.removeItem(ADMIN_EMAIL_STORAGE_KEY);
      window.localStorage.removeItem(ADMIN_FLAG_STORAGE_KEY);
    }
    console.info('[LiveDrop] Admin logout completed', {
      routePath,
      adminSessionCleared: true,
    });
    navigateToPath('/');
  };

  const upsertUserProfile = async (
    user: User,
    updates: Partial<{
      role: UserRole;
      subscription_status: SubscriptionStatus;
      subscription_plan: string | null;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
    }> = {}
  ) => {
    if (!supabase) return;

    await supabase.from(USER_PROFILE_TABLE).upsert(
      {
        id: user.id,
        email: user.email,
        display_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? 'LiveDrop User',
        avatar_url: user.user_metadata?.avatar_url ?? null,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'id',
      }
    );
  };

  const loadCloudStateForUser = async (user: User) => {
    if (!supabase) return;

    const [{ data: profile }, { data: appState }] = await Promise.all([
      supabase
        .from(USER_PROFILE_TABLE)
        .select('role, subscription_status, subscription_plan, stripe_customer_id, stripe_subscription_id')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from(USER_STATE_TABLE)
        .select('claims, catalog_coupons, notifications, preferences')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    const remoteState = appState
      ? {
          claims: appState.claims ?? [],
          catalog_coupons: appState.catalog_coupons ?? [],
          notifications: appState.notifications ?? [],
          preferences: appState.preferences ?? {},
        }
      : null;

    const mergedState = mergeCloudState(getLocalCloudState(), remoteState ?? emptyCloudAppState);

    setClaims(mergedState.claims);
    setCatalogCoupons(refreshCatalogCoupons(mergedState.catalog_coupons).coupons);
    setNotifications(mergedState.notifications);
    setRadius(mergedState.preferences.radius ?? radius);
    setSelectedCategory(mergedState.preferences.selectedCategory ?? 'All');
    setSelectedFeedFilter(mergedState.preferences.selectedFeedFilter ?? 'all');
    setRole((profile?.role as UserRole | undefined) ?? mergedState.preferences.role ?? 'customer');
    setSubscriptionStatus((profile?.subscription_status as SubscriptionStatus | undefined) ?? 'inactive');
    setSubscriptionPlan(profile?.subscription_plan ?? null);
    setSubscriptionMessage('');

    await supabase.from(USER_STATE_TABLE).upsert({
      user_id: user.id,
      claims: mergedState.claims,
      catalog_coupons: mergedState.catalog_coupons,
      notifications: mergedState.notifications,
      preferences: mergedState.preferences,
      updated_at: new Date().toISOString(),
    });

    cloudHydratedRef.current = true;
    setCloudReady(true);
    setCloudSyncEnabled(true);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePopState = () => {
      setRoutePath(normalizeRoutePath(window.location.pathname));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    console.info('[LiveDrop] Route changed', {
      routePath,
      currentView,
      hasAdminAccess,
    });
  }, [currentView, hasAdminAccess, routePath]);

  useEffect(() => {
    console.info('[LiveDrop] Auth state changed', {
      userEmail: authUser?.email ?? null,
      hasSession: Boolean(session),
      hasAdminAccess,
      adminSessionEmail,
    });
  }, [adminSessionEmail, authUser?.email, hasAdminAccess, session]);

  useEffect(() => {
    console.info('[LiveDrop] Admin state changed', {
      routePath,
      adminSessionEmail,
      hasAdminAccess,
      isCreating,
      editingDealId,
    });
  }, [adminSessionEmail, editingDealId, hasAdminAccess, isCreating, routePath]);

  useEffect(() => {
    const nextAdminEmail = readAdminSessionEmail();
    if (nextAdminEmail !== adminSessionEmail) {
      console.info('[LiveDrop] Recovering admin session state from storage', {
        storedAdminEmail: nextAdminEmail,
      });
      setAdminSessionEmail(nextAdminEmail);
    }
  }, [adminSessionEmail]);

  useEffect(() => {
    const previousRoutePath = previousRoutePathRef.current;
    console.info('[LiveDrop] Route transition evaluated', {
      from: previousRoutePath,
      to: routePath,
      isAdminRoute,
      hasAdminAccess,
      userEmail: authUser?.email ?? null,
    });

    if (previousRoutePath === '/admin' && routePath !== '/admin') {
      console.info('[LiveDrop] Leaving admin route for public shell', {
        from: previousRoutePath,
        to: routePath,
      });
      resetAdminUiState();
      setAdminAccessError('');
      setAuthModalOpen(false);
      setAuthError('');
      setAuthInfo('');
      setCurrentView('live-deals');
    }

    if (!isAdminRoute && !currentView) {
      console.info('[LiveDrop] Restoring safe default public state');
      setCurrentView('live-deals');
    }

    previousRoutePathRef.current = routePath;
  }, [authUser?.email, currentView, hasAdminAccess, isAdminRoute, routePath]);

  useEffect(() => {
    if (isDashboardRoute) {
      setCurrentView('live-deals');
    }
  }, [isDashboardRoute]);

  // Load shared deals from the backend with bundled fallback data
  useEffect(() => {
    let cancelled = false;

    const savedDeals = readStoredDeals();
    const savedClaims = readStoredClaims();
    const savedCatalog = readStoredCatalog();
    const savedNotifications = readStoredNotifications();
    const savedRole = readStoredRole();
    const fallbackDeals = composeDealsWithLocationContext(
      savedDeals,
      latestUserLocationRef.current,
      latestHasPreciseLocationRef.current,
    );

    applyDealsState(fallbackDeals);
    setDealsLoading(true);
    setDealsError('');

    setRole(savedRole);
    if (LOCAL_ADMIN_MODE) {
      setSubscriptionStatus('active');
      setSubscriptionPlan(BUSINESS_PLAN_ID);
    }
    setClaims(savedClaims);
    setNotifications(savedNotifications);
    const refreshedCatalog = refreshCatalogCoupons(savedCatalog);
    setCatalogCoupons(refreshedCatalog.coupons);
    setCatalogDropWarnings(refreshedCatalog.droppedIds);

    const hydrateSharedDeals = async () => {
      if (!supabase || !hasSupabaseConfig) {
        if (!cancelled) {
          setDealsLoading(false);
          setDealsError('Shared deal sync is unavailable. Showing fallback drops.');
        }
        return;
      }

      try {
        const remoteDeals = await fetchSharedDeals();
        if (cancelled) return;

        const nextDeals = remoteDeals.length > 0
          ? composeDealsWithLocationContext(
              remoteDeals,
              latestUserLocationRef.current,
              latestHasPreciseLocationRef.current,
            )
          : fallbackDeals;
        applyDealsState(nextDeals);
        setDealsError(remoteDeals.length > 0 ? '' : 'Shared feed is empty. Showing fallback drops.');
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load shared deals:', error);
        applyDealsState(fallbackDeals);
        setDealsError('Could not load shared deals. Showing fallback drops.');
      } finally {
        if (!cancelled) {
          setDealsLoading(false);
        }
      }
    };

    void hydrateSharedDeals();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!supabase || !hasSupabaseConfig) return;

    let mounted = true;

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (error) {
        setAuthError(error.message);
        setCloudReady(true);
        setAuthLoading(false);
        return;
      }

      setSession(data.session);
      setAuthUser(data.session?.user ?? null);

      if (data.session?.user) {
        await upsertUserProfile(data.session.user);
        await loadCloudStateForUser(data.session.user);
      } else {
        setCloudReady(true);
      }
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession);
      setAuthUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        setAuthModalOpen(false);
        setAuthError('');
        setAuthInfo('');
        await upsertUserProfile(nextSession.user);
        await loadCloudStateForUser(nextSession.user);
      } else {
        setCloudSyncEnabled(false);
        setCloudReady(true);
        cloudHydratedRef.current = false;
        setSubscriptionStatus('inactive');
        setSubscriptionPlan(null);
        setSubscriptionMessage('');
      }
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Geolocation fetching
  const fetchLocation = () => {
    const requestId = locationRequestIdRef.current + 1;
    locationRequestIdRef.current = requestId;
    const previousLocation = latestUserLocationRef.current;
    const hadPreviousPreciseLocation =
      latestHasPreciseLocationRef.current && hasUsableUserLocation(previousLocation);
    const previousCityName = cityName;
    setLocationStatus('loading');
    if (!hadPreviousPreciseLocation) {
      setCityName('');
    }

      const clearManagedSeedDeals = () => {
        setDeals((prevDeals) => {
          const nextDeals = prevDeals.filter((deal) => !isManagedLocalSeedDeal(deal));
          return nextDeals;
        });
      };

    const handleLocationFailure = (status: 'denied' | 'error', nextCityName: string) => {
      if (locationRequestIdRef.current !== requestId) {
        console.info('[LiveDrop] Ignoring stale geolocation failure', {
          requestId,
          activeRequestId: locationRequestIdRef.current,
          status,
        });
        return;
      }

      if (hadPreviousPreciseLocation) {
        console.warn('[LiveDrop] Geolocation refresh failed, keeping last known precise location', {
          status,
          nextCityName,
          previousLocation,
        });
        setUserLocation(previousLocation);
        latestUserLocationRef.current = previousLocation;
        latestHasPreciseLocationRef.current = true;
        setLocationStatus('success');
        setCityName(previousCityName || 'Current area');
        return;
      }

      setUserLocation(DEFAULT_LOCATION);
      latestUserLocationRef.current = DEFAULT_LOCATION;
      latestHasPreciseLocationRef.current = false;
      reverseGeocodeRequestIdRef.current += 1;
      setLocationStatus(status);
      setCityName(nextCityName);
      clearManagedSeedDeals();
    };

    const handleLocationSuccess = (position: GeolocationPosition) => {
      if (locationRequestIdRef.current !== requestId) {
        console.info('[LiveDrop] Ignoring stale geolocation success', {
          requestId,
          activeRequestId: locationRequestIdRef.current,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        return;
      }

      const newLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      setUserLocation(newLocation);
      latestUserLocationRef.current = newLocation;
      latestHasPreciseLocationRef.current = true;
      setLocationStatus('success');
      setCityName('');

      setDeals((prevDeals) => {
        const preservedDeals = prevDeals.filter((deal) => !isManagedLocalSeedDeal(deal));
        const nextDeals = composeDealsWithLocationContext(preservedDeals, newLocation, true);
        return nextDeals;
      });
    };

    if (!navigator.geolocation) {
      handleLocationFailure('error', 'Location unavailable');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      handleLocationSuccess,
      (error) => {
        if (locationRequestIdRef.current !== requestId) {
          console.info('[LiveDrop] Ignoring stale geolocation error', {
            requestId,
            activeRequestId: locationRequestIdRef.current,
            code: error.code,
          });
          return;
        }

        console.error('Geolocation error:', error);

        if (error.code !== 1) {
          console.warn('[LiveDrop] High-accuracy geolocation failed, retrying with balanced accuracy', error);

          navigator.geolocation.getCurrentPosition(
            handleLocationSuccess,
            (retryError) => {
              if (locationRequestIdRef.current !== requestId) {
                console.info('[LiveDrop] Ignoring stale balanced geolocation error', {
                  requestId,
                  activeRequestId: locationRequestIdRef.current,
                  code: retryError.code,
                });
                return;
              }

              console.error('Balanced geolocation retry failed:', retryError);
              handleLocationFailure(
                retryError.code === 1 ? 'denied' : 'error',
                retryError.code === 1 ? 'Location access denied' : 'Location unavailable',
              );
            },
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 },
          );
          return;
        }

        handleLocationFailure('denied', 'Location access denied');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const restartLocalDeals = (locationOverride?: UserLocation) => {
    if (!locationOverride && !hasPreciseUserLocation) {
      fetchLocation();
      return;
    }

    const nextLocation = locationOverride ?? userLocation;

    setDeals((prevDeals) => {
      const preservedDeals = prevDeals.filter((deal) => !isManagedLocalSeedDeal(deal));
      const nextDeals = composeDealsWithLocationContext(preservedDeals, nextLocation, true);
      return nextDeals;
    });

    setSelectedFeedFilter('all');
    setCurrentView('live-deals');
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  useEffect(() => {
    const runMockDealRefresh = () => {
      setDeals((prevDeals) => {
        const nextDeals = syncSharedOnlineDeals(prevDeals);
        return nextDeals;
      });
    };

    const timeoutMs = Math.max(1_000, MOCK_DEAL_REFRESH_INTERVAL_MS - (Date.now() % MOCK_DEAL_REFRESH_INTERVAL_MS));
    let intervalId: number | undefined;

    const timeoutId = window.setTimeout(() => {
      runMockDealRefresh();
      intervalId = window.setInterval(runMockDealRefresh, MOCK_DEAL_REFRESH_INTERVAL_MS);
    }, timeoutMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (typeof intervalId === 'number') {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  // Fetch city name from coordinates
  useEffect(() => {
    if (locationStatus !== 'success' || !hasUsableUserLocation(userLocation)) {
      reverseGeocodeRequestIdRef.current += 1;
      return;
    }

    const geocodeRequestId = reverseGeocodeRequestIdRef.current + 1;
    reverseGeocodeRequestIdRef.current = geocodeRequestId;
    let cancelled = false;

    const fetchCity = async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${userLocation.lat}&lon=${userLocation.lng}`,
          {
            headers: {
              'Accept-Language': 'en-US,en;q=0.9',
              'User-Agent': 'LiveDrop-App'
            },
          }
        );
        if (!response.ok) {
          throw new Error(`Reverse geocode failed with status ${response.status}`);
        }
        const data = await response.json();
        if (cancelled || reverseGeocodeRequestIdRef.current !== geocodeRequestId) {
          return;
        }
        const city = data.address.city || data.address.town || data.address.village || data.address.suburb || data.address.county || 'Unknown City';
        setCityName(city);
      } catch (error) {
        console.error('Error fetching city name:', error);
        if (cancelled || reverseGeocodeRequestIdRef.current !== geocodeRequestId) {
          return;
        }
        setCityName('Current area');
      }
    };

    void fetchCity();

    return () => {
      cancelled = true;
    };
  }, [locationStatus, userLocation.lat, userLocation.lng]);

  // Periodic refresh to move deals from "Live" to "Expired"
  useEffect(() => {
    const interval = setInterval(() => {
      // Force re-render to update filtered lists
      setDeals(prev => [...prev]);
    }, 10000); // Every 10 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setClaims(prevClaims => {
      const nextClaims = prevClaims.map(claim =>
        claim.status === 'active' && claim.expiresAt <= Date.now()
          ? { ...claim, status: 'expired' }
          : claim
      );

      const hasChanges = nextClaims.some((claim, index) => claim.status !== prevClaims[index]?.status);
      return hasChanges ? nextClaims : prevClaims;
    });
  }, [deals]);

  useEffect(() => {
    if (catalogDropWarnings.length > 0) {
      pushNotification({
        message: getNotificationMessage('catalog_drop'),
        type: 'catalog_drop',
      });
    }
  }, [catalogDropWarnings]);

  useEffect(() => {
    if (deals.length === 0) return;
    if (!hasPreciseUserLocation) return;

    const nextSeenIds = new Set(seenDealIdsRef.current);
    const newDeals = deals.filter((deal) => !seenDealIdsRef.current.has(deal.id));

    newDeals.forEach((deal) => {
      nextSeenIds.add(deal.id);

      if (deal.businessType === 'online') {
        return;
      }

      if (!hasUsableCoordinates(deal.lat, deal.lng)) {
        return;
      }

      const distance = calculateDistance(userLocation.lat, userLocation.lng, deal.lat, deal.lng);
      if (deal.expiresAt > Date.now() && distance <= radius) {
        pushNotification({
          message: getNotificationMessage('new_deal', deal.title),
          type: 'new_deal',
          dealId: deal.id,
        });
      }
    });

    seenDealIdsRef.current = nextSeenIds;
  }, [deals, radius, hasPreciseUserLocation, userLocation.lat, userLocation.lng]);

  useEffect(() => {
    if (!hasPreciseUserLocation) return;

    deals.forEach((deal) => {
      if (deal.businessType === 'online') return;
      if (!hasUsableCoordinates(deal.lat, deal.lng)) return;

      const distance = calculateDistance(userLocation.lat, userLocation.lng, deal.lat, deal.lng);
      const isVisible = deal.expiresAt > Date.now() && distance <= radius;
      const isEndingSoon = isVisible && deal.expiresAt - Date.now() <= 5 * 60 * 1000;

      if (isEndingSoon) {
        pushNotification({
          message: getNotificationMessage('ending_soon', deal.title),
          type: 'ending_soon',
          dealId: deal.id,
        });
      }
    });
  }, [deals, radius, hasPreciseUserLocation, userLocation.lat, userLocation.lng]);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    const persistedDeals = deals.filter((deal) => !isManagedLocalSeedDeal(deal));
    localStorage.setItem(DEALS_STORAGE_KEY, JSON.stringify(persistedDeals));
  }, [deals]);

  useEffect(() => {
    localStorage.setItem(CLAIMS_STORAGE_KEY, JSON.stringify(claims));
  }, [claims]);

  useEffect(() => {
    localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalogCoupons));
  }, [catalogCoupons]);

  useEffect(() => {
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem(ROLE_STORAGE_KEY, role);
  }, [role]);

  useEffect(() => {
    if (!supabase || !authUser || !cloudSyncEnabled || !cloudHydratedRef.current) return;

    void supabase.from(USER_STATE_TABLE).upsert({
      user_id: authUser.id,
      claims,
      catalog_coupons: catalogCoupons,
      notifications,
      preferences: {
        radius,
        selectedCategory,
        selectedFeedFilter,
        role,
      },
      updated_at: new Date().toISOString(),
    });
  }, [authUser, claims, catalogCoupons, notifications, radius, role, selectedCategory, selectedFeedFilter, cloudSyncEnabled]);

  useEffect(() => {
    if (!isAdminRoute || !hasAdminAccess) return;
    void refreshSharedDeals();
  }, [hasAdminAccess, isAdminRoute]);

  useEffect(() => {
    const normalizedEmail = authUser?.email?.toLowerCase();

    if (normalizedEmail === APPROVED_ADMIN_EMAIL) {
      setAdminSessionEmail(APPROVED_ADMIN_EMAIL);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, APPROVED_ADMIN_EMAIL);
        window.localStorage.setItem(ADMIN_EMAIL_STORAGE_KEY, APPROVED_ADMIN_EMAIL);
        window.localStorage.setItem(ADMIN_FLAG_STORAGE_KEY, 'true');
      }
      return;
    }

    if (authUser && normalizedEmail !== APPROVED_ADMIN_EMAIL && adminSessionEmail === APPROVED_ADMIN_EMAIL) {
      setAdminSessionEmail(null);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
        window.localStorage.removeItem(ADMIN_EMAIL_STORAGE_KEY);
        window.localStorage.removeItem(ADMIN_FLAG_STORAGE_KEY);
      }
    }
  }, [adminSessionEmail, authUser]);

  useEffect(() => {
    if (!isAdminRoute) return;

    if (hasAdminAccess) {
      setAuthModalOpen(false);
      setAuthError('');
      return;
    }

    if (authUser?.email && authUser.email.toLowerCase() !== APPROVED_ADMIN_EMAIL) {
      setAuthError('That account does not have admin access.');
      navigateToPath('/');
      return;
    }

    setAuthInfo('Sign in with the approved admin account to continue.');
    setAuthModalOpen(true);
  }, [authUser?.email, hasAdminAccess, isAdminRoute]);

  useEffect(() => {
    if (!supabase || !authUser) return;

    const params = new URLSearchParams(window.location.search);
    const checkoutState = params.get('checkout');
    const sessionId = params.get('session_id');

    if (!checkoutState) return;

    const clearCheckoutParams = () => {
      const nextUrl = `${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, document.title, nextUrl);
    };

    if (checkoutState === 'cancel') {
      setSubscriptionMessage('Subscription was not completed');
      setCurrentView('business-portal');
      clearCheckoutParams();
      return;
    }

    if (checkoutState !== 'success' || !sessionId) {
      clearCheckoutParams();
      return;
    }

    let cancelled = false;

    const verifyCheckout = async () => {
      setSubscriptionLoading(true);
      setSubscriptionMessage('');

      const { data, error } = await supabase.functions.invoke('verify-business-checkout', {
        body: { sessionId },
      });

      if (cancelled) return;

      if (error || !data?.success) {
        setSubscriptionMessage(error?.message ?? 'We could not verify your subscription yet. Please try again.');
        setCurrentView('business-portal');
        setSubscriptionLoading(false);
        clearCheckoutParams();
        return;
      }

      setRole('business');
      setSubscriptionStatus('active');
      setSubscriptionPlan(data.subscriptionPlan ?? BUSINESS_PLAN_ID);
      setSubscriptionMessage('Business access is now active');
      setCurrentView('business-portal');
      setSubscriptionLoading(false);
      clearCheckoutParams();
    };

    void verifyCheckout();

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const handleClaimDeal = (deal: Deal) => {
    // Check if already claimed
    if (claims.some(c => c.dealId === deal.id)) return;
    // Check if sold out
    if (deal.currentClaims >= deal.maxClaims) return;
    // Check if expired
    if (deal.expiresAt <= Date.now()) return;
    
    setSelectedDeal(deal);
  };

  const replaceDealInState = (nextDeal: Deal, previousDealId: string = nextDeal.id) => {
    setDeals((prevDeals) =>
      prevDeals.map((deal) => (deal.id === previousDealId ? nextDeal : deal)),
    );
  };

  const shareDeal = async (deal: Deal) => {
    const shareUrl = getDealShareUrl(deal);
    const shareData = {
      title: deal.title,
      text: `${deal.offerText} from ${deal.businessName}`,
      url: shareUrl,
    };

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        if (typeof navigator.canShare === 'function' && !navigator.canShare({ url: shareUrl })) {
          await navigator.share({
            title: shareData.title,
            text: `${shareData.text} ${shareUrl}`,
          });
        } else {
          await navigator.share(shareData);
        }

        pushToast('Share sheet opened.', 'share');
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return false;
        }

        console.warn('[LiveDrop] Native share failed, falling back to clipboard', error);
      }
    }

    const copyResult = await copyTextToClipboard(shareUrl);
    if (copyResult === 'success') {
      pushToast('Deal link copied to clipboard.', 'share');
      return true;
    }

    pushToast('Could not share this deal automatically.', 'share');
    return false;
  };

  const handleDealEngagement = async (deal: Deal, action: DealEngagementAction) => {
    if (dealEngagementPending[deal.id] || dealEngagementLocksRef.current.has(deal.id)) {
      return;
    }

    dealEngagementLocksRef.current.add(deal.id);
    setDealEngagementPending((prev) => ({ ...prev, [deal.id]: action }));

    try {
      if (action === 'share') {
        const didShare = await shareDeal(deal);
        if (!didShare) {
          return;
        }
      }

      const updatedDeal = applyDealEngagement(deal, action);
      replaceDealInState(updatedDeal);

      if (hasSupabaseConfig) {
        const persistedDeal = await upsertDealInBackend(updatedDeal);
        replaceDealInState(persistedDeal, deal.id);
      }
    } catch (error) {
      console.error('[LiveDrop] Deal engagement persistence failed', {
        dealId: deal.id,
        action,
        error,
      });
    } finally {
      dealEngagementLocksRef.current.delete(deal.id);
      setDealEngagementPending((prev) => ({ ...prev, [deal.id]: null }));
    }
  };

  const handleLikeDeal = (deal: Deal) => void handleDealEngagement(deal, 'like');
  const handleDislikeDeal = (deal: Deal) => void handleDealEngagement(deal, 'dislike');
  const handleShareDeal = (deal: Deal) => void handleDealEngagement(deal, 'share');
  const forceRefreshDealsView = () => setDeals((prevDeals) => [...prevDeals]);

  const confirmClaim = (deal: Deal): Claim => {
    const liveDeal = latestDealsRef.current.find((candidate) => candidate.id === deal.id) ?? deal;
    const existingClaim = latestClaimsRef.current.find(c => c.dealId === liveDeal.id);
    if (existingClaim) {
      return existingClaim;
    }

    const liveClaimCount = liveDeal.claimCount ?? liveDeal.currentClaims;
    if (liveClaimCount >= liveDeal.maxClaims || liveDeal.expiresAt <= Date.now()) {
      throw new Error('This deal can no longer be claimed.');
    }

    const newClaim: Claim = {
      id: createUuid(),
      dealId: liveDeal.id,
      dealTitle: liveDeal.title,
      businessName: liveDeal.businessName,
      logoUrl: liveDeal.logoUrl,
      category: liveDeal.category,
      claimCode: Math.random().toString(36).substr(2, 6).toUpperCase(),
      claimedAt: Date.now(),
      expiresAt: liveDeal.expiresAt,
      status: 'active'
    };

    latestClaimsRef.current = [newClaim, ...latestClaimsRef.current];
    latestDealsRef.current = latestDealsRef.current.map((candidateDeal) =>
      candidateDeal.id === liveDeal.id
        ? {
            ...candidateDeal,
            currentClaims: Math.min(candidateDeal.maxClaims, candidateDeal.currentClaims + 1),
            claimCount: Math.min(candidateDeal.maxClaims, (candidateDeal.claimCount ?? candidateDeal.currentClaims) + 1),
          }
        : candidateDeal,
    );
    setClaims(prev => prev.some((claim) => claim.dealId === liveDeal.id) ? prev : [newClaim, ...prev]);
    setDeals(prev =>
      prev.map(d =>
        d.id === liveDeal.id
          ? {
              ...d,
              currentClaims: Math.min(d.maxClaims, d.currentClaims + 1),
              claimCount: Math.min(d.maxClaims, (d.claimCount ?? d.currentClaims) + 1),
            }
          : d
      )
    );
    handleSaveToCatalog(liveDeal);
    return newClaim;
  };

  const handleCreateDeal = async (
    dealData: Omit<Deal, 'id' | 'createdAt'>,
    options?: { mode?: 'publish' | 'draft' },
  ) => {
    const mode = options?.mode ?? 'publish';
    const shouldPublish = mode === 'publish';

    if (shouldPublish && dealData.businessType !== 'online' && !hasUsableCoordinates(dealData.lat, dealData.lng)) {
      const locationError = 'Enable location access before publishing a local drop so LiveDrop can save a real nearby location.';
      console.warn('[LiveDrop] Blocked local publish without usable coordinates', {
        lat: dealData.lat,
        lng: dealData.lng,
        businessName: dealData.businessName,
        title: dealData.title,
      });
      setDealsError(locationError);
      setPortalSuccessMessage('');
      return;
    }

    const existingDraft = editingDealId ? deals.find((deal) => deal.id === editingDealId) : null;
    const isEditingExistingDeal = Boolean(editingDealId && existingDraft);
    const persistedEditingDealId = editingDealId ? ensureUuid(editingDealId) : null;
    const now = Date.now();
    const relaunchedCreatedAt = isEditingExistingDeal ? now : existingDraft?.createdAt ?? now;
    const nextStatus: Deal['status'] = isEditingExistingDeal
      ? 'active'
      : shouldPublish
        ? 'active'
        : 'draft';
    const localDeal: Deal = {
      ...dealData,
      id: persistedEditingDealId ?? createUuid(),
      createdAt: relaunchedCreatedAt,
      currentClaims: dealData.currentClaims ?? dealData.claimCount ?? 0,
      claimCount: dealData.claimCount ?? dealData.currentClaims ?? 0,
      status: nextStatus,
      featured: dealData.featured ?? existingDraft?.featured ?? false,
      adminTag: dealData.adminTag ?? existingDraft?.adminTag ?? null,
    };

    let publishedDeal = localDeal;
    let sharedWriteSucceeded = false;
    const sharedWriteMode: SharedPublishFailure['mode'] = editingDealId ? 'update' : 'insert';

    if (supabase && hasSupabaseConfig) {
      try {
        publishedDeal = editingDealId
          ? await upsertDealInBackend(localDeal)
          : await publishDealToBackend(localDeal);
        sharedWriteSucceeded = true;
        setLastSharedPublishFailure(null);
        setDealsError('');
      } catch (error) {
        const failure = createSharedPublishFailure(localDeal, sharedWriteMode, error);
        console.error('[LiveDrop] Shared publish fallback engaged', failure);
        setLastSharedPublishFailure(failure);
        pushAdminLog('error', `Using local fallback after shared ${sharedWriteMode} failure`, formatAdminLogDetail(failure));
        setDealsError(`Could not ${sharedWriteMode} to ${failure.schema}.${failure.table} in ${failure.projectUrl}. ${failure.reason}. Showing your local copy for now.`);
      }
    } else if (shouldPublish) {
      setLastSharedPublishFailure(null);
      setDealsError(`Shared backend is not configured for ${DEALS_SCHEMA}.${DEALS_TABLE} in ${resolvedSupabaseUrl || '(missing VITE_SUPABASE_URL)'}. Showing local-only publishing fallback.`);
    }

    setDeals((prev) => {
      const mergedDeals = [
        publishedDeal,
        ...prev.filter((deal) =>
          deal.id !== publishedDeal.id &&
          deal.id !== localDeal.id &&
          deal.id !== editingDealId,
        ),
      ];

      if (publishedDeal.businessType === 'online') {
        return syncSharedOnlineDeals(mergedDeals);
      }

      return mergedDeals;
    });
    setDealDraft(null);
    setPortalFieldSnapshot(null);
    setPortalAutofillStatus({
      state: 'idle',
      attempted: false,
      message: '',
      failureReason: '',
    });
    setPortalAutofillRequest(null);
    setPendingPortalAutofill(null);
    setEditingDealId(null);
    setHasUnsavedFormChanges(false);
    setBulkImportCandidates([]);
    setSelectedBulkImportIndex(0);
    if ((shouldPublish || isEditingExistingDeal) && publishedDeal.businessType !== 'online') {
      setRadius(prev => Math.max(prev, getRadiusForDeal(userLocation, publishedDeal)));
      setDropMode('local');
    } else if (shouldPublish || isEditingExistingDeal) {
      setDropMode('online');
    }
    if (shouldPublish || isEditingExistingDeal) {
      setSelectedCategory('All');
      setSelectedFeedFilter('all');
    }
    const didRelaunchEdit = isEditingExistingDeal && !shouldPublish;
    const successMessage = shouldPublish
      ? 'Deal published'
      : didRelaunchEdit
        ? 'Deal updated and relaunched'
        : 'Deal saved';
    setPortalSuccessMessage(successMessage);
    pushToast(successMessage, shouldPublish || didRelaunchEdit ? 'new_deal' : 'share');
    setIsCreating(false);
    if (!isAdminRoute && (shouldPublish || isEditingExistingDeal)) {
      setCurrentView('live-deals');
    }
  };

  const handleRetryLastSharedPublish = async () => {
    if (!lastSharedPublishFailure) {
      return;
    }

    setRetryingSharedPublish(true);
    setDealsError('');
    pushAdminLog('info', `Retrying shared ${lastSharedPublishFailure.mode} for "${lastSharedPublishFailure.deal.title}"`, formatAdminLogDetail({
      projectUrl: lastSharedPublishFailure.projectUrl,
      schema: lastSharedPublishFailure.schema,
      table: lastSharedPublishFailure.table,
      operation: lastSharedPublishFailure.mode,
      payload: lastSharedPublishFailure.payload,
    }));

    try {
      const publishedDeal = lastSharedPublishFailure.mode === 'update'
        ? await updateDealInBackend(lastSharedPublishFailure.deal)
        : await publishDealToBackend(lastSharedPublishFailure.deal);
      setDeals((prev) => [publishedDeal, ...prev.filter((deal) => deal.id !== publishedDeal.id)]);
      setLastSharedPublishFailure(null);
      setDealsError('');
      setPortalSuccessMessage('Your deal is live');
      pushAdminLog('info', `Retry ${lastSharedPublishFailure.mode} succeeded for "${publishedDeal.title}"`);
    } catch (error) {
      const failure = createSharedPublishFailure(
        lastSharedPublishFailure.deal,
        lastSharedPublishFailure.mode,
        error,
      );
      console.error('[LiveDrop] Retry publish failed', failure);
      setLastSharedPublishFailure(failure);
      setDealsError(`Retry failed for ${failure.schema}.${failure.table} in ${failure.projectUrl}. ${failure.reason}. Your local copy is still available.`);
      pushAdminLog('error', `Retry ${failure.mode} failed`, formatAdminLogDetail(failure));
      setPortalSuccessMessage('');
    } finally {
      setRetryingSharedPublish(false);
    }
  };

  const handleOpenCreateDeal = () => {
    setPortalSuccessMessage('');
    setDealDraft(null);
    setPortalFieldSnapshot(null);
    setPortalAutofillStatus({
      state: 'idle',
      attempted: false,
      message: '',
      failureReason: '',
    });
    setPendingPortalAutofill(null);
    setEditingDealId(null);
    setHasUnsavedFormChanges(false);
    setBulkImportCandidates([]);
    setSelectedBulkImportIndex(0);
    setIsCreating(true);
  };

  const closeCreateEditor = () => {
    setIsCreating(false);
    setDealDraft(null);
    setPortalFieldSnapshot(null);
    setPortalAutofillRequest(null);
    setPendingPortalAutofill(null);
    setEditingDealId(null);
    setHasUnsavedFormChanges(false);
    setBulkImportCandidates([]);
    setSelectedBulkImportIndex(0);
  };

  const createReusedDealPayload = (
    sourceDeal: Deal,
    options?: {
      durationMinutes?: number;
      preserveIdentity?: boolean;
    },
  ): Deal => {
    const durationMinutes = options?.durationMinutes ?? 30;
    const createdAt = Date.now();
    const nextExpiry = createdAt + durationMinutes * 60 * 1000;
    const preservedId = options?.preserveIdentity ? normalizeUuidOrNull(sourceDeal.id) : null;

    return {
      ...sourceDeal,
      id: preservedId ?? createUuid(),
      businessType: sourceDeal.businessType,
      status: 'active',
      businessName: sourceDeal.businessName,
      logoUrl: sourceDeal.logoUrl,
      imageUrl: sourceDeal.imageUrl,
      title: sourceDeal.title,
      description: sourceDeal.description,
      offerText: sourceDeal.offerText,
      affiliateUrl: sourceDeal.affiliateUrl,
      originalPrice: sourceDeal.originalPrice ?? null,
      discountPercent: sourceDeal.discountPercent ?? null,
      reviewCount: sourceDeal.reviewCount ?? null,
      stockStatus: sourceDeal.stockStatus ?? null,
      websiteUrl: sourceDeal.websiteUrl,
      productUrl: sourceDeal.productUrl,
      hasTimer: true,
      distance: sourceDeal.businessType === 'online' ? 'Online' : sourceDeal.distance,
      lat: sourceDeal.lat,
      lng: sourceDeal.lng,
      createdAt,
      expiresAt: nextExpiry,
      maxClaims: sourceDeal.maxClaims,
      currentClaims: 0,
      claimCount: 0,
      category: sourceDeal.category,
      featured: sourceDeal.featured ?? false,
      adminTag: sourceDeal.adminTag ?? null,
    };
  };

  const isExpiredDeal = (deal: Deal, at: number = Date.now()) =>
    deal.expiresAt <= at || deal.status === 'expired';

  const handleReuseDeal = (deal: Deal) => {
    const nextDraft = createReusedDealPayload(deal, { durationMinutes: 30 });
    setPortalSuccessMessage('');
    setEditingDealId(null);
    setHasUnsavedFormChanges(false);
    setBulkImportCandidates([]);
    setSelectedBulkImportIndex(0);
    setDealDraft(nextDraft);
    setPortalFieldSnapshot(nextDraft);
    setIsCreating(true);
  };

  const mergeRelaunchedDealsIntoState = (sourceDealIds: string[], nextDeals: Deal[]) => {
    const sourceIdSet = new Set(sourceDealIds);

    setDeals((prevDeals) => {
      const nextMap = new Map<string, Deal>();

      prevDeals
        .filter((deal) => !sourceIdSet.has(deal.id))
        .forEach((deal) => {
          nextMap.set(deal.id, deal);
        });

      nextDeals.forEach((deal) => {
        nextMap.set(deal.id, deal);
      });

      const mergedDeals = [...nextMap.values()].sort((left, right) => right.createdAt - left.createdAt);
      return mergedDeals;
    });
  };

  const buildRelaunchFeedback = (dealTitle: string, sharedWriteSucceeded: boolean) => {
    const portalMessage = sharedWriteSucceeded
      ? `"${dealTitle}" has been relaunched and is live again.`
      : `"${dealTitle}" has been relaunched locally and is back in the feed. Shared sync will retry later.`;
    const toastMessage = sharedWriteSucceeded
      ? `Relaunched: ${dealTitle}`
      : `Relaunched locally: ${dealTitle}`;

    return {
      portalMessage,
      toastMessage,
    };
  };

  const announceRelaunchedDeal = (deal: Deal, sharedWriteSucceeded: boolean) => {
    const feedback = buildRelaunchFeedback(deal.title, sharedWriteSucceeded);
    setPortalSuccessMessage(feedback.portalMessage);
    pushToast(feedback.toastMessage, 'new_deal');
    pushNotification({
      type: 'new_deal',
      dealId: deal.id,
      message: feedback.portalMessage,
    });
  };

  const handleReuseDealAndGoLive = async (deal: Deal) => {
    const nextDeal = createReusedDealPayload(deal, {
      durationMinutes: 30,
      preserveIdentity: true,
    });
    const writeMode: SharedPublishFailure['mode'] = normalizeUuidOrNull(deal.id) ? 'update' : 'insert';

    setPortalSuccessMessage('');
    setEditingDealId(null);
    setDealDraft(null);
    setPortalFieldSnapshot(null);
    setPortalAutofillRequest(null);
    setPendingPortalAutofill(null);
    setBulkImportCandidates([]);
    setSelectedBulkImportIndex(0);

    let persistedDeal = nextDeal;
    let sharedWriteSucceeded = false;

    if (supabase && hasSupabaseConfig) {
      try {
        persistedDeal = writeMode === 'update'
          ? await updateDealInBackend(nextDeal)
          : await publishDealToBackend(nextDeal);
        sharedWriteSucceeded = true;
        setLastSharedPublishFailure(null);
        setDealsError('');
      } catch (error) {
        const failure = createSharedPublishFailure(nextDeal, writeMode, error);
        console.error('[LiveDrop] Relaunch fallback engaged', failure);
        setLastSharedPublishFailure(failure);
        pushAdminLog('error', `Using local fallback after deal relaunch ${writeMode} failure`, formatAdminLogDetail(failure));
        setDealsError(`Could not relaunch to ${failure.schema}.${failure.table} in ${failure.projectUrl}. ${failure.reason}. Showing your local copy for now.`);
      }
    }

    mergeRelaunchedDealsIntoState([deal.id], [persistedDeal]);
    setDropMode(persistedDeal.businessType === 'online' ? 'online' : 'local');
    setSelectedCategory('All');
    setSelectedFeedFilter('all');
    announceRelaunchedDeal(persistedDeal, sharedWriteSucceeded);
    setIsCreating(false);
    if (!isAdminRoute) {
      setCurrentView('live-deals');
    }
  };

  const handleReuseAllExpiredDeals = async () => {
    const expiredDeals = deals.filter((deal) => isExpiredDeal(deal));
    if (expiredDeals.length === 0) {
      pushToast('No expired deals to relaunch right now.', 'share');
      return;
    }

    const preparedDeals = expiredDeals.map((deal) =>
      createReusedDealPayload(deal, {
        durationMinutes: 30,
        preserveIdentity: true,
      }),
    );

    setPortalSuccessMessage('');
    setEditingDealId(null);
    setDealDraft(null);
    setPortalFieldSnapshot(null);
    setPortalAutofillRequest(null);
    setPendingPortalAutofill(null);
    setBulkImportCandidates([]);
    setSelectedBulkImportIndex(0);

    let persistedDeals = preparedDeals;
    let sharedWriteSucceeded = false;

    if (supabase && hasSupabaseConfig) {
      try {
        persistedDeals = await publishDealsToBackend(preparedDeals);
        sharedWriteSucceeded = true;
        setLastSharedPublishFailure(null);
        setDealsError('');
      } catch (error) {
        const sampleFailure = createSharedPublishFailure(preparedDeals[0], 'insert', error);
        console.error('[LiveDrop] Bulk relaunch fallback engaged', {
          error,
          affectedDealIds: expiredDeals.map((deal) => deal.id),
        });
        setLastSharedPublishFailure(sampleFailure);
        setDealsError(`Could not relaunch all expired deals in ${sampleFailure.schema}.${sampleFailure.table}. ${sampleFailure.reason}. Showing your local copies for now.`);
      }
    }

    mergeRelaunchedDealsIntoState(
      expiredDeals.map((deal) => deal.id),
      persistedDeals,
    );
    setSelectedCategory('All');
    setSelectedFeedFilter('all');
    const relaunchSummary = sharedWriteSucceeded
      ? `Relaunched ${persistedDeals.length} expired deals and sent them back live.`
      : `Relaunched ${persistedDeals.length} expired deals locally. Shared sync will retry later.`;
    setPortalSuccessMessage(relaunchSummary);
    pushToast(relaunchSummary, 'new_deal');
    pushNotification({
      type: 'new_deal',
      message: relaunchSummary,
    });
    setIsCreating(false);
  };

  const handleCancelDeal = (dealId: string) => {
    setDeals(prev => prev.filter(d => d.id !== dealId));
  };

  const resolveEditableDealFromCard = (inputDeal: Deal): Deal => {
    if (inputDeal.businessType !== 'online') {
      return inputDeal;
    }

    const sourceId = extractMockOnlineSourceId(inputDeal.id);
    const nonMockOnlineDeals = deals
      .filter((deal) => deal.businessType === 'online' && !deal.id.startsWith('mock-online-'))
      .sort((left, right) => right.createdAt - left.createdAt);

    if (sourceId) {
      const sourceMatch = nonMockOnlineDeals.find((deal) => deal.id === sourceId);
      if (sourceMatch) {
        return sourceMatch;
      }
    }

    const likelyMatch = nonMockOnlineDeals.find((deal) => isLikelySameOnlineDeal(deal, inputDeal));
    return likelyMatch ?? inputDeal;
  };

  const handleEditDeal = (deal: Deal) => {
    const latestDeal = resolveEditableDealFromCard(deal);
    setPortalSuccessMessage('');
    setDealDraft(latestDeal);
    setPortalFieldSnapshot(latestDeal);
    setEditingDealId(latestDeal.id);
    setHasUnsavedFormChanges(false);
    setBulkImportCandidates([]);
    setSelectedBulkImportIndex(0);
    if (currentView !== 'business-portal') {
      setCurrentView('business-portal');
    }
    setIsCreating(true);
  };

  const runWithUnsavedCreateGuard = async (onContinue: () => void | Promise<void>) => {
    if (!isCreating || !hasUnsavedFormChanges) {
      await onContinue();
      return;
    }

    const shouldSaveFirst = window.confirm('You have unsaved changes. Save before leaving?');
    if (shouldSaveFirst && portalFieldSnapshot) {
      const { id: _id, createdAt: _createdAt, ...draftPayload } = portalFieldSnapshot;
      await handleCreateDeal(draftPayload, { mode: 'draft' });
    }

    await onContinue();
  };

  const handleBackFromAdminEditor = async () => {
    await runWithUnsavedCreateGuard(async () => {
      if (isAdminRoute) {
        closeCreateEditor();
        return;
      }

      navigateToPath('/admin');
      closeCreateEditor();
    });
  };

  const refreshSharedDeals = async () => {
    setDealsLoading(true);
    try {
      const sharedDeals = await fetchSharedDeals();
      const fallbackDeals = composeDealsWithLocationContext(
        readStoredDeals(),
        latestUserLocationRef.current,
        latestHasPreciseLocationRef.current,
      );
      const nextDeals = sharedDeals.length > 0
        ? composeDealsWithLocationContext(
            sharedDeals,
            latestUserLocationRef.current,
            latestHasPreciseLocationRef.current,
          )
        : fallbackDeals;
      applyDealsState(nextDeals);
      setDealsError(sharedDeals.length > 0 ? '' : 'Shared feed is empty. Showing fallback drops.');
      pushAdminLog('info', 'Force refreshed shared deals');
    } catch (error) {
      console.error('[LiveDrop] Force refresh failed', error);
      setDealsError('Could not load shared deals. Showing fallback drops.');
      pushAdminLog('error', 'Force refresh failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setDealsLoading(false);
    }
  };

  const handleAdminDeleteDeal = async (deal: Deal) => {
    const confirmed = window.confirm(`Delete "${deal.title}"? This action cannot be undone.`);
    if (!confirmed) return;

    setDeletingDealIds((prev) => {
      const next = new Set(prev);
      next.add(deal.id);
      return next;
    });

    setHiddenDealIds((prev) => {
      const next = new Set(prev);
      next.add(deal.id);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(HIDDEN_DEALS_STORAGE_KEY, JSON.stringify(Array.from(next)));
      }
      return next;
    });

    try {
      setDeals((prev) => prev.filter((item) => item.id !== deal.id));
      if (supabase && hasSupabaseConfig) {
        await deleteDealFromBackend(deal.id);
      }
      pushToast('Deal deleted.', 'share');
    } catch {
      setDealsError('Could not delete from shared backend. Deal was removed locally.');
    } finally {
      setDeletingDealIds((prev) => {
        const next = new Set(prev);
        next.delete(deal.id);
        return next;
      });
    }
  };

  const handleAdminSetDealStatus = async (deal: Deal, status: Deal['status']) => {
    const nextDeal = { ...deal, status };
    try {
      const updatedDeal = await updateDealInBackend(nextDeal);
      setDeals((prev) => [updatedDeal, ...prev.filter((item) => item.id !== updatedDeal.id)]);
    } catch (error) {
      const failure = createSharedPublishFailure(nextDeal, 'update', error);
      setDealsError(`Could not update deal status in ${failure.schema}.${failure.table}. ${failure.reason}`);
      setLastSharedPublishFailure(failure);
    }
  };

  const handleAdminToggleFeatured = async (deal: Deal) => {
    const nextDeal: Deal = {
      ...deal,
      featured: !deal.featured,
      adminTag: !deal.featured ? 'featured' : deal.adminTag === 'featured' ? null : deal.adminTag,
    };

    try {
      const updatedDeal = await updateDealInBackend(nextDeal);
      setDeals((prev) => [updatedDeal, ...prev.filter((item) => item.id !== updatedDeal.id)]);
    } catch (error) {
      const failure = createSharedPublishFailure(nextDeal, 'update', error);
      setDealsError(`Could not update featured status in ${failure.schema}.${failure.table}. ${failure.reason}`);
      setLastSharedPublishFailure(failure);
    }
  };

  const handleAdminToggleTrending = async (deal: Deal) => {
    const nextDeal: Deal = {
      ...deal,
      adminTag: deal.adminTag === 'trending' ? null : 'trending' as const,
    };

    try {
      const updatedDeal = await updateDealInBackend(nextDeal);
      setDeals((prev) => [updatedDeal, ...prev.filter((item) => item.id !== updatedDeal.id)]);
    } catch (error) {
      const failure = createSharedPublishFailure(nextDeal, 'update', error);
      setDealsError(`Could not update trending status in ${failure.schema}.${failure.table}. ${failure.reason}`);
      setLastSharedPublishFailure(failure);
    }
  };

  const handleRedeemClaim = (claimId: string) => {
    setClaims(prev => prev.map(c => c.id === claimId ? { ...c, status: 'redeemed' } : c));
  };

  const handleCopyClaimCode = async (claimId: string, claimCode: string) => {
    const result = await copyTextToClipboard(claimCode);
    setClaimCopyStatus(prev => ({ ...prev, [claimId]: result }));
  };

  const refreshCatalogState = () => {
    setCatalogCoupons(prev => {
      const refreshed = refreshCatalogCoupons(prev);
      setCatalogDropWarnings(refreshed.droppedIds);
      return refreshed.coupons;
    });
  };

  const handleViewClaims = () => {
    setSelectedDeal(null);
    setSelectedDetailDealId(null);
    setNotificationsOpen(false);
    setCurrentView('my-claims');
  };

  const renderDealsErrorBanner = () => {
    if (dealsLoading || !dealsError) {
      return null;
    }

    const canRetryPublish = Boolean(lastSharedPublishFailure) && (hasAdminAccess || currentView === 'business-portal' || isAdminRoute);

      return (
        <div className="rounded-[1.45rem] border border-amber-100 bg-amber-50 px-4 py-3 shadow-sm shadow-amber-100/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-6 text-amber-700">{dealsError}</p>
              {lastSharedPublishFailure ? (
                <p className="mt-2 text-xs font-medium leading-5 text-amber-700/90">
                  Last backend error: {lastSharedPublishFailure.reason}
              </p>
            ) : null}
          </div>
          {canRetryPublish ? (
            <button
              onClick={() => void handleRetryLastSharedPublish()}
              disabled={retryingSharedPublish}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 transition-colors hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {retryingSharedPublish ? 'Retrying...' : 'Retry publish'}
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  const pushNotification = (payload: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    let created: AppNotification | null = null;
    const normalizedMessage = normalizeNotificationMessage(payload.message);

    setNotifications((prev) => {
      const exists = prev.some((item) =>
        item.type === payload.type &&
        normalizeNotificationMessage(item.message) === normalizedMessage &&
        item.dealId === payload.dealId &&
        item.couponId === payload.couponId
      );

      if (exists) return prev;

      created = {
        ...payload,
        message: normalizedMessage,
        id: Math.random().toString(36).slice(2, 11),
        timestamp: Date.now(),
        read: false,
      };

      return [created, ...prev].slice(0, 50);
    });

    if (created) {
      setToastNotifications((prev) => [created!, ...prev].slice(0, 3));
      window.setTimeout(() => {
        setToastNotifications((prev) => prev.filter((item) => item.id !== created!.id));
      }, 3200);
    }
  };

  const pushToast = (message: string, type: AppNotification['type'] = 'share') => {
    const created: AppNotification = {
      id: createUuid(),
      message,
      type,
      timestamp: Date.now(),
      read: true,
    };

    setToastNotifications((prev) => [created, ...prev].slice(0, 3));
    window.setTimeout(() => {
      setToastNotifications((prev) => prev.filter((item) => item.id !== created.id));
    }, 2600);
  };

  const toggleNotifications = () => {
    setNotificationsOpen((prev) => {
      const next = !prev;
      if (!prev) {
        setNotifications((current) => current.map((item) => ({ ...item, read: true })));
      }
      return next;
    });
  };

  const handleContinueWithGoogle = async () => {
    if (!supabase) {
      setAuthError(supabaseConfigIssue || 'Supabase connection is unavailable.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    setAuthInfo('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getAuthRedirectUrl(),
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes('provider is not enabled') || error.message.toLowerCase().includes('unsupported provider')) {
          setAuthError('Google sign-in is not enabled in Supabase yet. You can use email sign-in below for now.');
        } else {
          setAuthError(error.message);
        }
        setAuthLoading(false);
        return;
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Google sign-in could not be started.');
      setAuthLoading(false);
    }
  };

  const handleEmailAuth = async ({
    mode,
    email,
    password,
    fullName,
  }: {
    mode: 'signin' | 'signup';
    email: string;
    password: string;
    fullName?: string;
  }) => {
    if (!email.trim() || !password.trim()) {
      setAuthError('Email and password are required.');
      return;
    }

    if (mode === 'signup' && !fullName?.trim()) {
      setAuthError('Full name is required to create an account.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    setAuthInfo('');

    const normalizedEmail = email.trim().toLowerCase();

    if (mode === 'signin' && normalizedEmail === APPROVED_ADMIN_EMAIL && password === APPROVED_ADMIN_PASSWORD) {
      console.info('[LiveDrop] Admin sign-in granted', {
        email: normalizedEmail,
      });
      setAdminSessionEmail(APPROVED_ADMIN_EMAIL);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, APPROVED_ADMIN_EMAIL);
        window.localStorage.setItem(ADMIN_EMAIL_STORAGE_KEY, APPROVED_ADMIN_EMAIL);
        window.localStorage.setItem(ADMIN_FLAG_STORAGE_KEY, 'true');
      }
      setAuthModalOpen(false);
      setAuthLoading(false);
      setAuthInfo('');
      setAuthError('');
      navigateToPath('/admin');
      return;
    }

    if (!supabase) {
      setAuthError(supabaseConfigIssue || 'Supabase connection is unavailable.');
      setAuthLoading(false);
      return;
    }

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl(),
            data: {
              full_name: fullName?.trim(),
            },
          },
        });

        if (error) {
          setAuthError(error.message);
          setAuthLoading(false);
          return;
        }

        setAuthInfo('Account created. Check your email to confirm your sign-up if confirmation is enabled.');
        setAuthLoading(false);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        setAuthError(error.message);
        setAuthLoading(false);
        return;
      }

      if (isAdminRoute) {
        setAuthInfo('Signed in successfully. Redirecting to the main app.');
        setAuthModalOpen(false);
        navigateToPath('/');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Email authentication failed.');
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    console.info('[LiveDrop] Public sign-out started', {
      routePath,
      adminSessionEmail,
      userEmail: authUser?.email ?? null,
    });
    setAdminSessionEmail(null);
    resetAdminUiState();
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      window.localStorage.removeItem(ADMIN_EMAIL_STORAGE_KEY);
      window.localStorage.removeItem(ADMIN_FLAG_STORAGE_KEY);
    }
    if (supabase) {
      await supabase.auth.signOut();
    }
    setAuthLoading(false);
    navigateToPath('/');
  };

  const handleOpenBusinessPortal = () => {
    setNotificationsOpen(false);
    if (LOCAL_ADMIN_MODE) {
      setRole('business');
      setSubscriptionStatus('active');
      setSubscriptionPlan(BUSINESS_PLAN_ID);
      setSubscriptionMessage('');
      setSelectedDetailDealId(null);
      setCurrentView('business-portal');
      return;
    }

    if (!session && !hasAdminAccess) {
      setAuthError('Sign in with Google to start business access.');
      setAuthModalOpen(true);
      return;
    }

    setSubscriptionMessage('');
    setSelectedDetailDealId(null);
    setCurrentView('business-portal');
  };

  const handleSubscribeNow = async () => {
    if (!supabase || !authUser) {
      setAuthError('Sign in with Google to start business access.');
      setAuthModalOpen(true);
      return;
    }

    if (hasPortalAccess) {
      setCurrentView('business-portal');
      return;
    }

    setSubscriptionLoading(true);
    setSubscriptionMessage('');

    const { data, error } = await supabase.functions.invoke('create-business-checkout', {
      body: {
        planId: BUSINESS_PLAN_ID,
      },
    });

    if (error || !data?.url) {
      setSubscriptionMessage(error?.message ?? 'We could not start checkout right now. Please try again.');
      setSubscriptionLoading(false);
      return;
    }

    const checkoutUrl = normalizeSafeExternalUrl(data.url);
    if (!checkoutUrl) {
      setSubscriptionMessage('Checkout returned an invalid redirect. Please try again.');
      setSubscriptionLoading(false);
      return;
    }

    window.location.assign(checkoutUrl);
  };

  const openExternalUrl = (
    rawUrl: string | null | undefined,
    options?: {
      dedupeKey?: string;
      missingMessage?: string;
      blockedMessage?: string;
    },
  ) => {
    const externalUrl = normalizeSafeExternalUrl(rawUrl);
    if (!externalUrl) {
      if (options?.missingMessage) {
        pushToast(options.missingMessage, 'share');
      }
      return false;
    }

    const dedupeKey = options?.dedupeKey ?? externalUrl;
    const now = Date.now();
    const lastAction = recentExternalActionRef.current;
    if (lastAction && lastAction.key === dedupeKey && now - lastAction.at < EXTERNAL_ACTION_COOLDOWN_MS) {
      return false;
    }

    recentExternalActionRef.current = {
      key: dedupeKey,
      at: now,
    };

    const openedWindow = window.open(externalUrl, '_blank', 'noopener,noreferrer');
    if (!openedWindow) {
      pushToast(options?.blockedMessage ?? 'Browser blocked this link from opening.', 'share');
      return false;
    }

    openedWindow.opener = null;
    return true;
  };

  const openExternalDealLink = (deal: Deal) => {
    const externalUrl = getDealPrimaryActionUrl(deal);
    if (!externalUrl) {
      pushToast('Deal link unavailable right now.', 'share');
      return;
    }

    console.info('[LiveDrop] Opening deal link', {
      dealId: deal.id,
      title: deal.title,
      affiliateUrl: deal.affiliateUrl ?? null,
      websiteUrl: deal.websiteUrl ?? null,
      productUrl: deal.productUrl ?? null,
      externalUrl,
    });
    setViewedDealIds((prev) => {
      const next = new Set(prev);
      next.add(deal.id);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('livedrop_viewed_deals', JSON.stringify(Array.from(next)));
      }
      return next;
    });

    openExternalUrl(externalUrl, {
      dedupeKey: `deal:${deal.id}:${externalUrl}`,
      missingMessage: 'Deal link unavailable right now.',
      blockedMessage: 'Allow pop-ups to open this deal.',
    });
  };

  const openDealProductDetails = (deal: Deal) => {
    console.info('[LiveDrop] Opening internal product details view', {
      dealId: deal.id,
      title: deal.title,
      affiliateUrl: deal.affiliateUrl ?? null,
      websiteUrl: deal.websiteUrl ?? null,
      productUrl: deal.productUrl ?? null,
    });

    handleOpenDealDetail(deal);
  };

  const handleOpenDealDetail = (deal: Deal) => {
    setViewedDealIds((prev) => {
      const next = new Set(prev);
      next.add(deal.id);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('livedrop_viewed_deals', JSON.stringify(Array.from(next)));
      }
      return next;
    });
    if (currentView === 'deal-detail' && selectedDetailDealId === deal.id) {
      return;
    }

    setNotificationsOpen(false);
    setDropMode(deal.businessType === 'online' ? 'online' : 'local');
    setSelectedDetailDealId(deal.id);
    setCurrentView('deal-detail');
  };

  const handleCloseDealDetail = () => {
    setNotificationsOpen(false);
    setCurrentView('live-deals');
    setSelectedDetailDealId(null);
  };

  const handleSaveToCatalog = (deal: Deal) => {
    if (!canSaveDealToCatalog(deal)) return;

    setCatalogCoupons(prev => {
      if (prev.some(coupon => coupon.dealId === deal.id && coupon.status === 'active')) {
        return prev;
      }

      const newCoupon = createCatalogCouponFromDeal(deal);
      setCatalogSaveFeedback(current => ({ ...current, [deal.id]: 'Saved to Catalog' }));
      return [newCoupon, ...prev];
    });
  };

  const handleRedeemCatalogCoupon = (couponId: string) => {
    setCatalogCoupons(prev =>
      prev.map(coupon => coupon.id === couponId ? { ...coupon, status: 'redeemed' } : coupon)
    );
    setCatalogDropWarnings(prev => prev.filter(id => id !== couponId));
  };

  const handleOpenCatalog = () => {
    refreshCatalogState();
    setSelectedDetailDealId(null);
    setNotificationsOpen(false);
    setCurrentView('catalog');
  };

  const handleGlobalLocalFeedMode = () => {
    setNotificationsOpen(false);
    setDropModeEnabled(false);
    setDropMode('local');
    setSelectedCategory('All');
    setSelectedLocalSubcategory('All');
    setSelectedFeedFilter('all');
  };

  const handleGlobalOnlineFeedMode = () => {
    setNotificationsOpen(false);
    if (dropMode !== 'online') {
      setDropModeEnabled(false);
    }
    setDropMode('online');
    setSelectedCategory('All');
    setSelectedFeedFilter('all');
  };

  const renderLiveDeals = () => {
    const now = Date.now();
    const isOnlineMode = dropMode === 'online';
    const isDropModeActive = isOnlineMode && dropModeEnabled;
    const localDeals = deals.filter((deal) => deal.businessType !== 'online' && (deal.status ?? 'active') === 'active');
    const onlineDeals = deals.filter((deal) => deal.businessType === 'online' && (deal.status ?? 'active') === 'active');
    const onlineDealsWithSubcategory = onlineDeals.map((deal) => ({
      ...deal,
      onlineSubcategory: getOnlineDealSubcategory(deal),
    }));
    const dealsWithDistance = localDeals.map(deal => {
      const dist = getEffectiveLocalDealDistance(userLocation, deal, hasPreciseUserLocation);
      return {
        ...deal,
        computedDistanceValue: dist,
        computedDistanceLabel: formatDistance(dist),
        localSubcategory: getLocalDealSubcategory(deal),
      };
    });
    const localSubcategoryOptions = isOnlineMode ? [] : (LOCAL_SUBCATEGORY_OPTIONS[selectedCategory] ?? []);
    const shouldShowLocalSubcategories =
      dropMode === 'local' && selectedCategory !== 'All' && localSubcategoryOptions.length > 0;
    const shouldShowOnlineSubcategories =
      dropMode === 'online' && (selectedCategory === 'Tech' || selectedCategory === 'Home' || selectedCategory === 'Fashion');
    const onlineSubcategoryOptions = shouldShowOnlineSubcategories
      ? (
        selectedCategory === 'Tech'
          ? ONLINE_TECH_SUBCATEGORY_OPTIONS
          : selectedCategory === 'Home'
            ? ONLINE_HOME_SUBCATEGORY_OPTIONS
            : ONLINE_FASHION_SUBCATEGORY_OPTIONS
      ).filter((subcategory) => subcategory !== 'All')
      : [];
    const normalizedDesktopSearch = desktopSearchQuery.trim().toLowerCase();
    const matchesDesktopSearch = (deal: Deal) => {
      if (!normalizedDesktopSearch) return true;
      return [
        deal.title,
        deal.businessName,
        deal.description,
        deal.offerText,
        deal.category,
        deal.localSubcategory,
        deal.onlineSubcategory,
      ]
        .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''))
        .some((value) => value.includes(normalizedDesktopSearch));
    };

    const activeLocalDeals = dealsWithDistance
      .filter(d =>
        d.expiresAt > now &&
        d.computedDistanceValue <= radius &&
        (selectedCategory === 'All' || d.category === selectedCategory) &&
        (
          selectedCategory === 'All'
          || selectedLocalSubcategory === 'All'
          || d.localSubcategory === selectedLocalSubcategory
        ) &&
        matchesDesktopSearch(d)
      )
      .sort((a, b) => a.computedDistanceValue - b.computedDistanceValue);

    const trendingDeals = [...activeLocalDeals]
      .sort((a, b) => (b.claimCount ?? b.currentClaims) - (a.claimCount ?? a.currentClaims))
      .slice(0, 5);

    const endingSoonDeals = activeLocalDeals
      .filter(d => d.expiresAt - now <= 10 * 60 * 1000)
      .sort((a, b) => a.expiresAt - b.expiresAt);

    const justDroppedDeals = activeLocalDeals
      .filter(d => now - d.createdAt <= 45 * 60 * 1000)
      .sort((a, b) => b.createdAt - a.createdAt);

    const expiredLocalDeals = dealsWithDistance.filter(d => d.expiresAt <= now);
    const trendingIds = new Set(trendingDeals.map(deal => deal.id));
    const endingSoonIds = new Set(endingSoonDeals.map(deal => deal.id));
    const justDroppedIds = new Set(justDroppedDeals.map(deal => deal.id));

    const getDealFeedTag = (dealId: string): 'Trending' | 'Ending Soon' | 'Just Dropped' | null => {
      if (trendingIds.has(dealId)) return 'Trending';
      if (endingSoonIds.has(dealId)) return 'Ending Soon';
      if (justDroppedIds.has(dealId)) return 'Just Dropped';
      return null;
    };

    const filteredActiveLocalDeals = activeLocalDeals.filter((deal) => {
      const dealTag = getDealFeedTag(deal.id);
      if (selectedFeedFilter === 'trending') return dealTag === 'Trending';
      if (selectedFeedFilter === 'ending-soon') return dealTag === 'Ending Soon';
      if (selectedFeedFilter === 'just-dropped') return dealTag === 'Just Dropped';
      return true;
    });

    const hasOnlineSubcategory =
      selectedCategory === 'Tech' || selectedCategory === 'Home' || selectedCategory === 'Fashion';

    const activeOnlineDeals = onlineDealsWithSubcategory.filter(
      (deal) =>
        deal.expiresAt > now &&
        (selectedCategory === 'All' || deal.category === selectedCategory) &&
        (
          !hasOnlineSubcategory ||
          selectedOnlineSubcategory === 'All' ||
          deal.onlineSubcategory === selectedOnlineSubcategory
        ) &&
        matchesDesktopSearch(deal),
    );

    const rankedDropModeDeals = [...activeOnlineDeals]
      .filter((deal) => isDropModeEligible(deal))
      .sort((a, b) => {
        const scoreDelta = getDropModePriorityScore(b, dropModeShuffleSeed, now) - getDropModePriorityScore(a, dropModeShuffleSeed, now);
        if (scoreDelta !== 0) return scoreDelta;
        return b.createdAt - a.createdAt;
      });

    const filteredOnlineDeals = isDropModeActive
      ? rankedDropModeDeals.slice(0, Math.min(8, rankedDropModeDeals.length))
      : [...activeOnlineDeals].sort((a, b) => b.createdAt - a.createdAt);

    const trendingOnlineDeals = [...filteredOnlineDeals]
      .sort((a, b) => (b.claimCount ?? b.currentClaims) - (a.claimCount ?? a.currentClaims))
      .slice(0, 5);

    const endingSoonOnlineDeals = filteredOnlineDeals
      .filter((deal) => deal.hasTimer !== false && deal.expiresAt - Date.now() <= 10 * 60 * 1000)
      .sort((a, b) => a.expiresAt - b.expiresAt);

    const justDroppedOnlineDeals = filteredOnlineDeals
      .filter((deal) => now - deal.createdAt <= 60 * 60 * 1000)
      .sort((a, b) => b.createdAt - a.createdAt);

    const trendingOnlineIds = new Set(trendingOnlineDeals.map((deal) => deal.id));
    const endingSoonOnlineIds = new Set(endingSoonOnlineDeals.map((deal) => deal.id));
    const justDroppedOnlineIds = new Set(justDroppedOnlineDeals.map((deal) => deal.id));

    const getOnlineDropTag = (dealId: string): 'Trending' | 'Ending Soon' | 'Just Dropped' | null => {
      if (trendingOnlineIds.has(dealId)) return 'Trending';
      if (endingSoonOnlineIds.has(dealId)) return 'Ending Soon';
      if (justDroppedOnlineIds.has(dealId)) return 'Just Dropped';
      return null;
    };

    const filteredOnlineDealsByTab = filteredOnlineDeals.filter((deal) => {
      const dealTag = getOnlineDropTag(deal.id);
      if (selectedFeedFilter === 'trending') return dealTag === 'Trending';
      if (selectedFeedFilter === 'ending-soon') return dealTag === 'Ending Soon';
      if (selectedFeedFilter === 'just-dropped') return dealTag === 'Just Dropped';
      return true;
    });
    const isOnlineCategoryView = isOnlineMode && selectedCategory !== 'All';
    const sortedOnlineDealsByTab = isDropModeActive
      ? filteredOnlineDealsByTab
      : [...filteredOnlineDealsByTab].sort((a, b) => b.createdAt - a.createdAt);
    const onlineDealRows = chunkItems(sortedOnlineDealsByTab, 7);
    const pagedCategoryOnlineDeals = [...filteredOnlineDealsByTab].sort((a, b) => b.createdAt - a.createdAt);
    const categoryOnlineDealPages = chunkItems(pagedCategoryOnlineDeals, 7);
    const totalCategoryOnlinePages = Math.max(1, categoryOnlineDealPages.length);
    const safeOnlineCategoryPage = Math.min(onlineCategoryPage, totalCategoryOnlinePages - 1);
    const visibleCategoryOnlineDeals = categoryOnlineDealPages[safeOnlineCategoryPage] ?? [];
    const hasMoreCategoryPages = safeOnlineCategoryPage < totalCategoryOnlinePages - 1;
    const onlineHeadline = selectedCategory === 'All' ? 'All' : getCategoryLabel(selectedCategory);
    const onlineCategoryDescription = isDropModeActive
      ? selectedCategory === 'All'
        ? 'Urgent picks, newest first.'
        : `Urgent ${getCategoryLabel(selectedCategory).toLowerCase()} picks, newest first.`
      : selectedCategory === 'All'
        ? 'Fresh online deals, newest first.'
        : `Fresh ${getCategoryLabel(selectedCategory).toLowerCase()} deals, newest first.`;
    const onlineHeroIconName = selectedCategory === 'All' ? 'online' : getCategoryIconName(selectedCategory);

    const getOnlineDealHeroLabel = (offerText?: string | null) => {
      const normalizedOffer = (typeof offerText === 'string' ? offerText : '').trim();
      if (!normalizedOffer) return 'DEAL';
      const uppercaseOffer = normalizedOffer.toUpperCase();
      const percentMatch = uppercaseOffer.match(/\d+\s*%(\s*OFF)?/);

      if (percentMatch) {
        return percentMatch[0].replace(/\s+/g, ' ').trim().includes('OFF')
          ? percentMatch[0].replace(/\s+/g, ' ').trim()
          : `${percentMatch[0].replace(/\s+/g, ' ').trim()} OFF`;
      }

      if (uppercaseOffer.includes('FREE SHIPPING')) return 'FREE SHIPPING';
      if (uppercaseOffer.includes('FREE')) return 'FREE';
      if (uppercaseOffer.includes('2 FOR 1')) return '2 FOR 1';
      if (uppercaseOffer.includes('BUNDLE')) return 'BUNDLE DEAL';
      if (uppercaseOffer.includes('FLASH')) return 'FLASH SALE';

      return uppercaseOffer.length > 18 ? `${uppercaseOffer.slice(0, 18).trim()}...` : uppercaseOffer;
    };

    const activeCategoryOptions = dropMode === 'local' ? CATEGORY_OPTIONS : ONLINE_CATEGORY_OPTIONS;
    const controlHeightClass = 'h-9.5';
    const controlRadiusClass = 'rounded-[0.95rem]';
    const controlPaddingClass = 'px-3';
    const controlTextClass = 'text-[9px] font-black uppercase tracking-[0.1em]';
    const localEmptyStateMessage =
      selectedLocalSubcategory !== 'All' && selectedFeedFilter !== 'all'
        ? `No ${selectedFeedFilter.replace('-', ' ')} ${selectedLocalSubcategory.toLowerCase()} deals within ${radius} miles.`
        : selectedLocalSubcategory !== 'All'
          ? `No ${selectedLocalSubcategory.toLowerCase()} deals within ${radius} miles.`
          : selectedFeedFilter === 'all'
            ? `No live deals within ${radius} miles.`
            : `No ${selectedFeedFilter.replace('-', ' ')} deals within ${radius} miles.`;
    const handleSelectActiveCategory = (category: string) => {
      if (dropMode === 'local') {
        setSelectedLocalSubcategory('All');
      }
      setSelectedCategory(category);
    };
    const handleDropModeToggle = () => {
      const nextDropModeState = !dropModeEnabled;
      setDropModeEnabled(nextDropModeState);
      if (nextDropModeState) {
        setDropModeShuffleSeed(Date.now());
        pushToast("Drop Mode is on. You're now seeing the sharpest limited-time drops.", 'share');
        return;
      }

      pushToast('Drop Mode is off. Back to the full online feed.', 'share');
    };
    const renderOnlineDealCard = (deal: Deal) => {
      const primaryActionUrl = getDealPrimaryActionUrl(deal);
      const displayBusinessName = deal.businessName?.trim() || 'LiveDrop Partner';
      const displayTitle = deal.title?.trim() || 'Limited-Time Deal';
      const displayDescription = deal.description?.trim() || 'Fresh deal available right now.';
      const displayOfferText = deal.offerText?.trim() || 'Live Deal';
      const viewed = viewedDealIds.has(deal.id);

      return (
        <div
          key={deal.id}
          role="button"
          tabIndex={0}
          aria-label={`Open details for ${deal.title}`}
          onClick={() => handleOpenDealDetail(deal)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleOpenDealDetail(deal);
            }
          }}
            className={`overflow-hidden rounded-[1.45rem] bg-white transition-all duration-200 ${
              isDropModeActive
                ? 'border border-indigo-100/80 shadow-[0_14px_32px_rgba(15,23,42,0.08)] ring-1 ring-indigo-100/40'
                : 'border border-slate-100 shadow-[0_10px_24px_rgba(148,163,184,0.14)]'
            } cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2`}
          >
          <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
            <DealArtwork
              src={deal.imageUrl}
              alt={displayTitle}
              fit="contain"
              iconSize={28}
              imageClassName="p-3 transition-transform duration-500 hover:scale-[1.02]"
            />
            {isDropModeActive ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/18 via-slate-950/6 to-transparent" />
            ) : null}
            <div className="pointer-events-none absolute left-3 top-3">
              <span className={`inline-flex max-w-[74%] items-center px-3 py-1.5 text-center text-[13px] font-black uppercase leading-[1.05] tracking-[0.08em] text-white ${
                isDropModeActive
                  ? 'min-h-[42px] rounded-[1.05rem] bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 px-4 py-2 text-[16px] shadow-[0_16px_30px_rgba(99,102,241,0.34)] ring-1 ring-white/30 backdrop-blur-sm'
                  : 'min-h-[34px] rounded-[0.95rem] bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 shadow-[0_10px_24px_rgba(99,102,241,0.28)]'
              }`}>
                {getOnlineDealHeroLabel(displayOfferText)}
              </span>
            </div>
            {isDropModeActive && deal.hasTimer ? (
              <div className="pointer-events-none absolute bottom-3 left-3">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-slate-950/70 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-white backdrop-blur-sm">
                  <AppIcon name="clock" size={11} />
                  Ends soon
                </span>
              </div>
            ) : null}
          </div>
          <div className="p-3.5">
            <div className="mb-2.5 flex items-start justify-between gap-2.5">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  {getOnlineDropTag(deal.id) ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-indigo-600">
                      <AppIcon name={getFeedTagIconName(getOnlineDropTag(deal.id)!)} size={11} />
                      {getOnlineDropTag(deal.id)}
                    </span>
                  ) : null}
                  {isDropModeActive ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-600">
                      <AppIcon name="spark" size={11} />
                      Drop Mode Pick
                    </span>
                  ) : null}
                </div>
                <p className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-indigo-500">
                  <AppIcon name={getCategoryIconName(deal.category)} size={12} />
                  {getCategoryLabel(deal.category)}
                </p>
                <h3 className="mt-1 line-clamp-2 break-words text-[1.02rem] font-extrabold leading-[1.2] text-slate-900">{displayTitle}</h3>
                <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{displayBusinessName}</p>
              </div>
              {deal.hasTimer ? (
                <Timer
                  expiresAt={deal.expiresAt}
                  onExpire={forceRefreshDealsView}
                  className={isDropModeActive ? 'rounded-full bg-indigo-50 px-2.5 py-1 text-sm text-indigo-600 shadow-sm shadow-indigo-100/70' : 'text-sm'}
                />
              ) : null}
            </div>
            <div className={`mb-2.5 border border-indigo-100 px-3 py-2 ${
              isDropModeActive
                ? 'rounded-[1rem] bg-gradient-to-r from-indigo-50 via-violet-50/85 to-sky-50/80 py-2.5 shadow-inner shadow-white/60'
                : 'rounded-[0.95rem] bg-indigo-50/80'
            }`}>
              <p className="line-clamp-2 break-words text-[1rem] font-black text-indigo-600">{displayOfferText}</p>
              {isDropModeActive ? (
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Limited-time price drop</p>
              ) : null}
            </div>
            <p className={`mb-3 line-clamp-3 break-words text-[12px] text-slate-500 ${isDropModeActive ? 'leading-[1.6]' : 'leading-[1.55]'}`}>{displayDescription}</p>
            <div
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <DealEngagementBar
                deal={deal}
                pendingAction={dealEngagementPending[deal.id] ?? null}
                onLike={handleLikeDeal}
                onDislike={handleDislikeDeal}
                onShare={handleShareDeal}
              />
            </div>
            {hasAdminAccess ? (
              <div
                className="mt-3 grid grid-cols-2 gap-2"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleEditDeal(deal);
                  }}
                  className="inline-flex h-9.5 items-center justify-center rounded-[0.95rem] border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleAdminDeleteDeal(deal);
                  }}
                  disabled={deletingDealIds.has(deal.id)}
                  className={`inline-flex h-9.5 items-center justify-center rounded-[0.95rem] border px-3 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
                    deletingDealIds.has(deal.id)
                      ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                      : 'border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100'
                  }`}
                >
                  {deletingDealIds.has(deal.id) ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ) : null}
            {isAdminRoute && showDebug ? (
              <p className="mb-3 mt-3 truncate rounded-[0.9rem] bg-slate-50 px-3 py-2 font-mono text-[10px] text-slate-400">
                Link: {primaryActionUrl ?? 'No link saved'}
              </p>
            ) : null}
            <div className="mt-3 grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openDealProductDetails(deal);
                }}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[1rem] border border-slate-200 bg-white px-3 text-[11px] min-[390px]:px-4 min-[390px]:text-[12px] font-black uppercase tracking-[0.08em] text-slate-700 shadow-sm shadow-slate-200/45 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 active:translate-y-0 active:scale-[0.985]"
              >
                <AppIcon name="deal" size={15} />
                <span>Product Details</span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openExternalDealLink(deal);
                }}
                disabled={!primaryActionUrl}
                className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-[1rem] px-3 text-[11px] min-[390px]:px-4 min-[390px]:text-[12px] font-black uppercase tracking-[0.08em] text-white transition-all shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 ${
                  primaryActionUrl
                    ? 'bg-emerald-500 shadow-emerald-100/80 hover:-translate-y-0.5 hover:bg-emerald-600 hover:shadow-xl hover:shadow-emerald-200/70 active:translate-y-0 active:scale-[0.985]'
                    : 'cursor-not-allowed bg-slate-300 shadow-none'
                }`}
              >
                <AppIcon name="deal" size={15} />
                <span>Get Deal</span>
              </button>
            </div>
          </div>
        </div>
      );
    };

    const renderCompactCategoryOnlineDealCard = (deal: Deal) => {
      const primaryActionUrl = getDealPrimaryActionUrl(deal);
      const displayBusinessName = deal.businessName?.trim() || 'LiveDrop Partner';
      const displayTitle = deal.title?.trim() || 'Limited-Time Deal';
      const displayDescription = deal.description?.trim() || 'Fresh deal available right now.';
      const displayOfferText = deal.offerText?.trim() || 'Live Deal';
      const viewed = viewedDealIds.has(deal.id);

      return (
        <div
          key={deal.id}
          role="button"
          tabIndex={0}
          aria-label={`Open details for ${deal.title}`}
          onClick={() => handleOpenDealDetail(deal)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleOpenDealDetail(deal);
            }
          }}
          className={`overflow-hidden rounded-[1.3rem] border border-slate-100 bg-white shadow-[0_10px_24px_rgba(148,163,184,0.14)] transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 ${
            viewed ? 'opacity-90 border-slate-200 shadow-[0_6px_16px_rgba(148,163,184,0.12)]' : ''
          }`}
        >
          <div className="relative aspect-[1/1] overflow-hidden bg-slate-100">
            <DealArtwork
              src={deal.imageUrl}
              alt={displayTitle}
              fit="contain"
              iconSize={24}
              imageClassName={`p-2 ${viewed ? 'opacity-85' : ''}`}
            />
            <div className="pointer-events-none absolute left-2 top-2">
              <span className="inline-flex min-h-[28px] max-w-[76%] items-center rounded-[0.9rem] bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 px-2.5 py-1 text-center text-[10px] font-black uppercase leading-[1.05] tracking-[0.08em] text-white shadow-[0_10px_20px_rgba(99,102,241,0.22)]">
                {getOnlineDealHeroLabel(displayOfferText)}
              </span>
            </div>
            {viewed ? (
              <span className="pointer-events-none absolute right-2 bottom-2 rounded-full bg-white/85 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 shadow-sm">
                Viewed
              </span>
            ) : null}
            {deal.hasTimer ? (
              <div className="pointer-events-none absolute bottom-2 left-2">
                <Timer
                  expiresAt={deal.expiresAt}
                  onExpire={forceRefreshDealsView}
                  className="rounded-full bg-white/92 px-2 py-1 text-[11px] font-black text-indigo-600 shadow-sm"
                />
              </div>
            ) : null}
          </div>
          <div className="space-y-2.5 p-3">
            <div className="space-y-1">
              <p className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-[0.14em] text-indigo-500">
                <AppIcon name={getCategoryIconName(deal.category)} size={10} />
                {getCategoryLabel(deal.category)}
              </p>
              <h3 className="line-clamp-2 break-words text-[0.92rem] font-extrabold leading-[1.2] text-slate-900">{displayTitle}</h3>
              <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{displayBusinessName}</p>
            </div>
            <p className="line-clamp-2 break-words text-[11px] leading-[1.5] text-slate-500">{displayDescription}</p>
            <div
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <DealEngagementBar
                deal={deal}
                compact
                pendingAction={dealEngagementPending[deal.id] ?? null}
                onLike={handleLikeDeal}
                onDislike={handleDislikeDeal}
                onShare={handleShareDeal}
              />
            </div>
            {hasAdminAccess ? (
              <div
                className="grid grid-cols-2 gap-2"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleEditDeal(deal);
                  }}
                  className="inline-flex h-8.5 items-center justify-center rounded-[0.9rem] border border-slate-200 bg-white px-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleAdminDeleteDeal(deal);
                  }}
                  disabled={deletingDealIds.has(deal.id)}
                  className={`inline-flex h-8.5 items-center justify-center rounded-[0.9rem] border px-2.5 text-[9px] font-black uppercase tracking-[0.1em] transition-colors ${
                    deletingDealIds.has(deal.id)
                      ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                      : 'border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100'
                  }`}
                >
                  {deletingDealIds.has(deal.id) ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openDealProductDetails(deal);
                }}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[0.95rem] border border-slate-200 bg-white px-3 text-[11px] font-black uppercase tracking-[0.08em] text-slate-700 shadow-sm shadow-slate-200/35 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 hover:border-slate-300 hover:bg-slate-50"
              >
                <AppIcon name="deal" size={13} />
                <span>Product Details</span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openExternalDealLink(deal);
                }}
                disabled={!primaryActionUrl}
                className={`inline-flex h-9 w-full items-center justify-center gap-2 rounded-[0.95rem] px-3 text-[11px] font-black uppercase tracking-[0.08em] text-white transition-all shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 ${
                  primaryActionUrl
                    ? 'bg-emerald-500 shadow-emerald-100/70 hover:bg-emerald-600'
                    : 'cursor-not-allowed bg-slate-300 shadow-none'
                }`}
              >
                <AppIcon name="deal" size={13} />
                <span>Get Deal</span>
              </button>
            </div>
          </div>
        </div>
      );
    };

    const renderOnlineGridFiller = (onClick: () => void) => (
      <button
        type="button"
        onClick={onClick}
        aria-label="Load more deals"
        className={`hidden min-[360px]:block w-full h-full overflow-hidden rounded-[1.3rem] border border-slate-200/70 bg-white shadow-[0_10px_24px_rgba(148,163,184,0.12)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(99,102,241,0.14)] ${
          isMoreDealsAnimating ? 'scale-95 shadow-[0_14px_32px_rgba(99,102,241,0.18)]' : ''
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Media area */}
          <div className="relative aspect-[1/1] rounded-[1.05rem] bg-white transition-all duration-150 active:brightness-[1.08]">
            <div className="absolute inset-0 flex items-center justify-center">
                <img
                  src={brandBoltLogo3d}
                  alt="More deals"
                  className={`h-30 w-30 object-contain transition-all duration-150 opacity-80 ${
                    isMoreDealsAnimating
                      ? 'scale-110 brightness-115 drop-shadow-[0_6px_18px_rgba(99,102,241,0.35)]'
                      : 'active:brightness-115 active:scale-105'
                  }`}
                />
            </div>
          </div>
          {/* Content area */}
          <div className="flex flex-1 flex-col items-center justify-center px-3 pb-3 pt-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">More Deals</span>
            <span className="mt-1 text-[11px] font-medium text-slate-400">Tap to load more</span>
          </div>
        </div>
      </button>
    );

    return (
      <div className="space-y-4">
        {dealsLoading ? (
          <div className="rounded-[1.25rem] border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-[11px] font-semibold text-indigo-700">
            Loading live deals...
          </div>
        ) : null}

        {renderDealsErrorBanner()}

        <div className="hidden min-[1024px]:grid min-[1024px]:grid-cols-[1fr_auto_1fr] min-[1024px]:items-center min-[1024px]:gap-3 min-[1024px]:rounded-[1.1rem] min-[1024px]:border min-[1024px]:border-slate-100 min-[1024px]:bg-white min-[1024px]:px-4 min-[1024px]:py-2.5 min-[1024px]:shadow-sm">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
            Browse
          </div>
          <div className="flex items-center justify-center">
            <div className="inline-grid h-11 w-full max-w-[520px] grid-cols-2 items-center gap-1 rounded-[1.2rem] border border-slate-200 bg-white p-1 shadow-[0_8px_20px_rgba(148,163,184,0.16)]">
              <button
                type="button"
                onClick={handleGlobalLocalFeedMode}
                aria-pressed={dropMode === 'local'}
                className={`inline-flex h-full items-center justify-center gap-2 rounded-[0.95rem] px-4 text-[11px] font-black uppercase tracking-[0.12em] transition-all ${
                  dropMode === 'local'
                    ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 text-white shadow-[0_10px_20px_rgba(99,102,241,0.28)]'
                    : 'text-slate-500 hover:text-indigo-600'
                }`}
              >
                <AppIcon name="pin" size={16} />
                <span>Local</span>
                {dropMode === 'local' ? (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-indigo-600">
                    <AppIcon name="check" size={10} />
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={handleGlobalOnlineFeedMode}
                aria-pressed={dropMode === 'online'}
                className={`inline-flex h-full items-center justify-center gap-2 rounded-[0.95rem] px-4 text-[11px] font-black uppercase tracking-[0.12em] transition-all ${
                  dropMode === 'online'
                    ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 text-white shadow-[0_10px_20px_rgba(99,102,241,0.28)]'
                    : 'text-slate-500 hover:text-indigo-600'
                }`}
              >
                <AppIcon name="online" size={16} />
                <span>Online</span>
                {dropMode === 'online' ? (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-indigo-600">
                    <AppIcon name="check" size={10} />
                  </span>
                ) : null}
              </button>
            </div>
          </div>
          <span className="justify-self-end text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {normalizedDesktopSearch ? `Searching "${desktopSearchQuery.trim()}"` : 'Popular deals right now'}
          </span>
        </div>

        {/* Developer Debug Section */}
        {isAdminRoute && showDebug && dropMode === 'local' && (
          <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-2xl mb-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <AppIcon name="debug" size={60} />
            </div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Developer Debug</h3>
                <button onClick={() => setShowDebug(false)} className="text-[10px] font-black uppercase text-white/40 hover:text-white">Hide</button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-[8px] font-black uppercase text-white/40 mb-1">User Lat/Lng</p>
                  <p className="font-mono text-[10px] font-bold">{userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-[8px] font-black uppercase text-white/40 mb-1">Total Deals</p>
                  <p className="font-mono text-xs font-bold">{localDeals.length}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-[8px] font-black uppercase text-white/40 mb-1">Active Deals</p>
                  <p className="font-mono text-xs font-bold">{localDeals.filter(d => d.expiresAt > Date.now()).length}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-[8px] font-black uppercase text-white/40 mb-1">Visible (in {radius}mi)</p>
                  <p className="font-mono text-xs font-bold text-indigo-400">{activeLocalDeals.length}</p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    restartLocalDeals();
                  }}
                  className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-[8px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <AppIcon name="refresh" size={12} />
                  Reset & Re-seed Near Me
                </button>
              </div>
              
              <p className="text-[8px] text-white/30 italic mt-3">Deals are sorted by nearest first.</p>
            </div>
          </div>
        )}

          <div className="grid grid-cols-2 gap-1.5 rounded-[1.35rem] bg-slate-100/90 p-1 min-[1024px]:hidden">
          {[
            { id: 'local', label: 'Local', icon: 'pin' as const, onClick: handleGlobalLocalFeedMode },
            { id: 'online', label: 'Online', icon: 'online' as const, onClick: handleGlobalOnlineFeedMode },
          ].map(option => (
            <button
              key={option.id}
              onClick={option.onClick}
              className={`inline-flex ${controlHeightClass} items-center justify-center gap-1.5 rounded-[1rem] ${controlPaddingClass} text-[9px] min-[360px]:text-[10px] font-black transition-all ${
                dropMode === option.id
                    ? 'bg-white text-indigo-600 shadow-sm shadow-slate-200/50'
                    : 'bg-transparent text-slate-500'
                }`}
              >
                <AppIcon name={option.icon} size={16} />
                {option.label}
            </button>
          ))}
        </div>

        {/* Location & Radius Header */}
        {dropMode === 'local' ? (
            <div className="mb-3 rounded-[1.45rem] border border-slate-100 bg-white p-3.5 shadow-sm shadow-slate-200/35">
              <div className="mb-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`rounded-[0.95rem] p-2 ${hasPreciseUserLocation ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-400'}`}>
                    <AppIcon name="pin" size={18} className={locationStatus === 'loading' ? 'animate-spin' : ''} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Your Location</p>
                    <p className="text-[13px] font-semibold text-slate-700">
                      {locationDisplayName}
                    </p>
                  {!hasPreciseUserLocation ? (
                    <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                      Enable location for accurate nearby deals.
                    </p>
                  ) : null}
                </div>
              </div>
              <button 
                onClick={fetchLocation}
                className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                title="Refresh Location"
              >
                <AppIcon name="refresh" size={18} />
              </button>
            </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-50">
              <span className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">Search Radius</span>
              <div className="flex items-center gap-1 rounded-[0.95rem] bg-slate-50 p-1">
                {RADIUS_OPTIONS.map(r => (
                  <button
                    key={r}
                    onClick={() => setRadius(r)}
                    className={`inline-flex ${controlHeightClass} min-w-[38px] items-center justify-center rounded-lg border ${controlTextClass} transition-all ${
                      radius === r
                        ? 'border-white bg-white text-indigo-600 shadow-sm shadow-slate-200/40'
                        : 'border-transparent bg-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {r}mi
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-3 rounded-[1.45rem] border border-slate-100 bg-white px-3 py-2 shadow-sm shadow-slate-200/35">
            <div className="flex items-center gap-2 min-[360px]:gap-3">
              <div className="flex h-10 w-10 min-[360px]:h-11 min-[360px]:w-11 items-center justify-center rounded-[0.95rem] bg-indigo-50 text-indigo-600 shadow-inner shadow-white/70 shrink-0">
                <AppIcon name="online" size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Online</p>
                  <span className={`text-[10px] min-[360px]:text-[11px] font-black uppercase tracking-[0.14em] ${isDropModeActive ? 'text-indigo-600' : 'text-slate-500'}`}>
                    {isDropModeActive ? 'Drop Mode On' : 'Drop Mode'}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] min-[360px]:text-[13px] font-semibold leading-[1.3] text-slate-700 line-clamp-2">
                  {isDropModeActive
                    ? 'Curated for speed: bigger savings, shorter windows.'
                    : 'Turn on Drop Mode for the fastest, best-value online drops.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleDropModeToggle}
                aria-pressed={isDropModeActive}
                aria-label={isDropModeActive ? 'Turn Drop Mode off' : 'Turn Drop Mode on'}
                className="group relative inline-flex h-16 w-16 min-[360px]:h-[74px] min-[360px]:w-[74px] items-center justify-center rounded-[1.05rem] border border-indigo-200/80 bg-white/35 p-0 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/80 shrink-0"
              >
                <div className="relative h-full w-full flex items-center justify-center">
                  <img
                    src={brandBoltLogo3d}
                    alt=""
                    className={`absolute h-28 w-28 min-[360px]:h-[128px] min-[360px]:w-[128px] object-contain transition-all duration-200 ${
                      isDropModeActive
                        ? 'opacity-0 scale-90'
                        : 'opacity-100 scale-100 group-hover:brightness-110'
                    }`}
                  />
                  <img
                    src={brandBoltLogo3dActive}
                    alt=""
                    className={`absolute h-28 w-28 min-[360px]:h-[128px] min-[360px]:w-[128px] object-contain transition-all duration-200 ${
                      isDropModeActive
                        ? 'opacity-100 scale-112 drop-shadow-[0_0_34px_rgba(111,114,255,0.9)]'
                        : 'opacity-0 scale-90'
                    }`}
                  />
                </div>
              </button>
            </div>
          </div>
        )}

        {isOnlineMode ? (
          <div className="relative mb-3 overflow-hidden rounded-[1.8rem] border border-indigo-100/80 bg-[linear-gradient(160deg,rgba(255,255,255,0.98)_0%,rgba(245,247,255,0.96)_58%,rgba(239,244,255,0.92)_100%)] px-3.5 py-2.5 max-[359px]:px-3 shadow-[0_14px_30px_rgba(148,163,184,0.12)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_38%),radial-gradient(circle_at_left_center,rgba(56,189,248,0.1),transparent_34%)]" />
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-indigo-500/[0.06] rotate-[16deg] min-[360px]:right-4">
              <AppIcon name={onlineHeroIconName} size={50} strokeWidth={1.35} className="min-[360px]:scale-[1.16]" />
            </div>
            <span className={`absolute right-3 top-3 inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[9px] min-[360px]:right-4 min-[360px]:top-3.5 min-[360px]:px-2.5 min-[360px]:text-[10px] font-black uppercase tracking-[0.1em] ${
              isDropModeActive
                ? 'border-transparent bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 text-white shadow-[0_10px_24px_rgba(99,102,241,0.24)]'
                : 'border-indigo-100 bg-white/85 text-indigo-600 shadow-sm shadow-indigo-100/70'
            }`}>
              {sortedOnlineDealsByTab.length} Drops
            </span>
            <div className="relative z-10 min-w-0 pr-[4.4rem] min-[360px]:pr-20">
              <p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-400/90">Online</p>
              <h2 className="mt-1 text-[1.12rem] min-[360px]:text-[1.24rem] font-bold leading-[1.02] tracking-[-0.04em] text-slate-800">
                {onlineHeadline}
              </h2>
              <p className="mt-1 max-w-[12.2rem] min-[360px]:max-w-[13.75rem] text-[11px] min-[360px]:text-[11.5px] font-medium leading-[1.4] text-slate-500/95">
                {onlineCategoryDescription}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between mb-0.5">
            <div>
              <h2 className="text-[1.45rem] font-black tracking-[-0.035em] text-slate-900">Live Near You</h2>
            </div>
            <span className="rounded-full bg-indigo-100/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600">
              {filteredActiveLocalDeals.length} Drops
            </span>
          </div>
        )}

        <div className="space-y-1.5 min-[1024px]:rounded-[1.2rem] min-[1024px]:border min-[1024px]:border-slate-100 min-[1024px]:bg-white min-[1024px]:p-3 min-[1024px]:shadow-sm min-[1024px]:shadow-slate-200/35">
          <div className="overflow-x-auto pb-1 -mx-0.5 min-[1024px]:overflow-visible min-[1024px]:mx-0 min-[1024px]:pb-0">
            <div className="flex min-w-max items-center gap-1.5 px-1 min-[1024px]:min-w-0 min-[1024px]:flex-wrap min-[1024px]:justify-center min-[1024px]:gap-2 min-[1024px]:px-0">
              {activeCategoryOptions.map(category => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={selectedCategory === category}
                  onClick={() => handleSelectActiveCategory(category)}
                  className={`inline-flex shrink-0 ${controlHeightClass} items-center ${controlPaddingClass} ${controlRadiusClass} border ${controlTextClass} whitespace-nowrap transition-all duration-200 ${
                    selectedCategory === category
                      ? 'border-indigo-100 bg-white text-indigo-600 shadow-sm shadow-slate-200/40 ring-2 ring-indigo-100/70'
                      : 'border-transparent bg-slate-50 text-slate-500 hover:bg-slate-100/80 hover:text-slate-700'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {category === 'All' ? <AppIcon name="deal" size={12} /> : <AppIcon name={getCategoryIconName(category)} size={12} />}
                    {category === 'All' ? category : getCategoryLabel(category)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {dropMode === 'local' ? (
            <div
              aria-hidden={!shouldShowLocalSubcategories}
              className={`overflow-hidden transition-all duration-200 ease-out ${
                shouldShowLocalSubcategories ? 'max-h-16 opacity-100 pb-1' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="overflow-x-auto -mx-0.5 min-[1024px]:overflow-visible min-[1024px]:mx-0">
                <div className="flex min-w-max items-center gap-1.5 px-1 pt-1 min-[1024px]:min-w-0 min-[1024px]:flex-wrap min-[1024px]:justify-center min-[1024px]:gap-2 min-[1024px]:px-0">
                  <button
                    type="button"
                    aria-pressed={selectedLocalSubcategory === 'All'}
                    onClick={() => setSelectedLocalSubcategory('All')}
                    className={`inline-flex h-8 shrink-0 items-center rounded-[0.95rem] border px-2.5 text-[9px] font-black uppercase tracking-[0.1em] whitespace-nowrap transition-all ${
                      selectedLocalSubcategory === 'All'
                        ? 'border-indigo-100 bg-white text-indigo-600 shadow-sm shadow-slate-200/35 ring-2 ring-indigo-100/60'
                        : 'border-transparent bg-slate-50 text-slate-500 hover:bg-slate-100/80 hover:text-slate-700'
                    }`}
                  >
                    All {getCategoryLabel(selectedCategory)}
                  </button>
                  {localSubcategoryOptions.map((subcategory) => (
                    <button
                      key={subcategory}
                      type="button"
                      aria-pressed={selectedLocalSubcategory === subcategory}
                      onClick={() => setSelectedLocalSubcategory(subcategory)}
                      className={`inline-flex h-8 shrink-0 items-center rounded-[0.95rem] border px-2.5 text-[9px] font-black uppercase tracking-[0.1em] whitespace-nowrap transition-all ${
                        selectedLocalSubcategory === subcategory
                          ? 'border-indigo-100 bg-white text-indigo-600 shadow-sm shadow-slate-200/35 ring-2 ring-indigo-100/60'
                          : 'border-transparent bg-slate-50 text-slate-500 hover:bg-slate-100/80 hover:text-slate-700'
                      }`}
                    >
                      {subcategory}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {dropMode === 'online' && shouldShowOnlineSubcategories ? (
            <div
              aria-hidden={!shouldShowOnlineSubcategories}
              className={`overflow-hidden transition-all duration-200 ease-out ${
                shouldShowOnlineSubcategories ? 'max-h-16 opacity-100 pb-1' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="overflow-x-auto -mx-0.5 min-[1024px]:overflow-visible min-[1024px]:mx-0">
                <div className="flex min-w-max items-center gap-1.5 px-1 pt-1 min-[1024px]:min-w-0 min-[1024px]:flex-wrap min-[1024px]:justify-center min-[1024px]:gap-2 min-[1024px]:px-0">
                  <button
                    type="button"
                    aria-pressed={selectedOnlineSubcategory === 'All'}
                    onClick={() => setSelectedOnlineSubcategory('All')}
                    className={`inline-flex h-8 shrink-0 items-center rounded-[0.95rem] border px-2.5 text-[9px] font-black uppercase tracking-[0.1em] whitespace-nowrap transition-all ${
                      selectedOnlineSubcategory === 'All'
                        ? 'border-indigo-100 bg-white text-indigo-600 shadow-sm shadow-slate-200/35 ring-2 ring-indigo-100/60'
                        : 'border-transparent bg-slate-50 text-slate-500 hover:bg-slate-100/80 hover:text-slate-700'
                    }`}
                  >
                    All {getCategoryLabel(selectedCategory)}
                  </button>
                  {onlineSubcategoryOptions.map((subcategory) => (
                    <button
                      key={subcategory}
                      type="button"
                      aria-pressed={selectedOnlineSubcategory === subcategory}
                      onClick={() => setSelectedOnlineSubcategory(subcategory)}
                      className={`inline-flex h-8 shrink-0 items-center rounded-[0.95rem] border px-2.5 text-[9px] font-black uppercase tracking-[0.1em] whitespace-nowrap transition-all ${
                        selectedOnlineSubcategory === subcategory
                          ? 'border-indigo-100 bg-white text-indigo-600 shadow-sm shadow-slate-200/35 ring-2 ring-indigo-100/60'
                          : 'border-transparent bg-slate-50 text-slate-500 hover:bg-slate-100/80 hover:text-slate-700'
                      }`}
                    >
                      {subcategory}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto pb-1 -mx-0.5 min-[1024px]:overflow-visible min-[1024px]:mx-0 min-[1024px]:pb-0">
            <div className="flex min-w-max items-center gap-1.5 px-1 min-[1024px]:min-w-0 min-[1024px]:flex-wrap min-[1024px]:justify-center min-[1024px]:gap-2 min-[1024px]:px-0">
              {[
                { id: 'all', label: 'All' },
                { id: 'trending', label: 'Trending' },
                { id: 'ending-soon', label: 'Ending Soon' },
                { id: 'just-dropped', label: 'Just Dropped' },
              ].map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setSelectedFeedFilter(filter.id as typeof selectedFeedFilter)}
                  className={`inline-flex ${controlHeightClass} items-center ${controlPaddingClass} ${controlRadiusClass} border ${controlTextClass} whitespace-nowrap transition-all ${
                    selectedFeedFilter === filter.id
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm shadow-indigo-100/80'
                      : 'border-transparent bg-slate-50 text-slate-500 hover:bg-slate-100/80 hover:text-slate-700'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <AppIcon name={getFeedFilterIconName(filter.id as typeof selectedFeedFilter)} size={12} />
                    {filter.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <section className="space-y-2.5">
          <div className="hidden min-[1024px]:block min-[1024px]:rounded-[1.2rem] min-[1024px]:border min-[1024px]:border-slate-100 min-[1024px]:bg-white min-[1024px]:px-4 min-[1024px]:py-3 min-[1024px]:shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">
              {dropMode === 'online' ? 'Online Storefront' : 'Local Storefront'}
            </p>
            <h3 className="mt-1 text-[1.1rem] font-black tracking-[-0.02em] text-slate-900">
              {selectedFeedFilter === 'trending'
                ? 'Trending Deals'
                : selectedFeedFilter === 'ending-soon'
                  ? 'Ending Soon'
                  : selectedFeedFilter === 'just-dropped'
                    ? 'Fresh New Drops'
                    : selectedCategory === 'All'
                      ? 'Popular Deals Right Now'
                      : `${getCategoryLabel(selectedCategory)} Deals`}
            </h3>
            <p className="mt-1 text-[12px] font-medium text-slate-500">
              Curated picks organized for faster browsing on desktop.
            </p>
          </div>
          {dropMode === 'local' ? (
            filteredActiveLocalDeals.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {filteredActiveLocalDeals.map(deal => (
                  <DealCard 
                    key={deal.id} 
                    deal={deal} 
                    onClaim={handleClaimDeal} 
                    isClaimed={claims.some(c => c.dealId === deal.id)}
                    isViewed={viewedDealIds.has(deal.id)}
                    computedDistance={deal.computedDistanceLabel}
                    onSaveToCatalog={handleSaveToCatalog}
                    canSaveToCatalog={canSaveDealToCatalog(deal)}
                    isSavedToCatalog={catalogCoupons.some(c => c.dealId === deal.id && c.status === 'active')}
                    saveFeedback={catalogSaveFeedback[deal.id]}
                  badges={getDealFeedTag(deal.id) ? [getDealFeedTag(deal.id)!] : []}
                  pendingEngagementAction={dealEngagementPending[deal.id] ?? null}
                  onLike={handleLikeDeal}
                  onDislike={handleDislikeDeal}
                  onShare={handleShareDeal}
                  showAdminActions={hasAdminAccess}
                  onEditDeal={handleEditDeal}
                  onDeleteDeal={handleAdminDeleteDeal}
                  isDeleting={deletingDealIds.has(deal.id)}
                />
                ))}
              </div>
            ) : (
              <div className="rounded-[1.7rem] border border-dashed border-slate-200 bg-white px-4 py-10 text-center shadow-sm shadow-slate-200/30">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-slate-50 text-slate-300">
                  <AppIcon name="alert" size={28} />
                </div>
                <p className="text-slate-500 font-semibold">
                  {localEmptyStateMessage}
                </p>
                <p className="text-slate-300 text-xs mt-1.5">Try changing filters or check back later.</p>
                <button 
                  onClick={() => {
                    if (selectedFeedFilter !== 'all') {
                      setSelectedFeedFilter('all');
                      return;
                    }
                    restartLocalDeals();
                  }}
                  className="mt-5 text-indigo-600 font-black text-xs uppercase tracking-[0.2em] hover:tracking-[0.3em] transition-all"
                >
                  {selectedFeedFilter === 'all' ? 'Restart Local Deals' : 'Show All Deals'}
                </button>
              </div>
            )
          ) : (
            isOnlineCategoryView ? (
              pagedCategoryOnlineDeals.length > 0 ? (
                <div className="space-y-3">
                  <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50/55 p-2.5 shadow-sm shadow-slate-200/20 transition-all duration-200">
                    <div className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                      {visibleCategoryOnlineDeals.map((deal) => renderCompactCategoryOnlineDealCard(deal))}
                      {hasMoreCategoryPages && visibleCategoryOnlineDeals.length % 2 === 1
                        ? renderOnlineGridFiller(() => {
                            setIsMoreDealsAnimating(true);
                            setOnlineCategoryPage((current) => Math.min(totalCategoryOnlinePages - 1, current + 1));
                            window.setTimeout(() => setIsMoreDealsAnimating(false), 220);
                          })
                        : null}
                    </div>
                  </div>
                  {totalCategoryOnlinePages > 1 ? (
                    <div className="flex items-center justify-between gap-2 rounded-[1.3rem] border border-slate-100 bg-white px-2.5 py-2 min-[360px]:gap-3 min-[360px]:px-3 shadow-sm shadow-slate-200/35">
                      <button
                        type="button"
                        onClick={() => setOnlineCategoryPage((current) => Math.max(0, current - 1))}
                        disabled={safeOnlineCategoryPage === 0}
                        className={`inline-flex h-9 items-center justify-center gap-1 rounded-[0.95rem] px-2.5 text-[9px] min-[360px]:gap-1.5 min-[360px]:px-3 min-[360px]:text-[10px] font-black uppercase tracking-[0.12em] transition-all ${
                          safeOnlineCategoryPage === 0
                            ? 'cursor-not-allowed bg-slate-100 text-slate-300'
                            : 'bg-slate-900 text-white shadow-sm shadow-slate-200/60 hover:bg-slate-800'
                        }`}
                      >
                        <AppIcon name="play" size={11} className="rotate-180" />
                        Prev
                      </button>
                      <div className="flex items-center gap-1">
                        {categoryOnlineDealPages.map((_, pageIndex) => (
                          <button
                            key={`online-category-page-${pageIndex}`}
                            type="button"
                            onClick={() => setOnlineCategoryPage(pageIndex)}
                            aria-label={`Go to page ${pageIndex + 1}`}
                            className={`h-2.5 rounded-full transition-all ${
                              safeOnlineCategoryPage === pageIndex
                                ? 'w-6 bg-indigo-600'
                                : 'w-2.5 bg-slate-200 hover:bg-slate-300'
                            }`}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setOnlineCategoryPage((current) => Math.min(totalCategoryOnlinePages - 1, current + 1))}
                        disabled={safeOnlineCategoryPage >= totalCategoryOnlinePages - 1}
                        className={`inline-flex h-9 items-center justify-center gap-1 rounded-[0.95rem] px-2.5 text-[9px] min-[360px]:gap-1.5 min-[360px]:px-3 min-[360px]:text-[10px] font-black uppercase tracking-[0.12em] transition-all ${
                          safeOnlineCategoryPage >= totalCategoryOnlinePages - 1
                            ? 'cursor-not-allowed bg-slate-100 text-slate-300'
                            : 'bg-slate-900 text-white shadow-sm shadow-slate-200/60 hover:bg-slate-800'
                        }`}
                      >
                        Next
                        <AppIcon name="play" size={11} />
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-[1.7rem] border border-dashed border-slate-200 bg-white px-4 py-10 text-center shadow-sm shadow-slate-200/30">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-slate-50 text-slate-300">
                    <AppIcon name="alert" size={28} />
                  </div>
                  <p className="text-slate-500 font-semibold">
                    {selectedFeedFilter === 'all'
                      ? 'No online deals in this category right now.'
                      : `No ${selectedFeedFilter.replace('-', ' ')} online deals right now.`}
                  </p>
                  <p className="text-slate-300 text-xs mt-1.5">Try another category or check back in a bit.</p>
                </div>
              )
            ) : (
              sortedOnlineDealsByTab.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {sortedOnlineDealsByTab.map((deal) => renderOnlineDealCard(deal))}
                </div>
              ) : (
                <div className="rounded-[1.7rem] border border-dashed border-slate-200 bg-white px-4 py-10 text-center shadow-sm shadow-slate-200/30">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-slate-50 text-slate-300">
                    <AppIcon name="alert" size={28} />
                  </div>
                  <p className="text-slate-500 font-semibold">
                    {selectedFeedFilter === 'all'
                      ? (isDropModeActive ? 'No Drop Mode picks in this category right now.' : 'No online deals in this category right now.')
                      : `No ${selectedFeedFilter.replace('-', ' ')} ${isDropModeActive ? 'Drop Mode picks' : 'online deals'} right now.`}
                  </p>
                  <p className="text-slate-300 text-xs mt-1.5">Try another category or check back in a bit.</p>
                </div>
              )
            )
          )}
        </section>

        {dropMode === 'local' && expiredLocalDeals.length > 0 && (
          <div className="pt-8">
            <h3 className="text-slate-300 text-[10px] font-black uppercase tracking-[0.2em] mb-6 text-center">Recently Expired</h3>
            <div className="opacity-40 grayscale pointer-events-none space-y-4">
              {expiredLocalDeals.slice(0, 2).map(deal => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  onClaim={() => {}}
                  computedDistance={deal.computedDistanceLabel}
                  pendingEngagementAction={dealEngagementPending[deal.id] ?? null}
                  onLike={handleLikeDeal}
                  onDislike={handleDislikeDeal}
                  onShare={handleShareDeal}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDealDetail = () => {
    if (!selectedDetailDeal) {
      return (
        <div className="rounded-[1.8rem] border border-slate-100 bg-white px-4 py-10 text-center shadow-sm shadow-slate-200/35">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[1.4rem] bg-slate-50 text-slate-300">
            <AppIcon name="deal" size={24} />
          </div>
          <p className="mt-4 text-sm font-bold text-slate-500">That deal is no longer available.</p>
          <button
            type="button"
            onClick={handleCloseDealDetail}
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-[0.95rem] bg-slate-900 px-4 text-[11px] font-black uppercase tracking-[0.12em] text-white"
          >
            <AppIcon name="play" size={13} className="rotate-180" />
            Back to Live
          </button>
        </div>
      );
    }

    const detailExternalUrl = getDealExternalUrl(selectedDetailDeal);
    const priceSnapshot = getDealPriceSnapshot(selectedDetailDeal);
    const currentPriceLabel = getDetailPricePrimaryLabel(selectedDetailDeal);
    const originalPriceLabel = getDetailOriginalPriceLabel(selectedDetailDeal);
    const discountLabel = getDetailDiscountLabel(selectedDetailDeal);
    const isSavedToCatalog = catalogCoupons.some((coupon) => coupon.dealId === selectedDetailDeal.id && coupon.status === 'active');
    const canSaveToCatalogDeal = canSaveDealToCatalog(selectedDetailDeal);
    const relatedDeals = deals
      .filter((deal) =>
        deal.id !== selectedDetailDeal.id
        && deal.businessType === 'online'
        && deal.category === selectedDetailDeal.category
        && deal.expiresAt > Date.now(),
      )
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 3);

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={handleCloseDealDetail}
            className="inline-flex h-10 items-center gap-2 rounded-[0.95rem] border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 shadow-sm shadow-slate-200/35 transition-colors hover:bg-slate-50"
          >
            <AppIcon name="play" size={12} className="rotate-180" />
            Back
          </button>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[9px] min-[360px]:px-3 min-[360px]:text-[10px] font-black uppercase tracking-[0.12em] text-indigo-600">
              <AppIcon name={getCategoryIconName(selectedDetailDeal.category)} size={12} />
              {getCategoryLabel(selectedDetailDeal.category)}
            </span>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
          <div className="relative aspect-[1/1] overflow-hidden bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(241,245,249,0.98))]">
            <DealArtwork
              src={selectedDetailDeal.imageUrl}
              alt={selectedDetailDeal.title}
              fit="contain"
              iconSize={52}
              imageClassName="p-4"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/18 via-slate-950/6 to-transparent" />
            <div className="pointer-events-none absolute left-4 top-4">
              <span className="inline-flex min-h-[34px] items-center rounded-[0.95rem] bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 px-3 py-1.5 text-[12px] font-black uppercase tracking-[0.08em] text-white shadow-[0_12px_28px_rgba(99,102,241,0.28)]">
                {selectedDetailDeal.offerText}
              </span>
            </div>
            {selectedDetailDeal.hasTimer ? (
              <div className="pointer-events-none absolute bottom-4 left-4">
                <Timer
                  expiresAt={selectedDetailDeal.expiresAt}
                  onExpire={forceRefreshDealsView}
                  className="rounded-full bg-white/92 px-3 py-1.5 text-[12px] font-black text-indigo-600 shadow-sm"
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-4 p-4">
            <div className="flex items-start gap-3">
              <CompanyLogo
                businessName={selectedDetailDeal.businessName}
                logoUrl={selectedDetailDeal.logoUrl}
                category={selectedDetailDeal.category}
                size={44}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{selectedDetailDeal.businessName}</p>
                <h1 className="mt-1 text-[1.28rem] font-black leading-[1.12] tracking-[-0.04em] text-slate-900">
                  {selectedDetailDeal.title}
                </h1>
                <p className="mt-2 text-[12px] leading-[1.55] text-slate-500">{selectedDetailDeal.description}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
              <div className="rounded-[1.2rem] border border-indigo-100 bg-indigo-50/90 px-3 py-3">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-indigo-500">Current</p>
                <p className="mt-2 text-[1.08rem] font-black tracking-[-0.04em] text-indigo-700">{currentPriceLabel}</p>
              </div>
              <div className="rounded-[1.2rem] border border-slate-100 bg-slate-50/90 px-3 py-3">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Original</p>
                <p className="mt-2 text-[1rem] font-black tracking-[-0.03em] text-slate-700">
                  {originalPriceLabel}
                </p>
              </div>
              <div className="rounded-[1.2rem] border border-violet-100 bg-violet-50/90 px-3 py-3">
                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-500">Discount</p>
                <p className="mt-2 text-[1rem] font-black tracking-[-0.03em] text-violet-700">{discountLabel}</p>
              </div>
            </div>

            {(priceSnapshot.currentPrice !== null || priceSnapshot.originalPrice !== null || priceSnapshot.discountPercent !== null) ? (
              <p className="text-[11px] font-medium leading-[1.5] text-slate-400">
                {priceSnapshot.currentPrice !== null ? `Current deal price ${formatPriceValue(priceSnapshot.currentPrice) ?? currentPriceLabel}. ` : ''}
                {priceSnapshot.originalPrice !== null ? `Original price ${formatPriceValue(priceSnapshot.originalPrice) ?? originalPriceLabel}. ` : ''}
                {priceSnapshot.discountPercent !== null ? `${priceSnapshot.discountPercent}% off right now.` : ''}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => openExternalDealLink(selectedDetailDeal)}
              disabled={!detailExternalUrl}
              className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-[1.15rem] px-4 text-[13px] font-black uppercase tracking-[0.12em] text-white transition-all shadow-lg ${
                detailExternalUrl
                  ? 'bg-slate-900 shadow-slate-200/55 hover:bg-slate-800'
                  : 'cursor-not-allowed bg-slate-300 shadow-none'
              }`}
            >
              <AppIcon name="external" size={16} />
              Get Deal
            </button>

            <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
              <button
                type="button"
                onClick={() => handleLikeDeal(selectedDetailDeal)}
                disabled={dealEngagementPending[selectedDetailDeal.id] === 'like'}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[1rem] border border-slate-200 bg-slate-50/85 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-60"
              >
                <AppIcon name="like" size={12} />
                Like
                <span className="text-slate-400">{Math.max(0, selectedDetailDeal.likeCount ?? 0)}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDislikeDeal(selectedDetailDeal)}
                disabled={dealEngagementPending[selectedDetailDeal.id] === 'dislike'}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[1rem] border border-slate-200 bg-slate-50/85 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-60"
              >
                <AppIcon name="dislike" size={12} />
                Dislike
                <span className="text-slate-400">{Math.max(0, selectedDetailDeal.dislikeCount ?? 0)}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isSavedToCatalog && canSaveToCatalogDeal) {
                    handleSaveToCatalog(selectedDetailDeal);
                  }
                }}
                disabled={!canSaveToCatalogDeal || isSavedToCatalog}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-[1rem] border px-3 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
                  isSavedToCatalog
                    ? 'border-emerald-100 bg-emerald-50 text-emerald-600'
                    : canSaveToCatalogDeal
                      ? 'border-slate-200 bg-slate-50/85 text-slate-500 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600'
                      : 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-300'
                }`}
              >
                <AppIcon name="catalog" size={12} />
                {isSavedToCatalog ? 'Saved' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => handleShareDeal(selectedDetailDeal)}
                disabled={dealEngagementPending[selectedDetailDeal.id] === 'share'}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[1rem] border border-slate-200 bg-slate-50/85 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600 disabled:opacity-60"
              >
                <AppIcon name="share" size={12} />
                Share
                <span className="text-slate-400">{Math.max(0, selectedDetailDeal.shareCount ?? 0)}</span>
              </button>
            </div>

            {catalogSaveFeedback[selectedDetailDeal.id] ? (
              <p className="text-center text-xs font-semibold text-emerald-600">{catalogSaveFeedback[selectedDetailDeal.id]}</p>
            ) : null}
          </div>
        </div>

        {relatedDeals.length > 0 ? (
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Related Deals</p>
              <h2 className="mt-1 text-lg font-black text-slate-900">More in {getCategoryLabel(selectedDetailDeal.category)}</h2>
            </div>
            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
              {relatedDeals.map((deal) => (
                <button
                  key={`related-deal-${deal.id}`}
                  type="button"
                  onClick={() => handleOpenDealDetail(deal)}
                  className="overflow-hidden rounded-[1.4rem] border border-slate-100 bg-white text-left shadow-sm shadow-slate-200/35 transition-transform hover:-translate-y-0.5"
                >
                  <div className="aspect-[1/1] overflow-hidden bg-slate-100">
                    <DealArtwork
                      src={deal.imageUrl}
                      alt={deal.title}
                      fit="contain"
                      iconSize={24}
                      imageClassName="p-2"
                    />
                  </div>
                  <div className="space-y-1.5 p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-indigo-500">{deal.businessName}</p>
                    <h3 className="line-clamp-2 text-[0.88rem] font-extrabold leading-[1.2] text-slate-900">{deal.title}</h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-indigo-600">{deal.offerText}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderMyClaims = () => {
    const now = Date.now();
    const normalizedClaims = [...claims]
      .map((claim) => {
        const isExpired = claim.expiresAt <= now && claim.status === 'active';
        return {
          ...claim,
          displayStatus: (isExpired ? 'expired' : claim.status) as 'active' | 'redeemed' | 'expired',
        };
      })
      .sort((left, right) => right.claimedAt - left.claimedAt);
    const pendingClaims = normalizedClaims.filter((claim) => claim.displayStatus === 'active');
    const completedClaims = normalizedClaims.filter((claim) => claim.displayStatus === 'redeemed');
    const expiredClaims = normalizedClaims.filter((claim) => claim.displayStatus === 'expired');
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const claimsThisMonth = normalizedClaims.filter((claim) => claim.claimedAt >= monthStart.getTime());
    const totalClaimSavings = normalizedClaims.reduce((sum, claim) => {
      const matchedDeal = deals.find((deal) => deal.id === claim.dealId);
      return sum + (matchedDeal ? getDealSavingsValue(matchedDeal) : 0);
    }, 0);
    const claimGoal = 5;
    const claimProgressCount = Math.min(normalizedClaims.length, claimGoal);
    const claimProgressPercent = Math.round((claimProgressCount / claimGoal) * 100);
    const filteredClaims = normalizedClaims.filter((claim) => {
      if (claimsFilter === 'pending') return claim.displayStatus === 'active';
      if (claimsFilter === 'completed') return claim.displayStatus === 'redeemed';
      if (claimsFilter === 'expired') return claim.displayStatus === 'expired';
      return true;
    });
    const recommendedClaimDeals = deals
      .filter((deal) =>
        deal.expiresAt > now
        && !claims.some((claim) => claim.dealId === deal.id)
        && deal.currentClaims < deal.maxClaims,
      )
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 3);
    const claimStats = [
      { label: 'Total', value: normalizedClaims.length, tone: 'bg-indigo-50 text-indigo-600 border-indigo-100' },
      { label: 'Completed', value: completedClaims.length, tone: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
      { label: 'Pending', value: pendingClaims.length, tone: 'bg-sky-50 text-sky-600 border-sky-100' },
      { label: 'This Month', value: claimsThisMonth.length, tone: 'bg-violet-50 text-violet-600 border-violet-100' },
    ];
    const claimFilterTabs = [
      { id: 'all' as const, label: 'All', count: normalizedClaims.length },
      { id: 'pending' as const, label: 'Pending', count: pendingClaims.length },
      { id: 'completed' as const, label: 'Completed', count: completedClaims.length },
      { id: 'expired' as const, label: 'Expired', count: expiredClaims.length },
    ];
    const claimHowItWorks = [
      {
        title: 'Claim A Deal',
        body: 'Tap claim on a live deal to lock in your spot before it expires or sells out.',
        icon: 'claims' as const,
      },
      {
        title: 'Show Your Code',
        body: 'Open the claim and copy your code when you are ready to redeem it with the business.',
        icon: 'deal' as const,
      },
      {
        title: 'Mark It Complete',
        body: 'After you use it, mark the claim as redeemed so your progress and history stay organized.',
        icon: 'check' as const,
      },
    ];
    const openLiveDeals = () => {
      setCurrentView('live-deals');
      setSelectedFeedFilter('all');
    };

    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900">My Claims</h2>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Track every claim, code, and redemption in one place
            </p>
          </div>

          <div className="rounded-[1.95rem] border border-slate-100 bg-white px-5 py-5 shadow-sm shadow-slate-200/35">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-500">Claimed Savings</p>
                <h3 className="mt-2 text-[2rem] font-black tracking-[-0.05em] text-slate-900">{currencyFormatter.format(totalClaimSavings)}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {normalizedClaims.length > 0
                    ? 'Estimated value captured from the deals you have claimed so far.'
                    : 'Start claiming deals to build your savings history here.'}
                </p>
              </div>
              <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-600">
                {pendingClaims.length} pending
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {claimStats.map((stat) => (
              <div key={stat.label} className={`rounded-[1.35rem] border px-3 py-3 ${stat.tone}`}>
                <p className="text-[9px] font-black uppercase tracking-[0.14em] opacity-80">{stat.label}</p>
                <p className="mt-2 text-[1.35rem] font-black tracking-[-0.04em]">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[1.7rem] border border-slate-100 bg-white px-4 py-4 shadow-sm shadow-slate-200/35">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-500">Claims Milestone</p>
                <h3 className="mt-1 text-[1.05rem] font-black text-slate-900">Complete your first 5 claims</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Every claimed deal moves you closer to building a strong redemption streak inside LiveDrop.
                </p>
              </div>
              <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-600">
                {claimProgressCount}/{claimGoal}
              </span>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 transition-all duration-300"
                style={{ width: `${claimProgressPercent}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] font-semibold text-slate-500">
              {claimProgressCount >= claimGoal
                ? 'Milestone reached. Keep the streak going.'
                : `${claimGoal - claimProgressCount} more ${claimGoal - claimProgressCount === 1 ? 'claim' : 'claims'} to reach your first goal.`}
            </p>
          </div>

          <div className="overflow-x-auto pb-0.5 -mx-0.5">
            <div className="flex min-w-max items-center gap-1.5 px-1">
              {claimFilterTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setClaimsFilter(tab.id)}
                  className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-[10px] font-black uppercase tracking-[0.12em] whitespace-nowrap transition-all ${
                    claimsFilter === tab.id
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm shadow-indigo-100/80'
                      : 'border-transparent bg-slate-50 text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[9px] ${
                    claimsFilter === tab.id ? 'bg-white/15 text-white' : 'bg-white text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {normalizedClaims.length > 0 ? (
          <div className="space-y-4">
            {filteredClaims.length > 0 ? filteredClaims.map(claim => {
              const displayStatus = claim.displayStatus;
              return (
                <div key={claim.id} className="bg-white border border-slate-100 rounded-3xl p-6 relative overflow-hidden shadow-sm">
                  {displayStatus === 'redeemed' && (
                    <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-black px-4 py-1.5 rounded-bl-2xl uppercase">
                      Redeemed
                    </div>
                  )}
                  {displayStatus === 'expired' && (
                    <div className="absolute top-0 right-0 bg-slate-200 text-slate-500 text-[10px] font-black px-4 py-1.5 rounded-bl-2xl uppercase">
                      Expired
                    </div>
                  )}

                  <div className="flex justify-between items-start mb-5">
                    <div className="flex items-start gap-3 min-w-0">
                      <CompanyLogo businessName={claim.businessName} logoUrl={claim.logoUrl} category={claim.category} size={42} />
                      <div className="min-w-0">
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">{claim.businessName}</p>
                        <h3 className="text-slate-900 text-lg font-bold leading-tight">{claim.dealTitle}</h3>
                      </div>
                    </div>
                    {displayStatus === 'active' && <Timer expiresAt={claim.expiresAt} className="text-sm" />}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-5">
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Claimed At</p>
                      <p className="text-[10px] font-bold text-slate-600">{formatDateTime(claim.claimedAt)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Expires At</p>
                      <p className="text-[10px] font-bold text-slate-600">{formatDateTime(claim.expiresAt)}</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col items-center justify-center gap-2 mb-5">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Your Claim Code</p>
                    <p className={`text-3xl font-mono font-black tracking-[0.4em] ${displayStatus !== 'active' ? 'text-slate-200 line-through' : 'text-indigo-600'}`}>
                      {claim.claimCode}
                    </p>
                    {claimCopyStatus[claim.id] === 'success' ? (
                      <>
                        <p className="text-sm font-semibold text-emerald-600 text-center">Claim code copied</p>
                        <p className="text-xs text-slate-500 text-center">
                          Your claim code has been copied to your clipboard.
                          Show this code at the business to redeem your deal.
                        </p>
                      </>
                    ) : (
                      <>
                        {claimCopyStatus[claim.id] === 'error' && (
                          <p className="text-xs font-semibold text-amber-600 text-center">Could not copy automatically. Tap to copy.</p>
                        )}
                        <p className="text-xs text-slate-500 text-center">Show this code at the business to redeem your deal.</p>
                      </>
                    )}
                    <button
                      onClick={() => void handleCopyClaimCode(claim.id, claim.claimCode)}
                      className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-600 transition-colors hover:bg-indigo-100"
                    >
                      <AppIcon name="deal" size={16} />
                      Copy Code
                    </button>
                  </div>

                  {displayStatus === 'active' && (
                    <button 
                      onClick={() => handleRedeemClaim(claim.id)}
                      className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
                    >
                      <AppIcon name="check" size={18} />
                      MARK AS REDEEMED
                    </button>
                  )}
                </div>
              );
            }) : (
              <div className="text-center py-14 bg-white rounded-[2rem] border border-dashed border-slate-200 shadow-sm shadow-slate-200/25">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-slate-50 text-slate-300">
                  <AppIcon name="claims" size={28} />
                </div>
                <p className="text-slate-500 font-bold">No {claimsFilter} claims yet.</p>
                <p className="mt-1 text-xs text-slate-400">Switch filters or claim a fresh deal to fill this view.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-[2.15rem] border border-slate-100 bg-white px-5 py-6 shadow-sm shadow-slate-200/35">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-indigo-50 via-violet-50 to-sky-50 text-indigo-500 shadow-inner shadow-white/70">
                <AppIcon name="claims" size={30} />
              </div>
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Start Claiming</p>
                <h3 className="mt-2 text-[1.28rem] font-black tracking-[-0.03em] text-slate-900">Your next win starts with one tap.</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Claiming keeps the deal code ready, gives you a countdown to act on it, and makes your best drops easy to track.
                </p>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={openLiveDeals}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[1rem] bg-slate-900 px-4 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-slate-200/50 transition-all hover:bg-slate-800"
                >
                  <AppIcon name="play" size={15} />
                  Browse Deals
                </button>
                <button
                  type="button"
                  onClick={openLiveDeals}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[1rem] border border-indigo-100 bg-indigo-50 px-4 text-[11px] font-black uppercase tracking-[0.14em] text-indigo-600 shadow-sm shadow-indigo-100/60 transition-all hover:border-indigo-200 hover:bg-indigo-100/70"
                >
                  <AppIcon name="plus" size={15} />
                  Claim Your First Deal
                </button>
              </div>
            </div>

            <div className="rounded-[1.85rem] border border-slate-100 bg-white px-4 py-4 shadow-sm shadow-slate-200/30">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">How Claiming Works</p>
              <div className="mt-4 grid grid-cols-1 gap-3">
                {claimHowItWorks.map((step, index) => (
                  <div key={step.title} className="flex items-start gap-3 rounded-[1.2rem] bg-slate-50/85 px-3 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] bg-white text-indigo-500 shadow-sm shadow-slate-200/40">
                      <AppIcon name={step.icon} size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Step {index + 1}</p>
                      <h4 className="mt-1 text-sm font-black text-slate-900">{step.title}</h4>
                      <p className="mt-1 text-[12px] leading-[1.5] text-slate-500">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Recommended Deals</p>
                  <h3 className="mt-1 text-lg font-black text-slate-900">Easy first claims</h3>
                </div>
                <button
                  type="button"
                  onClick={openLiveDeals}
                  className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600"
                >
                  See More
                </button>
              </div>
              {recommendedClaimDeals.length > 0 ? (
                <div className="space-y-3">
                  {recommendedClaimDeals.map((deal) => (
                    <DealCard
                      key={`claim-recommendation-${deal.id}`}
                      compact
                      deal={deal}
                      onClaim={handleClaimDeal}
                      isClaimed={claims.some((claim) => claim.dealId === deal.id)}
                      computedDistance={deal.businessType === 'online' ? undefined : deal.distance}
                      pendingEngagementAction={dealEngagementPending[deal.id] ?? null}
                      onLike={handleLikeDeal}
                      onDislike={handleDislikeDeal}
                      onShare={handleShareDeal}
                      showAdminActions={hasAdminAccess}
                      onEditDeal={handleEditDeal}
                      onDeleteDeal={handleAdminDeleteDeal}
                      isDeleting={deletingDealIds.has(deal.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.7rem] border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-slate-50 text-slate-300">
                    <AppIcon name="spark" size={24} />
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-500">Fresh claim recommendations are on the way.</p>
                  <p className="mt-1 text-xs text-slate-400">Open Live deals to spot the next one worth claiming.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCatalog = () => {
    const now = Date.now();
    const activeCoupons = catalogCoupons.filter(coupon => coupon.status === 'active');
    const redeemedCoupons = catalogCoupons.filter(coupon => coupon.status === 'redeemed');
    const expiredCoupons = catalogCoupons.filter(coupon => coupon.status === 'expired');
    const totalSavedCoupons = catalogCoupons.length;
    const totalSavings = activeCoupons.reduce((sum, coupon) => sum + (coupon.currentDiscount ?? 0), 0);
    const expiringSoonCoupons = activeCoupons.filter(
      (coupon) => typeof coupon.expiresAt === 'number' && coupon.expiresAt - now <= 24 * 60 * 60 * 1000,
    );
    const progressTarget = 5;
    const progressCount = Math.min(totalSavedCoupons, progressTarget);
    const progressPercent = Math.round((progressCount / progressTarget) * 100);
    const savedDealIds = new Set(catalogCoupons.map((coupon) => coupon.dealId));
    const liveRecommendedDeals = deals
      .filter((deal) => canSaveDealToCatalog(deal) && deal.expiresAt > now && !savedDealIds.has(deal.id))
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 3);
    const fallbackRecommendedDeals = generateSeededOnlineDeals()
      .filter((deal) => !isExcludedOnlineDeal(deal))
      .filter((deal) => deal.expiresAt > now && !savedDealIds.has(deal.id))
      .slice(0, 3);
    const recommendedCatalogDeals = liveRecommendedDeals.length > 0 ? liveRecommendedDeals : fallbackRecommendedDeals;
    const openAllDeals = () => {
      setSelectedCategory('All');
      setSelectedFeedFilter('all');
      setCurrentView('live-deals');
    };
    const openOnlineDeals = () => {
      setDropMode('online');
      setDropModeEnabled(false);
      setSelectedCategory('All');
      setSelectedFeedFilter('all');
      setCurrentView('live-deals');
    };
    const catalogStatCards = [
      {
        label: 'Saved Deals',
        value: String(activeCoupons.length),
        caption: activeCoupons.length === 1 ? 'ready to redeem' : 'ready to redeem',
        tone: 'bg-indigo-50 text-indigo-600 border-indigo-100',
      },
      {
        label: 'Total Savings',
        value: `${totalSavings}%`,
        caption: 'live value held',
        tone: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      },
      {
        label: 'Expiring Soon',
        value: String(expiringSoonCoupons.length),
        caption: 'ending in 24h',
        tone: 'bg-amber-50 text-amber-600 border-amber-100',
      },
    ];
    const howItWorksSteps = [
      {
        title: 'Browse Live Deals',
        body: 'Find deals you want to keep from Local or Online without needing to redeem right away.',
        icon: 'deal' as const,
      },
      {
        title: 'Save To Catalog',
        body: 'Tap save on eligible deals and LiveDrop holds them here so you can come back later.',
        icon: 'catalog' as const,
      },
      {
        title: 'Redeem When Ready',
        body: 'Open your saved deal, check its current value, and redeem when the timing is right.',
        icon: 'check' as const,
      },
    ];

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Catalog</h2>
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-[0.18em] mt-1">
              Saved coupons waiting to be redeemed
            </p>
          </div>
          <button
            onClick={refreshCatalogState}
            className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
            title="Refresh Catalog"
          >
            <AppIcon name="refresh" size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
          {catalogStatCards.map((stat) => (
            <div key={stat.label} className={`rounded-[1.35rem] border px-3 py-3 ${stat.tone}`}>
              <p className="text-[9px] font-black uppercase tracking-[0.14em] opacity-80">{stat.label}</p>
              <p className="mt-2 text-[1.35rem] font-black tracking-[-0.04em]">{stat.value}</p>
              <p className="mt-1 text-[10px] font-semibold opacity-75">{stat.caption}</p>
            </div>
          ))}
        </div>

        <div className="rounded-[1.7rem] border border-slate-100 bg-white px-4 py-4 shadow-sm shadow-slate-200/35">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-500">Catalog Progress</p>
              <h3 className="mt-1 text-[1.05rem] font-black text-slate-900">Save your first 5 deals</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Build your own shortlist so the best deals stay within reach when you are ready to redeem.
              </p>
            </div>
            <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-600">
              {progressCount}/{progressTarget}
            </span>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] font-semibold text-slate-500">
            {progressCount >= progressTarget
              ? 'Nice work. Your Catalog is stocked and ready.'
              : `${progressTarget - progressCount} more ${progressTarget - progressCount === 1 ? 'deal' : 'deals'} to hit your first milestone.`}
          </p>
        </div>

        {activeCoupons.length > 0 ? (
          <div className="space-y-4">
            {activeCoupons.map(coupon => (
              <div key={coupon.id} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <CompanyLogo businessName={coupon.businessName} logoUrl={coupon.logoUrl} category={coupon.category} size={42} />
                    <div className="min-w-0">
                      <p className="text-indigo-500 text-[10px] font-black uppercase tracking-widest mb-1">
                        <span className="inline-flex items-center gap-1.5">
                          <AppIcon name={getCategoryIconName(coupon.category)} size={12} />
                          {getCategoryLabel(coupon.category)}
                        </span>
                      </p>
                      <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">{coupon.businessName}</p>
                      <h3 className="text-slate-900 text-lg font-bold leading-tight">{coupon.title}</h3>
                    </div>
                  </div>
                  <div className="bg-indigo-50 text-indigo-600 rounded-2xl px-4 py-3 text-center min-w-[88px]">
                    <p className="text-[9px] font-black uppercase tracking-widest">
                      {coupon.currentDiscount === null ? 'Offer' : 'Current'}
                    </p>
                    <p className="text-2xl font-black">
                      {coupon.currentDiscount === null ? coupon.offerText : `${coupon.currentDiscount}%`}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-slate-500 leading-relaxed mb-4">{coupon.description}</p>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                    <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest mb-1">
                      {coupon.originalDiscount === null ? 'Saved Offer' : 'Original Discount'}
                    </p>
                    <p className="text-sm font-bold text-slate-700">
                      {coupon.originalDiscount === null ? coupon.offerText : `${coupon.originalDiscount}%`}
                    </p>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                    <p className="text-[8px] text-slate-400 font-black uppercase tracking-widest mb-1">Saved Date</p>
                    <p className="text-sm font-bold text-slate-700">{formatDateTime(coupon.savedAt)}</p>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-4">
                  {coupon.currentDiscount === null ? (
                    <p className="text-xs font-semibold text-amber-700">
                      Saved offer preserved exactly as listed by the business.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-amber-700">
                        Discount drops by 5% each day until redeemed
                      </p>
                      {catalogDropWarnings.includes(coupon.id) ? (
                        <p className="text-xs text-amber-600 mt-1">
                          Your saved discount dropped since your last visit.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between mb-4 text-[10px] font-black uppercase tracking-widest">
                  <span className="text-slate-400">Status</span>
                  <span className="text-emerald-600">Active</span>
                </div>

                <button
                  onClick={() => handleRedeemCatalogCoupon(coupon.id)}
                  className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
                >
                  <AppIcon name="percent" size={18} />
                  REDEEM FROM CATALOG
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-[2.15rem] border border-slate-100 bg-white px-5 py-6 shadow-sm shadow-slate-200/35">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-gradient-to-br from-indigo-50 via-violet-50 to-sky-50 text-indigo-500 shadow-inner shadow-white/70">
                <AppIcon name="catalog" size={30} />
              </div>
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Start Your Catalog</p>
                <h3 className="mt-2 text-[1.28rem] font-black tracking-[-0.03em] text-slate-900">Your best deals deserve a saved spot.</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Save the deals you want to revisit later, watch their value, and keep your favorites ready to redeem when the timing feels right.
                </p>
              </div>
              <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={openAllDeals}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[1rem] bg-slate-900 px-4 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-slate-200/50 transition-all hover:bg-slate-800"
                >
                  <AppIcon name="play" size={15} />
                  Browse Deals
                </button>
                <button
                  type="button"
                  onClick={openOnlineDeals}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[1rem] border border-indigo-100 bg-indigo-50 px-4 text-[11px] font-black uppercase tracking-[0.14em] text-indigo-600 shadow-sm shadow-indigo-100/60 transition-all hover:border-indigo-200 hover:bg-indigo-100/70"
                >
                  <AppIcon name="plus" size={15} />
                  Save Your First Deal
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Recommended Deals</p>
                  <h3 className="mt-1 text-lg font-black text-slate-900">Strong first saves</h3>
                </div>
                <button
                  type="button"
                  onClick={openOnlineDeals}
                  className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-600"
                >
                  See More
                </button>
              </div>
              {recommendedCatalogDeals.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {recommendedCatalogDeals.map((deal) => (
                    <div key={`catalog-recommendation-${deal.id}`} className="overflow-hidden rounded-[1.55rem] border border-slate-100 bg-white shadow-sm shadow-slate-200/35">
                      <div className="flex gap-3 p-3">
                        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[1.1rem] bg-slate-100">
                          {deal.imageUrl ? (
                            <img src={deal.imageUrl} alt={deal.title} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-300">
                              <AppIcon name="deal" size={24} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-indigo-500">
                            <AppIcon name={getCategoryIconName(deal.category)} size={10} />
                            {getCategoryLabel(deal.category)}
                          </p>
                          <h4 className="mt-1 line-clamp-2 text-[0.98rem] font-extrabold leading-[1.2] text-slate-900">{deal.title}</h4>
                          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{deal.businessName}</p>
                          <p className="mt-2 line-clamp-2 text-[11px] leading-[1.5] text-slate-500">{deal.description}</p>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <span className="inline-flex min-h-[30px] items-center rounded-[0.85rem] bg-indigo-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-indigo-600">
                              {deal.offerText}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSaveToCatalog(deal)}
                              disabled={!canSaveDealToCatalog(deal)}
                              className={`inline-flex h-9 items-center justify-center gap-2 rounded-[0.95rem] px-3 text-[10px] font-black uppercase tracking-[0.12em] transition-all ${
                                canSaveDealToCatalog(deal)
                                  ? 'bg-slate-900 text-white shadow-sm shadow-slate-200/45 hover:bg-slate-800'
                                  : 'cursor-not-allowed bg-slate-100 text-slate-300'
                              }`}
                            >
                              <AppIcon name="plus" size={12} />
                              Save Deal
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.7rem] border border-dashed border-slate-200 bg-white px-4 py-8 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-slate-50 text-slate-300">
                    <AppIcon name="spark" size={24} />
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-500">Fresh recommendations are loading in.</p>
                  <p className="mt-1 text-xs text-slate-400">Open Live deals to find something worth saving.</p>
                </div>
              )}
            </div>

            <div className="rounded-[1.85rem] border border-slate-100 bg-white px-4 py-4 shadow-sm shadow-slate-200/30">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">How It Works</p>
              <div className="mt-4 grid grid-cols-1 gap-3">
                {howItWorksSteps.map((step, index) => (
                  <div key={step.title} className="flex items-start gap-3 rounded-[1.2rem] bg-slate-50/85 px-3 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[1rem] bg-white text-indigo-500 shadow-sm shadow-slate-200/40">
                      <AppIcon name={step.icon} size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Step {index + 1}</p>
                      <h4 className="mt-1 text-sm font-black text-slate-900">{step.title}</h4>
                      <p className="mt-1 text-[12px] leading-[1.5] text-slate-500">{step.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {(redeemedCoupons.length > 0 || expiredCoupons.length > 0) && (
          <div className="space-y-4 pt-2">
            <h3 className="text-slate-300 text-[10px] font-black uppercase tracking-[0.2em] text-center">
              Used & Inactive
            </h3>
            {[...redeemedCoupons, ...expiredCoupons].map(coupon => (
              <div key={coupon.id} className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm opacity-75">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <CompanyLogo businessName={coupon.businessName} logoUrl={coupon.logoUrl} category={coupon.category} size={38} />
                    <div className="min-w-0">
                      <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{coupon.businessName}</p>
                      <h4 className="text-slate-900 font-bold">{coupon.title}</h4>
                    </div>
                  </div>
                  <span className={`text-[9px] font-black uppercase px-3 py-1 rounded-full ${
                    coupon.status === 'redeemed' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {coupon.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Final value: {coupon.currentDiscount === null ? coupon.offerText : `${coupon.currentDiscount}%`} • Saved {formatDateTime(coupon.savedAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderImportedDraftSwitcher = () => {
    if (bulkImportCandidates.length <= 1 || !isCreating) {
      return null;
    }

    return (
      <div className="rounded-[1.75rem] border border-indigo-100 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Imported Deals</p>
            <p className="mt-1 text-sm text-slate-500">Choose which pasted item to load into the Business Portal form.</p>
          </div>
          <span className="inline-flex h-8 items-center justify-center rounded-full bg-indigo-50 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-600">
            {selectedBulkImportIndex + 1} of {bulkImportCandidates.length}
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {bulkImportCandidates.map((item, index) => (
            <button
              key={`${item.title}-${index}`}
              type="button"
              onClick={() => loadBulkImportCandidateIntoPortal(bulkImportCandidates, index)}
              className={`inline-flex h-10 items-center justify-center rounded-xl border px-3 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
                selectedBulkImportIndex === index
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:text-indigo-600'
              }`}
            >
              {index + 1}. {item.title}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderAIDealFinderPanel = () => {
    {
      const previewDeal = aiFinderResult?.normalizedDeal;
      const extractionDebug = aiFinderResult?.extractionDebug;
      const sourceAssets = aiFinderResult?.sourceAssets;
      const normalizedJson = aiFinderResult?.generatedJson || (previewDeal ? JSON.stringify(previewDeal, null, 2) : '');
      const effectiveScanLayer = buildFallbackScanLayer(aiFinderResult);
      const effectiveNormalizedDigest = aiFinderResult?.normalizedDigest ?? buildFallbackNormalizedDigest(previewDeal);
      const effectiveMappedForm = aiFinderResult?.mappedForm ?? buildFallbackMappedForm(previewDeal);
      const portalCoverageSource =
        portalFieldSnapshot
        ?? dealDraft
        ?? (effectiveMappedForm ? createDraftFromBulkImport(effectiveMappedForm.draft, 0) : null);
      const portalCoverage = buildPortalFieldCoverage(portalCoverageSource);
      const filledFields = portalCoverage.filled;
      const requiredMissingFields = portalCoverage.missingRequired;
      const optionalMissingFields = portalCoverage.missingOptional;
      const completionPercent = portalCoverage.completionPercent;
      const effectiveValidationResult = aiFinderResult?.validationResult ?? buildFallbackValidationResult(aiFinderResult);
      const rawScanJson = effectiveScanLayer ? JSON.stringify(effectiveScanLayer, null, 2) : '';
      const normalizedDigestJson = effectiveNormalizedDigest ? JSON.stringify(effectiveNormalizedDigest, null, 2) : '';
      const mappedFormJson = effectiveMappedForm ? JSON.stringify(effectiveMappedForm, null, 2) : '';
      const validationWarnings = effectiveValidationResult?.warnings ?? [];
      const validationFieldStates = effectiveValidationResult?.fieldStates ?? [];
      const mappedFieldMappings = effectiveMappedForm?.fieldMappings ?? [];
      const priceText = formatFinderPrice(previewDeal?.price);
      const originalPriceText = formatFinderPrice(previewDeal?.originalPrice);
      const hasAcceptedUrl = Boolean(aiFinderDirectUrl);
      const hasMappedBasicFields = Boolean(previewDeal?.websiteUrl || previewDeal?.productUrl || previewDeal?.businessName);
      const extractionSucceeded = aiFinderResult?.extractionStatus === 'Extraction succeeded';
      const extractionFailed = aiFinderResult?.extractionStatus === 'Extraction failed';
      const canGenerateCoupon = Boolean(aiFinderDirectUrl);
      const canFillPortal = Boolean(aiFinderDirectUrl);
      const portalMappingReady = filledFields.length > 0;
      const portalMappingSucceeded = portalMappingReady && requiredMissingFields.length === 0;
      const hasScanLayerData = Boolean(effectiveScanLayer);
      const hasNormalizedDigestData = Boolean(effectiveNormalizedDigest);
      const hasMappedFormData = Boolean(effectiveMappedForm);
      const validationStatus = effectiveValidationResult?.status ?? (aiFinderResult ? 'partial' : 'blocked');
      const requiredFilledCount = portalCoverage.required.filter((field) => field.filled).length;
      const optionalFilledCount = portalCoverage.optional.filter((field) => field.filled).length;
      const assistantInputs = [
        ['Keyword', aiFinderKeyword || 'Not set'],
        ['Merchant', aiFinderMerchant || 'Any'],
        ['Category', aiFinderCategory || 'Any'],
        ['Max Price', aiFinderMaxPrice || 'None'],
        ['Min Discount', aiFinderMinDiscount || 'None'],
      ];
      const stageCards = [
        {
          key: 'extract',
          label: 'Stage 1',
          title: 'Extract',
          status: hasScanLayerData ? (extractionSucceeded ? 'Ready' : extractionFailed ? 'Partial' : 'Ready') : hasAcceptedUrl ? 'Pending' : 'Awaiting URL',
          tone: hasScanLayerData
            ? extractionSucceeded
              ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
              : 'bg-amber-100 text-amber-700 border-amber-200'
            : hasAcceptedUrl
              ? 'bg-sky-100 text-sky-700 border-sky-200'
              : 'bg-slate-100 text-slate-600 border-slate-200',
        },
        {
          key: 'normalize',
          label: 'Stage 2',
          title: 'Normalize',
          status: aiFinderResult?.generatedJson ? 'Ready' : hasNormalizedDigestData ? 'Preview Ready' : 'Pending',
          tone: aiFinderResult?.generatedJson ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : hasNormalizedDigestData ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-600 border-slate-200',
        },
        {
          key: 'map',
          label: 'Stage 3',
          title: 'Map to Portal',
          status: hasMappedFormData ? (validationStatus === 'blocked' ? 'Review' : 'Ready') : 'Pending',
          tone: hasMappedFormData
            ? validationStatus === 'blocked'
              ? 'bg-amber-100 text-amber-700 border-amber-200'
              : 'bg-emerald-100 text-emerald-700 border-emerald-200'
            : 'bg-slate-100 text-slate-600 border-slate-200',
        },
      ];
      const jsonPanelBodyClassName = 'max-h-[360px] min-h-[220px] w-full overflow-auto overscroll-contain px-4 py-4 text-xs leading-6 text-slate-200 whitespace-pre-wrap break-words';

      return (
        <div className="space-y-4">
          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Quick Coupon Creator</p>
              <h3 className="mt-1 text-lg font-black text-slate-900">Paste the full product URL, add the affiliate link, then fill the portal</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">LiveDrop now keeps the source product URL separate from the outbound affiliate link, so import pulls clean Amazon product data while Get Deal buttons still use the SiteStripe tracking URL.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-9 items-center justify-center rounded-full bg-indigo-50 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-700">
                Primary Workflow
              </span>
              <span className={`inline-flex h-9 items-center justify-center rounded-full px-3 text-[10px] font-black uppercase tracking-[0.12em] ${
                aiFinderLoading
                  ? 'bg-indigo-100 text-indigo-700'
                  : aiFinderResult?.generatedJson
                    ? 'bg-emerald-100 text-emerald-700'
                    : hasAcceptedUrl
                      ? 'bg-sky-100 text-sky-700'
                      : 'bg-slate-100 text-slate-600'
              }`}>
                {aiFinderLoading ? 'Processing URL' : aiFinderResult?.generatedJson ? 'Coupon Ready' : hasAcceptedUrl ? 'URL Ready' : 'Awaiting URL'}
              </span>
            </div>
          </div>

          <div className="mt-5 rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-4">
            <div className="grid gap-3">
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Source Product URL</span>
                <input
                  ref={aiFinderUrlInputRef}
                  type="url"
                  value={aiFinderUrl}
                  onChange={(event) => setAiFinderUrl(event.target.value)}
                  placeholder="https://www.amazon.com/dp/..."
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                />
                {aiFinderUrl.trim() && !aiFinderDirectUrl ? (
                  <p className="mt-2 text-xs font-semibold leading-5 text-amber-600">{aiFinderSourceValidation.error}</p>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-slate-400">Use the full product page URL here. LiveDrop imports the title, image, merchant, price, and source metadata from this page.</p>
                )}
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Affiliate / Outbound Link</span>
                <input
                  type="url"
                  value={aiFinderAffiliateUrl}
                  onChange={(event) => setAiFinderAffiliateUrl(event.target.value)}
                  placeholder="https://amzn.to/... or another tracking link"
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                />
                <p className="mt-2 text-xs leading-5 text-slate-400">Optional, but recommended. If provided, every Get Deal or outbound CTA will use this tracking link instead of the raw product page URL.</p>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExtractAIDeal}
                disabled={aiFinderLoading || !aiFinderDirectUrl}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {aiFinderLoading ? 'Scanning...' : 'Scan URL'}
              </button>
              <button
                type="button"
                onClick={() => void handleGenerateAIDealJson()}
                disabled={aiFinderLoading || !canGenerateCoupon}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Generate Deal
              </button>
              <button
                type="button"
                onClick={() => void handleFillPortalFromAIDeal()}
                disabled={aiFinderLoading || !canFillPortal}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Auto Fill Portal
              </button>
              <button
                type="button"
                onClick={handleFillTestCoupon}
                disabled={aiFinderLoading}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Fill Test Coupon
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {hasAcceptedUrl ? (
                <span className="inline-flex h-7 items-center justify-center rounded-full bg-sky-100 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-sky-700">
                  URL accepted
                </span>
              ) : null}
              {hasMappedBasicFields ? (
                <span className="inline-flex h-7 items-center justify-center rounded-full bg-indigo-100 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-indigo-700">
                  Basic fields mapped
                </span>
              ) : null}
              {extractionSucceeded ? (
                <span className="inline-flex h-7 items-center justify-center rounded-full bg-emerald-100 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-700">
                  Extraction succeeded
                </span>
              ) : null}
              {extractionFailed ? (
                <span className="inline-flex h-7 items-center justify-center rounded-full bg-rose-100 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-rose-700">
                  Extraction failed
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {stageCards.map((stage) => (
              <div key={stage.key} className="rounded-[1.25rem] border border-slate-100 bg-slate-50/70 px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{stage.label}</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-slate-900">{stage.title}</p>
                  <span className={`inline-flex h-7 items-center justify-center rounded-full border px-3 text-[9px] font-black uppercase tracking-[0.1em] ${stage.tone}`}>
                    {stage.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {aiFinderMessage ? (
            <p className="mt-4 text-sm font-semibold text-emerald-600">{aiFinderMessage}</p>
          ) : null}
          {aiFinderError ? (
            <p className="mt-3 text-sm font-semibold text-rose-500">{aiFinderError}</p>
          ) : null}

          {aiFinderResult ? (
            <div className="mt-5 space-y-4">
              <div className="grid gap-4 xl:grid-cols-2 xl:items-stretch">
                <div className="flex min-w-0 h-full flex-col overflow-hidden rounded-[1.75rem] border border-slate-100 bg-white shadow-sm">
                  <div className="shrink-0 border-b border-slate-100 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-500">Scan Layer</p>
                    <p className="mt-1 text-sm text-slate-500">Raw provider scan output before normalization touches anything.</p>
                  </div>
                  <div className="min-h-0 flex-1 p-4">
                    <div className="overflow-hidden rounded-[1.2rem] border border-slate-900 bg-slate-950 shadow-inner shadow-black/20">
                      <pre className={jsonPanelBodyClassName}>{rawScanJson || 'No raw scan result yet.'}</pre>
                    </div>
                  </div>
                </div>

                <div className="flex min-w-0 h-full flex-col overflow-hidden rounded-[1.75rem] border border-slate-100 bg-white shadow-sm">
                  <div className="shrink-0 border-b border-slate-100 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-500">Normalize / Digest Layer</p>
                    <p className="mt-1 text-sm text-slate-500">Stable internal deal schema after provider-specific scan data is digested.</p>
                  </div>
                  <div className="min-h-0 flex-1 p-4">
                    <div className="overflow-hidden rounded-[1.2rem] border border-slate-900 bg-slate-950 shadow-inner shadow-black/20">
                      <pre className={jsonPanelBodyClassName}>{normalizedDigestJson || 'No normalized digest yet.'}</pre>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] xl:items-stretch">
                <div className="flex min-w-0 h-full flex-col overflow-hidden rounded-[1.75rem] border border-slate-100 bg-white shadow-sm">
                  <div className="shrink-0 border-b border-slate-100 px-5 py-5">
                    <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-500">Validation Layer</p>
                      <p className="mt-1 text-sm text-slate-500">Warnings stay separate so weak or missing fields never get silently invented.</p>
                    </div>
                    <span className={`inline-flex h-8 shrink-0 items-center justify-center rounded-full px-3 text-[9px] font-black uppercase tracking-[0.1em] ${
                      validationStatus === 'ready'
                        ? 'bg-emerald-100 text-emerald-700'
                        : validationStatus === 'partial'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-rose-100 text-rose-700'
                    }`}>
                      {validationStatus}
                    </span>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 pb-5 pt-4">
                    {validationWarnings.length > 0 ? validationWarnings.map((warning, index) => (
                      <div key={`${warning.field}-${index}`} className={`min-w-0 rounded-xl border px-3 py-3 ${
                        warning.severity === 'error'
                          ? 'border-rose-100 bg-rose-50/80'
                          : 'border-amber-100 bg-amber-50/80'
                      }`}>
                        <div className="flex items-start justify-between gap-3">
                          <p className={`min-w-0 break-words text-[10px] font-black uppercase tracking-[0.12em] ${
                            warning.severity === 'error' ? 'text-rose-600' : 'text-amber-600'
                          }`}>
                            {warning.field}
                          </p>
                          <span className={`inline-flex h-6 shrink-0 items-center justify-center rounded-full px-2.5 text-[8px] font-black uppercase tracking-[0.08em] ${
                            warning.severity === 'error'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            {warning.severity}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{warning.message}</p>
                      </div>
                    )) : (
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 px-3 py-3">
                        <p className="text-sm font-semibold text-emerald-700">
                          {aiFinderResult?.validationResult
                            ? 'No validation warnings. The normalized digest is ready for form mapping.'
                            : 'No blocking validation issues were derived from this response. Review the mapped values before autofill.'}
                        </p>
                      </div>
                    )}

                    {validationFieldStates.length > 0 ? (
                      <div className="overflow-hidden rounded-2xl border border-slate-100">
                        <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Field States</p>
                      </div>
                      <div className="max-h-[260px] overflow-auto divide-y divide-slate-100">
                        {validationFieldStates.map((state) => (
                          <div key={state.field} className="min-w-0 px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <p className="min-w-0 break-words text-sm font-semibold text-slate-700">{state.field}</p>
                              <span className={`inline-flex h-6 shrink-0 items-center justify-center rounded-full px-2.5 text-[8px] font-black uppercase tracking-[0.08em] ${
                                state.status === 'ready'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : state.status === 'weak'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-slate-100 text-slate-600'
                              }`}>
                                {state.status}
                              </span>
                            </div>
                            <p className="mt-1 break-words text-xs leading-5 text-slate-500">{state.message}</p>
                            <p className="mt-1 break-words text-[11px] font-medium text-slate-400">Source: {state.source ?? 'Missing'} | Confidence: {state.confidence}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex min-w-0 h-full flex-col overflow-hidden rounded-[1.75rem] border border-slate-100 bg-white shadow-sm">
                  <div className="shrink-0 border-b border-slate-100 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-500">Form Mapping Layer</p>
                    <p className="mt-1 text-sm text-slate-500">Final mapped values that feed the real visible Business Portal inputs.</p>
                  </div>
                  {mappedFieldMappings.length > 0 ? (
                    <div className="mx-4 mt-4 overflow-hidden rounded-[1.2rem] border border-slate-100 bg-slate-50/60">
                      <div className="max-h-[280px] overflow-auto divide-y divide-slate-100">
                      {mappedFieldMappings.map((mapping) => (
                        <div key={mapping.field} className="min-w-0 px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 break-words text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{mapping.field}</p>
                            <span className={`inline-flex h-6 shrink-0 items-center justify-center rounded-full px-2.5 text-[8px] font-black uppercase tracking-[0.08em] ${
                              mapping.value ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {mapping.value ? 'Mapped' : 'Empty'}
                            </span>
                          </div>
                          <p className="mt-2 break-all text-sm leading-6 text-slate-700">{mapping.value || 'Left empty on purpose'}</p>
                          <p className="mt-1 break-words text-[11px] font-medium text-slate-400">Source: {mapping.sourceField ?? 'No reliable source'}</p>
                          {mapping.note ? (
                            <p className="mt-1 break-words text-xs leading-5 text-slate-500">{mapping.note}</p>
                          ) : null}
                        </div>
                      ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="min-h-0 flex-1 p-4">
                    <div className="overflow-hidden rounded-[1.2rem] border border-slate-900 bg-slate-950 shadow-inner shadow-black/20">
                      <pre className={jsonPanelBodyClassName}>{mappedFormJson || 'No mapped form output yet.'}</pre>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-[1.75rem] border border-indigo-100/80 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-5 shadow-sm shadow-indigo-100/40">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Normalized Deal Object</p>
                    <p className="mt-1 text-sm text-slate-500">Stage 2 converts the extracted source into one portal-ready internal deal record.</p>
                  </div>
                  <span className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[9px] font-black uppercase tracking-[0.1em] ${
                    aiFinderResult.generatedJson ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {aiFinderResult.generatedJson ? 'Generated' : 'Preview Ready'}
                  </span>
                </div>
                <div className="flex min-w-0 items-start gap-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[1.25rem] border border-white/80 bg-white shadow-sm sm:h-24 sm:w-24">
                    {previewDeal?.imageUrl ? (
                      <img src={previewDeal.imageUrl} alt={previewDeal.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-indigo-100 text-indigo-500">
                        <AppIcon name="spark" size={22} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-7 items-center justify-center rounded-full border border-white/80 bg-white px-3 text-[9px] font-black uppercase tracking-[0.1em] text-indigo-600 shadow-sm">
                        {previewDeal?.category ?? 'Uncategorized'}
                      </span>
                      {previewDeal?.discountPercent ? (
                        <span className="inline-flex h-7 items-center justify-center rounded-full bg-indigo-600 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-white shadow-sm shadow-indigo-200">
                          {previewDeal.discountPercent}% OFF
                        </span>
                      ) : null}
                      <span className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[9px] font-black uppercase tracking-[0.1em] shadow-sm ${
                        extractionSucceeded ? 'bg-emerald-600 text-white' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {aiFinderResult.extractionStatus}
                      </span>
                    </div>
                    <h4
                      className="mt-3 max-w-[42rem] overflow-hidden text-lg font-black leading-6 text-slate-900 sm:text-[1.15rem]"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {previewDeal?.title}
                    </h4>
                    <p className="mt-1.5 text-sm font-semibold text-slate-500">{previewDeal?.businessName}</p>
                    <p
                      className="mt-3 max-w-[42rem] overflow-hidden text-sm leading-6 text-slate-600 sm:text-[0.95rem]"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {aiFinderResult.summary ?? previewDeal?.summary ?? previewDeal?.description}
                    </p>
                    <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2 xl:grid-cols-3">
                      {priceText ? (
                        <div className="min-w-0 rounded-xl bg-white/80 px-3 py-2">
                          <span>Price: <span className="font-semibold text-slate-700">{priceText}</span></span>
                        </div>
                      ) : null}
                      {originalPriceText ? (
                        <div className="min-w-0 rounded-xl bg-white/80 px-3 py-2">
                          <span>List: <span className="font-semibold text-slate-700">{originalPriceText}</span></span>
                        </div>
                      ) : null}
                      {previewDeal?.rating ? (
                        <div className="min-w-0 rounded-xl bg-white/80 px-3 py-2">
                          <span>Rating: <span className="font-semibold text-slate-700">{previewDeal.rating.toFixed(1)}</span></span>
                        </div>
                      ) : null}
                      {previewDeal?.reviewCount ? (
                        <div className="min-w-0 rounded-xl bg-white/80 px-3 py-2">
                          <span>Reviews: <span className="font-semibold text-slate-700">{previewDeal.reviewCount.toLocaleString()}</span></span>
                        </div>
                      ) : null}
                      {previewDeal?.merchant ? (
                        <div className="min-w-0 rounded-xl bg-white/80 px-3 py-2">
                          <span>Merchant: <span className="font-semibold text-slate-700">{previewDeal.merchant}</span></span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-5 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
                  <div className="border-b border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Normalized Deal JSON
                  </div>
                  <div className="p-4">
                    <div className="overflow-hidden rounded-[1.2rem] border border-slate-800/90 bg-slate-950 shadow-inner shadow-black/20">
                      <pre className={jsonPanelBodyClassName}>{normalizedJson}</pre>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Extracted Source Data</p>
                <p className="mt-1 text-sm text-slate-500">Stage 1 reads the product page, keeps the cleaned URL and merchant, and records exactly what extraction returned.</p>
                <div className="mt-4 space-y-4 text-sm text-slate-600">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-700">Extraction Summary</p>
                      <span className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[9px] font-black uppercase tracking-[0.1em] ${
                        extractionSucceeded ? 'bg-emerald-100 text-emerald-700' : extractionFailed ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {aiFinderResult.extractionStatus}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl bg-white px-3 py-2">
                        <p className="font-black uppercase tracking-[0.08em] text-slate-500">Merchant</p>
                        <p className="mt-1 font-semibold text-slate-700">{previewDeal?.businessName ?? 'Missing'}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2">
                        <p className="font-black uppercase tracking-[0.08em] text-slate-500">Source Product URL</p>
                        <p className="mt-1 break-all font-semibold text-slate-700">{sourceAssets?.productUrl ?? previewDeal?.productUrl ?? 'Missing source asset'}</p>
                      </div>
                    </div>
                    {aiFinderResult.enrichmentError ? (
                      <p className="mt-3 text-xs leading-5 text-rose-500">{aiFinderResult.enrichmentError}</p>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Mapped Source Fields</p>
                    <div className="mt-3 space-y-3 text-xs text-slate-600">
                      <div>
                        <p className="font-black uppercase tracking-[0.08em] text-slate-500">Website URL</p>
                        <p className="mt-1 break-all leading-5 text-slate-700">{sourceAssets?.websiteUrl ?? previewDeal?.websiteUrl ?? 'Missing source asset'}</p>
                      </div>
                      <div>
                        <p className="font-black uppercase tracking-[0.08em] text-slate-500">Source Product URL</p>
                        <p className="mt-1 break-all leading-5 text-slate-700">{sourceAssets?.productUrl ?? previewDeal?.productUrl ?? 'Missing source asset'}</p>
                      </div>
                      <div>
                        <p className="font-black uppercase tracking-[0.08em] text-slate-500">Affiliate / Outbound Link</p>
                        <p className="mt-1 break-all leading-5 text-slate-700">{sourceAssets?.affiliateUrl ?? previewDeal?.affiliateUrl ?? 'Not provided'}</p>
                      </div>
                      <div>
                        <p className="font-black uppercase tracking-[0.08em] text-slate-500">Image URL</p>
                        <p className="mt-1 break-all leading-5 text-slate-700">{sourceAssets?.imageUrl ?? previewDeal?.imageUrl ?? 'Missing source asset'}</p>
                      </div>
                    </div>
                  </div>

                  {extractionDebug ? (
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Admin Extraction Debug</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl bg-white px-3 py-2">
                          <p className="font-black uppercase tracking-[0.08em] text-slate-500">Fetch Status</p>
                          <p className="mt-1 font-semibold text-slate-700">
                            {extractionDebug.fetchAttempted ? (extractionDebug.fetchSucceeded ? 'Succeeded' : 'Failed') : 'Not attempted'}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-2">
                          <p className="font-black uppercase tracking-[0.08em] text-slate-500">HTTP Status</p>
                          <p className="mt-1 font-semibold text-slate-700">{extractionDebug.responseStatus ?? 'Unknown'}</p>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-2 sm:col-span-2">
                          <p className="font-black uppercase tracking-[0.08em] text-slate-500">Failure Reason</p>
                          <p className="mt-1 break-all text-slate-700">{extractionDebug.failureReason ?? 'None'}</p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                </div>
              </div>

              <div ref={aiFinderFieldCoverageRef} className="rounded-[1.75rem] border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Portal Mapping Status</p>
                <p className="mt-1 text-sm text-slate-500">Stage 3 maps the normalized deal object into the actual Business Portal fields and only counts fields that are really populated.</p>
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Portal field coverage</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">Success is only shown when the mapped portal fields are actually filled.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-slate-900">{completionPercent}%</span>
                        <span className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[9px] font-black uppercase tracking-[0.1em] ${
                          portalMappingSucceeded ? 'bg-emerald-100 text-emerald-700' : portalMappingReady ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {portalMappingSucceeded ? 'Portal Ready' : portalMappingReady ? 'Partially Mapped' : 'Not Mapped'}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${completionPercent >= 75 ? 'bg-emerald-500' : completionPercent >= 45 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                        style={{ width: `${completionPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Portal Status</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Required Filled</p>
                        <p className="mt-2 text-lg font-black text-slate-900">{requiredFilledCount}/{portalCoverage.required.length}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Optional Filled</p>
                        <p className="mt-2 text-lg font-black text-slate-900">{optionalFilledCount}/{portalCoverage.optional.length}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Last Autofill Attempt</p>
                        <p className="mt-2 text-sm font-black text-slate-900">
                          {portalAutofillStatus.state === 'success'
                            ? 'Succeeded'
                            : portalAutofillStatus.state === 'failure'
                              ? 'Failed'
                              : portalAutofillStatus.state === 'pending'
                                ? 'In progress'
                                : 'Not run'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Last Failure Reason</p>
                        <p className="mt-2 text-sm leading-5 text-slate-700">{portalAutofillStatus.failureReason || 'None'}</p>
                      </div>
                    </div>
                    {portalAutofillStatus.state === 'failure' ? (
                      <p className="mt-3 text-xs font-semibold text-rose-500">Autofill attempted but portal form state did not update.</p>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Mapped Portal Fields</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {[...portalCoverage.required, ...portalCoverage.optional].map((field) => (
                        <div key={field.key} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{field.label}</p>
                            <span className={`inline-flex h-6 items-center justify-center rounded-full px-2.5 text-[8px] font-black uppercase tracking-[0.08em] ${
                              field.filled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {field.filled ? 'Filled' : 'Missing'}
                            </span>
                          </div>
                          <p className="mt-2 break-all text-sm leading-6 text-slate-700">{field.value || 'Missing'}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Filled</p>
                      {filledFields.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {filledFields.map((field) => (
                            <span key={field.key} className="inline-flex h-7 items-center justify-center rounded-full border border-emerald-200 bg-white px-3 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-700">
                              {field.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-emerald-700">No portal fields are filled yet.</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-700">Missing Required</p>
                      {requiredMissingFields.length ? (
                        <ul className="mt-2 space-y-2 text-sm text-amber-700">
                          {requiredMissingFields.map((field) => (
                            <li key={field.key} className="flex items-start gap-2">
                              <span className="mt-[2px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                              <span className="leading-5">{field.label}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm font-semibold text-emerald-600">All required portal fields are ready.</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Missing Optional</p>
                      {optionalMissingFields.length ? (
                        <ul className="mt-2 space-y-2 text-sm text-slate-600">
                          {optionalMissingFields.map((field) => (
                            <li key={field.key} className="flex items-start gap-2">
                              <span className="mt-[2px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                              <span className="leading-5">{field.label}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm font-semibold text-emerald-600">Optional portal fields are filled.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          </div>

          <details className="group rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <summary className="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Deal Discovery Assistant</p>
                <h3 className="mt-1 text-lg font-black text-slate-900">Optional and experimental discovery help for finding candidate links before you return to Quick Coupon Creator</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">AI search is no longer the main path. It stays separate here as an optional assistant, while direct coupon creation above remains the reliable workflow for filling and publishing deals.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex h-9 items-center justify-center rounded-full bg-amber-100 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700">
                  Experimental
                </span>
                <span className="inline-flex h-9 items-center justify-center rounded-full bg-slate-100 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600">
                  Optional
                </span>
              </div>
            </summary>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50/70 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-indigo-500">How it fits now</p>
                <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
                  <p>1. Use discovery only when you need help finding a likely product URL or outbound affiliate link.</p>
                  <p>2. Once you have a link, paste it into Quick Coupon Creator above and continue with Scan URL, Generate Deal, and Auto Fill Portal.</p>
                  <p>3. Publish and save reliability are being prioritized around the direct-link path first, so discovery will never block coupon creation.</p>
                </div>
                <button
                  type="button"
                  onClick={() => aiFinderUrlInputRef.current?.focus()}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-indigo-500"
                >
                  Focus Quick Coupon Creator
                </button>
              </div>

              <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50/70 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Current Discovery Context</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {assistantInputs.map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
                      <p className="mt-2 break-all text-sm font-semibold text-slate-700">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Status</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Discovery remains available as an experimental assistant, but the app no longer depends on it to create a coupon, auto-fill the portal, or publish a deal.</p>
                </div>
              </div>
            </div>
          </details>
        </div>
      );
    }
    const previewDeal = aiFinderResult?.normalizedDeal;
    const searchSnapshot = aiFinderSearchSnapshot;
    const resultCards = searchSnapshot?.searchCandidates ?? aiFinderCandidates;
    const rawResultCount = searchSnapshot?.responseMeta?.rawResultCount ?? searchSnapshot?.rawResults?.length ?? 0;
    const filteredResultCount = searchSnapshot?.responseMeta?.filteredResultCount ?? resultCards.length;
    const queryAttempts = searchSnapshot?.queryAttempts ?? [];
    const canGenerateFromSource = Boolean(aiFinderSelectedSourceUrl);
    const canFillPortal = Boolean(aiFinderResult?.generatedJson && aiFinderSelectedSourceUrl);
    const hasSearchAttempt = aiFinderRuntime.requestSent || Boolean(searchSnapshot);
    const searchStatus =
      aiFinderRuntime.lastError || searchSnapshot?.searchStatus === 'Search failed'
        ? 'failed'
        : aiFinderLoading || (aiFinderRuntime.requestSent && !aiFinderRuntime.responseReceived)
          ? 'running'
          : aiFinderRuntime.requestSent && aiFinderRuntime.responseReceived
            ? rawResultCount > 0
              ? 'completed with results'
              : 'completed with zero results'
            : 'idle';
    const searchStatusMessage =
      searchStatus === 'completed with zero results'
        ? "No results found from Tavily after multiple attempts. Try more specific keywords like 'iPhone 14 128GB' or paste a product URL."
        : searchStatus === 'failed'
          ? 'Tavily request failed.'
          : 'Results returned, but no valid product pages found.';
    const resultQuality = aiFinderResult?.resultQuality ?? 'basic';
    const completionPercent = aiFinderResult
      ? aiFinderResult.completionPercent ?? 100
      : aiFinderSelectedSourceUrl
        ? 50
        : 0;
    const filledFields = aiFinderResult?.missingGroups?.filled ?? [];
    const requiredMissingFields = aiFinderResult?.missingGroups?.required ?? [];
    const optionalMissingFields = aiFinderResult?.missingGroups?.optional ?? [];
    const sourceAssets = aiFinderResult?.sourceAssets;
    const extractionStatus = aiFinderResult?.extractionStatus ?? (aiFinderResult?.partialData ? 'Extraction failed' : 'Full deal enrichment completed successfully');
    const extractionDebug = aiFinderResult?.extractionDebug;
    const hasMissingSourceAsset = !sourceAssets?.productUrl || !sourceAssets?.imageUrl;
    const priceText =
      previewDeal?.price != null
        ? `$${previewDeal.price.toFixed(2)}`
        : null;
    const originalPriceText =
      previewDeal?.originalPrice != null
        ? `$${previewDeal.originalPrice.toFixed(2)}`
        : null;
    const stageMeta: Record<AIDealFinderStage, { label: string; tone: string }> = {
      idle: { label: 'Search for products/deals', tone: 'bg-slate-100 text-slate-600' },
      searching: { label: 'Searching', tone: 'bg-indigo-100 text-indigo-700' },
      'results-loaded': { label: 'Results loaded', tone: 'bg-sky-100 text-sky-700' },
      'result-selected': { label: 'Result selected', tone: 'bg-violet-100 text-violet-700' },
      'coupon-generated': { label: 'Coupon generated', tone: 'bg-emerald-100 text-emerald-700' },
    };
    const selectedResultTitle = selectedAIFinderCandidate?.title ?? (aiFinderHasDirectUrlFallback ? 'Direct Product URL Fallback' : 'No result selected');
    const selectedResultDescription = selectedAIFinderCandidate?.snippet
      ?? (aiFinderHasDirectUrlFallback ? 'This pasted product URL will be used directly because Tavily is best for discovery, not guaranteed product lookup.' : 'Choose one search result before generating coupon fields.');
    const selectedResultMerchant = selectedAIFinderCandidate?.merchant
      ?? (aiFinderHasDirectUrlFallback
        ? (() => {
            try {
              return new URL(aiFinderDirectUrl).hostname.replace(/^www\./, '');
            } catch {
              return 'Direct URL';
            }
          })()
        : 'No merchant yet');
    const selectedResultPrice = formatFinderPrice(selectedAIFinderCandidate?.price);
    const selectedResultOriginalPrice = formatFinderPrice(selectedAIFinderCandidate?.originalPrice);
    const selectedResultLabels = selectedAIFinderCandidate?.rankLabels ?? [];

    return (
      <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Affiliate Deal Finder</p>
            <h3 className="mt-1 text-lg font-black text-slate-900">Search affiliate deals, pick a result, then generate portal-ready coupon fields</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">Search first, review the matches, explicitly choose one source, generate the coupon fields, and only then fill the Business Portal.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex h-9 items-center justify-center rounded-full px-3 text-[10px] font-black uppercase tracking-[0.12em] ${stageMeta[aiFinderStage].tone}`}>
              {stageMeta[aiFinderStage].label}
            </span>
            <span className="inline-flex h-9 items-center justify-center rounded-full bg-indigo-50 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-600">
              Admin Tool
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[1.4fr_0.8fr]">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Search Keywords</span>
              <input
                type="text"
                value={aiFinderKeyword}
                onChange={(event) => setAiFinderKeyword(event.target.value)}
                placeholder="wireless earbuds, standing desk, gaming headset..."
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Merchant / Source</span>
              <select
                value={aiFinderMerchant}
                onChange={(event) => setAiFinderMerchant(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
              >
                {['Any', 'Amazon', 'Walmart', 'Target', 'Best Buy', 'Other'].map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>

          <details className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <summary className="cursor-pointer list-none text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
              Advanced Filters
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <label className="block sm:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Optional Product URL</span>
                <input
                  ref={aiFinderUrlInputRef}
                  type="url"
                  value={aiFinderUrl}
                  onChange={(event) => setAiFinderUrl(event.target.value)}
                  placeholder="https://www.amazon.com/... or another product page"
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                />
                <p className="mt-2 text-xs leading-5 text-slate-400">Fallback only. If Tavily search is weak or empty, you can paste a direct product page URL and choose the fallback flow.</p>
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Category</span>
                <select
                  value={aiFinderCategory}
                  onChange={(event) => setAiFinderCategory(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                >
                  {ONLINE_CATEGORY_OPTIONS.filter((option) => option !== 'All').map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Max Price</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={aiFinderMaxPrice}
                  onChange={(event) => setAiFinderMaxPrice(event.target.value)}
                  placeholder="199"
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Min Discount</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={aiFinderMinDiscount}
                  onChange={(event) => setAiFinderMinDiscount(event.target.value)}
                  placeholder="20"
                  className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
                />
              </label>
            </div>
          </details>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSearchAIDeal}
            disabled={aiFinderLoading}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {aiFinderLoading && aiFinderStage === 'searching' ? 'Searching...' : 'Search Deal'}
          </button>
        </div>

        {aiFinderMessage ? (
          <p className="mt-3 text-sm font-semibold text-emerald-600">{aiFinderMessage}</p>
        ) : null}
        {aiFinderError ? (
          <p className="mt-3 text-sm font-semibold text-rose-500">{aiFinderError}</p>
        ) : null}
        {hasSearchAttempt ? (
          <div className="mt-5 rounded-[1.75rem] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-500">Step 2</p>
                <h4 className="mt-1 text-base font-black text-slate-900">Results List</h4>
                <p className="mt-1 text-sm text-slate-500">Inspect the matching sources, then choose one result to use as the coupon source.</p>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">{resultCards.length} result{resultCards.length === 1 ? '' : 's'}</span>
            </div>

            {resultCards.length > 0 ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {resultCards.map((candidate) => {
                const isSelected = selectedAIFinderUrl === candidate.url;
                const candidateSourceUrl = getFirstSafeExternalUrl(candidate.productLink, candidate.url);
                const priceLabel = formatFinderPrice(candidate.price);
                const originalPriceLabel = formatFinderPrice(candidate.originalPrice);
                const discountLabel = candidate.discountPercent ? `${candidate.discountPercent}% OFF` : null;
                return (
                  <div
                    key={`picker-${candidate.url}`}
                    className={`overflow-hidden rounded-[1.5rem] border p-4 transition-colors ${
                      isSelected ? 'border-indigo-200 bg-indigo-50/40 shadow-sm shadow-indigo-100/40' : 'border-slate-200 bg-slate-50/40'
                    }`}
                  >
                    <div className="flex min-w-0 gap-4">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1rem] border border-slate-200 bg-white sm:h-24 sm:w-24">
                        {candidate.imageUrl ? (
                          <img src={candidate.imageUrl} alt={candidate.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-indigo-100 text-indigo-500">
                            <AppIcon name="spark" size={20} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start gap-2">
                          <p
                            className="min-w-0 flex-1 overflow-hidden text-sm font-black leading-5 text-slate-900 sm:text-[0.95rem]"
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {candidate.title}
                          </p>
                          <span className={`inline-flex h-7 items-center justify-center rounded-full px-2.5 text-[9px] font-black uppercase tracking-[0.08em] ${getFinderScoreTone(candidate.dealScore)}`}>
                            Score {candidate.dealScore ?? 0}
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                          {candidate.merchant} · {candidate.domain}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`inline-flex h-6 items-center justify-center rounded-full px-2.5 text-[9px] font-black uppercase tracking-[0.08em] ${
                            candidate.productConfidence >= 70
                              ? 'bg-emerald-100 text-emerald-700'
                              : candidate.productConfidence >= 40
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-rose-100 text-rose-700'
                          }`}>
                            {candidate.resultType}
                          </span>
                          {(candidate.rankLabels ?? []).map((label) => (
                            <span
                              key={`${candidate.url}-${label}`}
                              className={`inline-flex h-6 items-center justify-center rounded-full px-2.5 text-[9px] font-black uppercase tracking-[0.08em] ${getFinderRankTone(label)}`}
                            >
                              {label}
                            </span>
                          ))}
                          {candidate.extractionStatus ? (
                            <span className="inline-flex h-6 items-center justify-center rounded-full border border-slate-200 bg-white px-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">
                              {candidate.extractionStatus}
                            </span>
                          ) : null}
                        </div>
                        {(priceLabel || originalPriceLabel || discountLabel) ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {priceLabel ? (
                              <span className="inline-flex h-7 items-center justify-center rounded-full bg-indigo-50 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-indigo-700">
                                {priceLabel}
                              </span>
                            ) : null}
                            {originalPriceLabel ? (
                              <span className="inline-flex h-7 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500 line-through">
                                {originalPriceLabel}
                              </span>
                            ) : null}
                            {discountLabel ? (
                              <span className="inline-flex h-7 items-center justify-center rounded-full bg-emerald-100 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">
                                {discountLabel}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        <p
                          className="mt-3 overflow-hidden text-sm leading-6 text-slate-600"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                          }}
                        >
                          {candidate.snippet}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          {candidate.category ? (
                            <span className="inline-flex h-6 items-center justify-center rounded-full border border-slate-200 bg-white px-2.5">
                              {candidate.category}
                            </span>
                          ) : null}
                          {candidate.rating != null ? (
                            <span className="inline-flex h-6 items-center justify-center rounded-full border border-slate-200 bg-white px-2.5">
                              {candidate.rating.toFixed(1)} Rating
                            </span>
                          ) : null}
                          {candidate.reviewCount != null ? (
                            <span className="inline-flex h-6 items-center justify-center rounded-full border border-slate-200 bg-white px-2.5">
                              {candidate.reviewCount.toLocaleString()} Reviews
                            </span>
                          ) : null}
                          {candidate.dataCompleteness != null ? (
                            <span className="inline-flex h-6 items-center justify-center rounded-full border border-slate-200 bg-white px-2.5">
                              {candidate.dataCompleteness}% complete
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 break-all text-xs leading-5 text-slate-400">{candidate.productLink ?? candidate.url}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => selectAIFinderResult(candidate)}
                        className={`inline-flex h-9 items-center justify-center rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.1em] ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Use This Result'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          openExternalUrl(candidateSourceUrl, {
                            dedupeKey: `ai-finder:${candidate.url}`,
                            missingMessage: 'Source link unavailable right now.',
                            blockedMessage: 'Allow pop-ups to open this source link.',
                          });
                        }}
                        disabled={!candidateSourceUrl}
                        className={`inline-flex h-9 items-center justify-center rounded-xl border px-3 text-[10px] font-black uppercase tracking-[0.1em] ${
                          candidateSourceUrl
                            ? 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                            : 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-300'
                        }`}
                      >
                        Open Source
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!candidateSourceUrl) {
                            setAiFinderError('Could not copy source link automatically.');
                            return;
                          }

                          const copyResult = await copyTextToClipboard(candidateSourceUrl);
                          if (copyResult === 'success') {
                            setAiFinderMessage('Source link copied to clipboard.');
                            setAiFinderError('');
                          } else {
                            setAiFinderError('Could not copy source link automatically.');
                          }
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                      >
                        Copy Link
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-700">
                {searchStatusMessage}
              </div>
            )}
          </div>
        ) : null}
        {searchStatus === 'completed with zero results' ? (
          <div className="mt-4 rounded-[1.5rem] border border-amber-100 bg-amber-50/80 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-700">Fallback Mode</p>
                <h4 className="mt-1 text-base font-black text-slate-900">Paste product URL instead</h4>
                <p className="mt-1 text-sm leading-6 text-slate-600">Tavily is a broad web discovery tool, not a product database. If it returns zero results, try more specific keywords like `iPhone 14 128GB` or paste a direct product page URL and continue with the fallback path.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={activateAIFinderDirectUrlFallback}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-indigo-500"
                >
                  Paste Product URL Instead
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {searchSnapshot ? (
          <div className="mt-4 rounded-[1.5rem] border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Search Result Debug Panel</p>
                <p className="mt-1 text-sm text-slate-500">
                  {searchSnapshot.message ?? 'Review what Tavily returned before continuing.'}
                </p>
              </div>
              <span className={`inline-flex h-8 items-center justify-center rounded-full px-3 text-[10px] font-black uppercase tracking-[0.1em] ${
                searchStatus === 'completed with results'
                  ? 'bg-emerald-100 text-emerald-700'
                  : searchStatus === 'completed with zero results'
                    ? 'bg-amber-100 text-amber-700'
                    : searchStatus === 'failed'
                      ? 'bg-rose-100 text-rose-700'
                      : searchStatus === 'running'
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-white text-slate-500'
              }`}>
                {searchStatus}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ['Request Sent', aiFinderRuntime.requestSent ? 'Yes' : 'No'],
                ['Response Received', aiFinderRuntime.responseReceived ? 'Yes' : searchStatus === 'failed' ? 'No' : 'Pending'],
                ['Current Action', aiFinderRuntime.currentAction],
                ['Last Error', aiFinderRuntime.lastError || 'None'],
                ['Raw Result Count', String(rawResultCount)],
                ['Filtered Result Count', String(filteredResultCount)],
                ['Total Results', String(searchSnapshot.searchStats?.totalResults ?? searchSnapshot.rawResults?.length ?? 0)],
                ['Product Candidates', String(searchSnapshot.searchStats?.validProductPages ?? resultCards.filter((candidate) => candidate.productConfidence >= 40).length)],
                ['Rejected Results', String(searchSnapshot.searchStats?.rejectedNonProductPages ?? resultCards.filter((candidate) => candidate.productConfidence < 40).length)],
                ['Selected Source', selectedAIFinderCandidate ? 'Chosen' : 'None'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
              <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Primary Query</p>
              <p className="mt-1 break-all text-sm text-slate-700">
                {aiFinderRuntime.actualQuery || searchSnapshot.searchQuery || searchSnapshot.requestPayload?.query || 'No query recorded'}
              </p>
            </div>
            {queryAttempts.length ? (
              <div className="mt-3 grid gap-2 lg:grid-cols-3">
                {queryAttempts.map((attempt) => (
                  <div key={`${attempt.label}-${attempt.query}`} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{attempt.label}</p>
                    <p className="mt-1 break-all text-sm font-semibold text-slate-700">{attempt.query}</p>
                    <p className="mt-2 text-xs text-slate-500">Result count: {attempt.rawResultCount}</p>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Tavily Search Meter</p>
            <button
              type="button"
              onClick={() => setShowSearchMeter((prev) => !prev)}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
            >
              {showSearchMeter ? 'Hide Tavily Search Meter' : 'Show Tavily Search Meter'}
            </button>
            {showSearchMeter ? (
              <div className="mt-3 space-y-2">
                {resultCards.length > 0 ? resultCards.map((candidate) => {
                  const barColor =
                    candidate.productConfidence >= 70
                      ? 'bg-emerald-500'
                      : candidate.productConfidence >= 40
                        ? 'bg-amber-500'
                        : 'bg-rose-500';

                  return (
                    <div
                      key={candidate.url}
                      className={`w-full rounded-2xl border px-4 py-3 transition-colors ${
                        selectedAIFinderUrl === candidate.url
                          ? 'border-indigo-200 bg-white shadow-sm'
                          : 'border-slate-200 bg-white/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {candidate.imageUrl ? (
                            <div className="mb-3 h-28 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                              <img src={candidate.imageUrl} alt={candidate.title} className="h-full w-full object-cover" />
                            </div>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-black text-slate-900">{candidate.title}</p>
                            <span className={`inline-flex h-6 items-center justify-center rounded-full px-2.5 text-[9px] font-black uppercase tracking-[0.08em] ${
                              candidate.productConfidence >= 70
                                ? 'bg-emerald-100 text-emerald-700'
                                : candidate.productConfidence >= 40
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-rose-100 text-rose-700'
                            }`}>
                              {candidate.resultType}
                            </span>
                            {candidate.isKnownEcommerceDomain ? (
                              <span className="inline-flex h-6 items-center justify-center rounded-full bg-indigo-100 px-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-indigo-700">
                                Known Commerce
                              </span>
                            ) : null}
                            {candidate.patterns.map((pattern) => (
                              <span key={pattern} className="inline-flex h-6 items-center justify-center rounded-full bg-slate-100 px-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-600">
                                {pattern}
                              </span>
                            ))}
                          </div>
                          <p className="mt-2 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                            {candidate.merchant} · {candidate.domain}
                          </p>
                          {(candidate.price != null || candidate.originalPrice != null) ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {candidate.price != null ? (
                                <span className="inline-flex h-7 items-center justify-center rounded-full bg-indigo-50 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-indigo-700">
                                  ${candidate.price.toFixed(2)}
                                </span>
                              ) : null}
                              {candidate.originalPrice != null ? (
                                <span className="inline-flex h-7 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                                  ${candidate.originalPrice.toFixed(2)}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-500">{candidate.snippet}</p>
                          <p className="mt-2 break-all text-xs text-slate-400">{candidate.url}</p>
                          <div className="mt-3">
                            <div className="flex items-center justify-between gap-3 text-[11px] font-semibold text-slate-500">
                              <span>Product confidence</span>
                              <span>{candidate.productConfidence}%</span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200">
                              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${candidate.productConfidence}%` }} />
                            </div>
                          </div>
                          {candidate.rejectionReasons.length ? (
                            <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50/70 px-3 py-3">
                              <p className="text-[9px] font-black uppercase tracking-[0.08em] text-rose-600">Why it was rejected</p>
                              <ul className="mt-2 space-y-1.5 text-xs text-rose-700">
                                {candidate.rejectionReasons.map((reason) => (
                                  <li key={reason} className="flex items-start gap-2">
                                    <span className="mt-[4px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                                    <span>{reason}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <span className={`inline-flex h-9 items-center justify-center rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.1em] ${
                            selectedAIFinderUrl === candidate.url
                              ? 'bg-indigo-600 text-white'
                              : 'border border-slate-200 bg-white text-slate-500'
                          }`}>
                            {selectedAIFinderUrl === candidate.url ? 'Selected in Step 3' : 'Review in Step 2'}
                          </span>
                          <span className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                            Debug View
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-700">
                    {searchStatusMessage}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        {(selectedAIFinderCandidate || aiFinderHasDirectUrlFallback) ? (
          <div className="mt-4 rounded-[1.75rem] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-500">Step 3</p>
                <h4 className="mt-1 text-base font-black text-slate-900">{aiFinderHasDirectUrlFallback ? 'Selected Fallback Source' : 'Selected Result'}</h4>
                <p className="mt-1 text-sm text-slate-500">{aiFinderHasDirectUrlFallback ? 'Use the pasted product URL as the source for coupon generation.' : 'Lock in one source, then generate the coupon fields from that selected result.'}</p>
                <div className="mt-4 rounded-2xl border border-white/80 bg-white/80 px-4 py-4 shadow-sm">
                  <h5 className="text-sm font-black text-slate-900">{selectedResultTitle}</h5>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{selectedResultMerchant}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedResultLabels.map((label) => (
                      <span
                        key={`selected-${label}`}
                        className={`inline-flex h-6 items-center justify-center rounded-full px-2.5 text-[9px] font-black uppercase tracking-[0.08em] ${getFinderRankTone(label)}`}
                      >
                        {label}
                      </span>
                    ))}
                    {selectedAIFinderCandidate?.dealScore != null ? (
                      <span className={`inline-flex h-6 items-center justify-center rounded-full px-2.5 text-[9px] font-black uppercase tracking-[0.08em] ${getFinderScoreTone(selectedAIFinderCandidate.dealScore)}`}>
                        Score {selectedAIFinderCandidate.dealScore}
                      </span>
                    ) : null}
                    {selectedResultPrice ? (
                      <span className="inline-flex h-6 items-center justify-center rounded-full bg-indigo-50 px-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-indigo-700">
                        {selectedResultPrice}
                      </span>
                    ) : null}
                    {selectedResultOriginalPrice ? (
                      <span className="inline-flex h-6 items-center justify-center rounded-full border border-slate-200 bg-white px-2.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-500 line-through">
                        {selectedResultOriginalPrice}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{selectedResultDescription}</p>
                  {selectedAIFinderCandidate?.dataCompleteness != null ? (
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      {selectedAIFinderCandidate.dataCompleteness}% deal data complete
                    </p>
                  ) : null}
                  <p className="mt-2 break-all text-xs leading-5 text-slate-400">{aiFinderSelectedSourceUrl}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerateAIDealJson()}
                  disabled={aiFinderLoading || !canGenerateFromSource}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {aiFinderLoading ? 'Generating...' : aiFinderHasDirectUrlFallback ? 'Generate Coupon From Pasted URL' : 'Generate Coupon From Selected Result'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAIFinderUrl('');
                    setAiFinderUseDirectUrlFallback(false);
                    setAiFinderResult(null);
                    setAiFinderStage(resultCards.length ? 'results-loaded' : 'idle');
                    setAiFinderMessage("Selection cleared. Pick a different result whenever you're ready.");
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 transition-colors hover:border-rose-200 hover:text-rose-600"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {aiFinderResult && hasMissingSourceAsset ? (
          <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
            Missing source asset: {!sourceAssets?.productUrl ? 'source product URL' : 'image'} could not be extracted yet.
            {previewDeal?.sourceType === 'url' ? ' Fallback portal data was preserved from the pasted URL. Add the missing image manually if needed.' : ''}
          </div>
        ) : null}

        {aiFinderResult ? (
          <div className="mt-5 rounded-[1.75rem] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-500">Step 4</p>
                <h4 className="mt-1 text-base font-black text-slate-900">Generated Coupon Preview</h4>
                <p className="mt-1 text-sm text-slate-500">Review the generated coupon fields, then send them into the Business Portal or export the JSON.</p>
              </div>
              <div className="flex flex-col items-start gap-2 lg:items-end">
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Step 5</span>
                <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleFillPortalFromAIDeal()}
                  disabled={aiFinderLoading || !canFillPortal}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Fill Portal
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAIDealJson()}
                  disabled={!aiFinderResult.generatedJson}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  onClick={handleReviewAIDealMissingFields}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                >
                  Review Missing Fields
                </button>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
            <div className="overflow-hidden rounded-[1.75rem] border border-indigo-100/80 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-5 shadow-sm shadow-indigo-100/40">
              <div className="flex min-w-0 items-start gap-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[1.25rem] border border-white/80 bg-white shadow-sm sm:h-24 sm:w-24">
                  {previewDeal?.imageUrl ? (
                    <img src={previewDeal.imageUrl} alt={previewDeal.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-indigo-100 text-indigo-500">
                      <AppIcon name="spark" size={22} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-7 items-center justify-center rounded-full border border-white/80 bg-white px-3 text-[9px] font-black uppercase tracking-[0.1em] text-indigo-600 shadow-sm">
                      {previewDeal?.category}
                    </span>
                    <span className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[9px] font-black uppercase tracking-[0.1em] shadow-sm ${
                      resultQuality === 'enriched'
                        ? 'bg-emerald-600 text-white shadow-emerald-100'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {resultQuality === 'enriched' ? 'Enriched result (full deal data)' : 'Basic result (keyword only)'}
                    </span>
                    {previewDeal?.discountPercent ? (
                      <span className="inline-flex h-7 items-center justify-center rounded-full bg-indigo-600 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-white shadow-sm shadow-indigo-200">
                        {previewDeal.discountPercent}% OFF
                      </span>
                    ) : null}
                    <span className="inline-flex h-7 items-center justify-center rounded-full border border-white/80 bg-white px-3 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 shadow-sm">
                      Score {aiFinderResult.dealScore}
                    </span>
                  </div>
                  <h4
                    className="mt-3 max-w-[42rem] overflow-hidden text-lg font-black leading-6 text-slate-900 sm:text-[1.15rem]"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {previewDeal?.title}
                  </h4>
                  <p className="mt-1.5 text-sm font-semibold text-slate-500">{previewDeal?.businessName}</p>
                  <p
                    className="mt-3 max-w-[42rem] overflow-hidden text-sm leading-6 text-slate-600 sm:text-[0.95rem]"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {aiFinderResult.summary ?? previewDeal?.summary ?? previewDeal?.description}
                  </p>
                  <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2 xl:grid-cols-3">
                    {priceText ? (
                      <div className="min-w-0 rounded-xl bg-white/80 px-3 py-2">
                        <span>Price: <span className="font-semibold text-slate-700">{priceText}</span></span>
                      </div>
                    ) : null}
                    {originalPriceText ? (
                      <div className="min-w-0 rounded-xl bg-white/80 px-3 py-2">
                        <span>List: <span className="font-semibold text-slate-700">{originalPriceText}</span></span>
                      </div>
                    ) : null}
                    {previewDeal?.rating ? (
                      <div className="min-w-0 rounded-xl bg-white/80 px-3 py-2">
                        <span>Rating: <span className="font-semibold text-slate-700">{previewDeal.rating.toFixed(1)}</span></span>
                      </div>
                    ) : null}
                    {previewDeal?.reviewCount ? (
                      <div className="min-w-0 rounded-xl bg-white/80 px-3 py-2">
                        <span>Reviews: <span className="font-semibold text-slate-700">{previewDeal.reviewCount.toLocaleString()}</span></span>
                      </div>
                    ) : null}
                    {previewDeal?.merchant ? (
                      <div className="min-w-0 rounded-xl bg-white/80 px-3 py-2">
                        <span>Merchant: <span className="font-semibold text-slate-700">{previewDeal.merchant}</span></span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-[1.75rem] border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Extraction Status</p>
              <div className="mt-4 space-y-4 text-sm text-slate-600">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-700">Completion</p>
                    <span className="text-sm font-black text-slate-900">{completionPercent}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full ${completionPercent >= 75 ? 'bg-emerald-500' : completionPercent >= 45 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                      style={{ width: `${completionPercent}%` }}
                    />
                  </div>
                  {extractionStatus === 'Extraction failed' ? (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs leading-5 font-semibold text-rose-600">Extraction failed</p>
                      {aiFinderResult.enrichmentError ? (
                        <p className="text-xs leading-5 text-rose-500">{aiFinderResult.enrichmentError}</p>
                      ) : null}
                    </div>
                  ) : aiFinderResult.partialData ? (
                    <p className="mt-3 text-xs leading-5 text-amber-700">
                      Partial Data: {aiFinderResult.enrichmentError ?? 'Keyword result could not be fully enriched.'}
                    </p>
                  ) : (
                    <p className="mt-3 text-xs leading-5 text-emerald-600">{extractionStatus}</p>
                  )}
                </div>
                <div ref={aiFinderFieldCoverageRef} className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Source Assets</p>
                  <div className="mt-3 space-y-3 text-xs text-slate-600">
                    <div>
                      <p className="font-black uppercase tracking-[0.08em] text-slate-500">Website URL</p>
                      <p className="mt-1 break-all leading-5 text-slate-700">{sourceAssets?.websiteUrl ?? 'Missing source asset'}</p>
                    </div>
                    <div>
                      <p className="font-black uppercase tracking-[0.08em] text-slate-500">Source Product URL</p>
                      <p className="mt-1 break-all leading-5 text-slate-700">{sourceAssets?.productUrl ?? 'Missing source asset'}</p>
                    </div>
                    <div>
                      <p className="font-black uppercase tracking-[0.08em] text-slate-500">Affiliate / Outbound Link</p>
                      <p className="mt-1 break-all leading-5 text-slate-700">{sourceAssets?.affiliateUrl ?? 'Not provided'}</p>
                    </div>
                    <div>
                      <p className="font-black uppercase tracking-[0.08em] text-slate-500">Image URL</p>
                      <p className="mt-1 break-all leading-5 text-slate-700">{sourceAssets?.imageUrl ?? 'Missing source asset'}</p>
                    </div>
                  </div>
                </div>
                {extractionDebug ? (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Extraction Debug</p>
                    <div className="mt-3 space-y-3 text-xs text-slate-600">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl bg-white px-3 py-2">
                          <p className="font-black uppercase tracking-[0.08em] text-slate-500">Fetch Attempted</p>
                          <p className="mt-1 font-semibold text-slate-700">{extractionDebug.fetchAttempted ? 'Yes' : 'No'}</p>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-2">
                          <p className="font-black uppercase tracking-[0.08em] text-slate-500">Fetch Succeeded</p>
                          <p className="mt-1 font-semibold text-slate-700">{extractionDebug.fetchSucceeded ? 'Yes' : 'No'}</p>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-2">
                          <p className="font-black uppercase tracking-[0.08em] text-slate-500">HTTP Status</p>
                          <p className="mt-1 font-semibold text-slate-700">{extractionDebug.responseStatus ?? 'Unknown'}</p>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-2">
                          <p className="font-black uppercase tracking-[0.08em] text-slate-500">Content-Type</p>
                          <p className="mt-1 break-all font-semibold text-slate-700">{extractionDebug.contentType ?? 'Unknown'}</p>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-2 sm:col-span-2">
                          <p className="font-black uppercase tracking-[0.08em] text-slate-500">HTML Length</p>
                          <p className="mt-1 font-semibold text-slate-700">{extractionDebug.htmlLength || 0}</p>
                        </div>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-3">
                        <p className="font-black uppercase tracking-[0.08em] text-slate-500">Source URL</p>
                        <p className="mt-1 break-all leading-5 text-slate-700">{extractionDebug.sourceUrl}</p>
                        <p className="mt-3 font-black uppercase tracking-[0.08em] text-slate-500">Final URL</p>
                        <p className="mt-1 break-all leading-5 text-slate-700">{extractionDebug.finalUrl ?? 'Unknown'}</p>
                        <p className="mt-3 font-black uppercase tracking-[0.08em] text-slate-500">Cleaned Product URL</p>
                        <p className="mt-1 break-all leading-5 text-slate-700">{extractionDebug.cleanedProductUrl ?? 'Missing source asset'}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-3">
                        <p className="font-black uppercase tracking-[0.08em] text-slate-500">Extracted Fields</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {[
                            ['Title extracted', extractionDebug.extractedFlags.title],
                            ['Image extracted', extractionDebug.extractedFlags.image],
                            ['Price extracted', extractionDebug.extractedFlags.price],
                            ['Canonical URL extracted', extractionDebug.extractedFlags.canonicalUrl],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                              <p className="text-[11px] font-semibold text-slate-500">{label}</p>
                              <p className={`mt-1 font-semibold ${value ? 'text-emerald-600' : 'text-rose-600'}`}>{value ? 'Yes' : 'No'}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-3">
                        <p className="font-black uppercase tracking-[0.08em] text-slate-500">Matched Selectors</p>
                        <div className="mt-2 space-y-2">
                          {[
                            ['Title', extractionDebug.matchedSelectors.title ?? 'No selector matched'],
                            ['Image', extractionDebug.matchedSelectors.image ?? 'No selector matched'],
                            ['Price', extractionDebug.matchedSelectors.price ?? 'No selector matched'],
                            ['Canonical URL', extractionDebug.matchedSelectors.canonicalUrl ?? 'No selector matched'],
                          ].map(([label, value]) => (
                            <div key={label} className="flex items-start justify-between gap-3">
                              <p className="font-semibold text-slate-500">{label}</p>
                              <p className="max-w-[65%] text-right text-slate-700">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      {extractionDebug.failureReason ? (
                        <div className="rounded-xl border border-rose-100 bg-rose-50/80 px-3 py-3">
                          <p className="font-black uppercase tracking-[0.08em] text-rose-700">Failure Reason</p>
                          <p className="mt-2 text-sm leading-5 text-rose-700">{extractionDebug.failureReason}</p>
                        </div>
                      ) : null}
                      <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-3">
                        <p className="font-black uppercase tracking-[0.08em] text-amber-700">Fields Failed</p>
                        {extractionDebug.failedFields.length ? (
                          <ul className="mt-2 space-y-1.5 text-amber-700">
                            {extractionDebug.failedFields.map((field) => (
                              <li key={field} className="flex items-start gap-2">
                                <span className="mt-[4px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                <span>{field}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm font-semibold text-emerald-600">No extraction field failures.</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                  <p>
                    Source: <span className="font-semibold text-slate-800">{previewDeal?.sourceType === 'url' ? 'Direct URL' : 'Keyword search'}</span>
                  </p>
                  {previewDeal?.sourceQuery ? (
                    <p className="mt-2 break-all text-xs leading-5 text-slate-500">{previewDeal.sourceQuery}</p>
                  ) : null}
                </div>
                {previewDeal?.tags?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {previewDeal.tags.map((tag) => (
                      <span key={tag} className="inline-flex h-7 items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Field Coverage</p>
                  <div className="mt-3 grid gap-3">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Filled</p>
                      {filledFields.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {filledFields.map((field) => (
                            <span key={field} className="inline-flex h-7 items-center justify-center rounded-full border border-emerald-200 bg-white px-3 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-700">
                              {field}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-emerald-700">No filled fields yet.</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-700">Missing Required</p>
                      {requiredMissingFields.length ? (
                        <ul className="mt-2 space-y-2 text-sm text-amber-700">
                          {requiredMissingFields.map((field) => (
                            <li key={field} className="flex items-start gap-2">
                              <span className="mt-[2px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                              <span className="leading-5">{field}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm font-semibold text-emerald-600">All required portal fields are ready.</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Missing Optional</p>
                      {optionalMissingFields.length ? (
                        <ul className="mt-2 space-y-2 text-sm text-slate-600">
                          {optionalMissingFields.map((field) => (
                            <li key={field} className="flex items-start gap-2">
                              <span className="mt-[2px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                              <span className="leading-5">{field}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm font-semibold text-emerald-600">Optional enrichment fields are filled.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        ) : null}
      </div>
    );
  };

  const renderBulkImportPanel = () => (
    <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Portal Intake</p>
          <h3 className="mt-1 text-lg font-black text-slate-900">Load deal JSON into the Business Portal</h3>
          <p className="mt-1 text-sm text-slate-500">Paste one deal object or an array, then load it into the editor to review before publishing.</p>
        </div>
        <button
          onClick={handleLoadBulkImportSample}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
        >
          Load Sample
        </button>
      </div>
      <textarea
        value={bulkImportJson}
        onChange={(event) => setBulkImportJson(event.target.value)}
        placeholder="Paste your deal JSON here..."
        className="mt-4 min-h-[240px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-mono text-[12px] leading-6 text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
      />
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-slate-400">
          Required fields: <span className="font-semibold text-slate-500">businessName, title, description, category, offerText</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={handleLoadBulkImportIntoPortal}
            disabled={bulkImportLoading}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bulkImportLoading ? 'Loading...' : 'Load Into Portal'}
          </button>
          <button
            onClick={handleLoadBulkImportIntoPortal}
            disabled={bulkImportLoading}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-4 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {bulkImportLoading ? 'Loading...' : 'Import and Open in Portal'}
          </button>
        </div>
      </div>
      {bulkImportMessage ? (
        <p className="mt-3 text-sm font-semibold text-emerald-600">{bulkImportMessage}</p>
      ) : null}
      {bulkImportError ? (
        <p className="mt-3 text-sm font-semibold text-rose-500">{bulkImportError}</p>
      ) : null}
    </div>
  );

  const renderBusinessPortal = () => {
    if (LOCAL_ADMIN_MODE) {
      if (isCreating) {
        return (
          <div className="space-y-4">
            {renderImportedDraftSwitcher()}
            {hasUnsavedFormChanges ? (
              <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                Unsaved changes
              </p>
            ) : null}
            <CreateDealForm
              onSubmit={handleCreateDeal}
              onCancel={closeCreateEditor}
              userLocation={userLocation}
              hasPreciseUserLocation={hasPreciseUserLocation}
              initialData={dealDraft}
              onDraftChange={setPortalFieldSnapshot}
              onDirtyChange={setHasUnsavedFormChanges}
              autofillRequest={portalAutofillRequest}
            />
          </div>
        );
      }

      return (
        <div className="space-y-8">
          {renderDealsErrorBanner()}
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-900">Business Portal</h2>
              {portalSuccessMessage ? (
                <p className="text-sm font-semibold text-emerald-600 mt-2">{portalSuccessMessage}</p>
              ) : null}
            </div>
            <button
              onClick={handleOpenCreateDeal}
              className="bg-indigo-600 p-3 rounded-2xl text-white shadow-xl shadow-indigo-200 hover:scale-105 transition-transform"
            >
              <AppIcon name="plus" size={24} />
            </button>
          </div>

          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
            <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-6">Active Drops</h3>

            <div className="space-y-4">
              {deals.length > 0 ? (
                deals.map(deal => (
                  <div key={deal.id} className="overflow-hidden bg-slate-50 border border-slate-100 rounded-3xl px-5 py-5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <CompanyLogo businessName={deal.businessName} logoUrl={deal.logoUrl} category={deal.category} size={40} />
                        <div className="min-w-0">
                          <h4 className="text-slate-900 font-bold">{deal.title}</h4>
                          <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider">{deal.businessName}</p>
                          {isAdminRoute && showDebug && deal.businessType === 'online' ? (
                            <p className="mt-1 truncate font-mono text-[10px] text-slate-400">
                              {deal.websiteUrl ?? 'No websiteUrl saved'}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <Timer expiresAt={deal.expiresAt} className="text-xs" />
                        <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-full mt-2 ${deal.expiresAt > Date.now() ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                          {deal.expiresAt > Date.now() ? 'Active' : 'Expired'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 border-t border-slate-200/50 pt-5">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col">
                          <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest">Claims</span>
                          <span className="text-lg font-mono font-black text-slate-900">{deal.claimCount ?? deal.currentClaims}/{deal.maxClaims}</span>
                        </div>
                        <div className="flex w-full flex-wrap items-center justify-start gap-2">
                          <button
                            onClick={() => handleReuseDealAndGoLive(deal)}
                            className="inline-flex h-9 w-[96px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-white transition-colors hover:bg-indigo-500"
                          >
                            <AppIcon name="zap" size={14} />
                            Go Live
                          </button>
                          <button
                            onClick={() => handleReuseDeal(deal)}
                            className="inline-flex h-9 w-[88px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                          >
                            Reuse
                          </button>
                          <button
                            onClick={() => handleCancelDeal(deal.id)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                            aria-label="Delete deal"
                          >
                            <AppIcon name="trash" size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-slate-400 text-center py-6 text-sm italic">No deals created yet.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-slate-100 rounded-3xl p-6 flex flex-col items-center justify-center gap-1 shadow-sm">
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Total Drops</span>
              <span className="text-3xl font-black text-slate-900">{deals.length}</span>
            </div>
            <div className="bg-white border border-slate-100 rounded-3xl p-6 flex flex-col items-center justify-center gap-1 shadow-sm">
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Total Claims</span>
              <span className="text-3xl font-black text-slate-900">{deals.reduce((acc, d) => acc + (d.claimCount ?? d.currentClaims), 0)}</span>
            </div>
          </div>

          <button
            onClick={handleOpenCreateDeal}
            className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-lg flex items-center justify-center gap-3 shadow-2xl shadow-slate-200 hover:bg-slate-800 transition-all"
          >
            <AppIcon name="plus" size={24} />
            CREATE NEW DROP
          </button>
        </div>
      );
    }

    if (!session && !hasAdminAccess) {
      return (
        <BusinessPaywall
          isAuthenticated={false}
          message="Sign in with Google to start business access."
          onSubscribe={handleSubscribeNow}
          onSignIn={() => {
            setAuthError('Sign in with Google to start business access.');
            setAuthModalOpen(true);
          }}
        />
      );
    }

    if (!hasPortalAccess && !hasAdminAccess) {
      return (
        <BusinessPaywall
          isAuthenticated
          loading={subscriptionLoading}
          message={subscriptionMessage}
          onSubscribe={handleSubscribeNow}
          onSignIn={() => setAuthModalOpen(true)}
        />
      );
    }

    if (isCreating) {
      return (
        <div className="space-y-4">
          {renderImportedDraftSwitcher()}
          {hasUnsavedFormChanges ? (
            <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              Unsaved changes
            </p>
          ) : null}
          <CreateDealForm 
            onSubmit={handleCreateDeal} 
            onCancel={closeCreateEditor}
            userLocation={userLocation}
            hasPreciseUserLocation={hasPreciseUserLocation}
            initialData={dealDraft}
            onDraftChange={setPortalFieldSnapshot}
            onDirtyChange={setHasUnsavedFormChanges}
            autofillRequest={portalAutofillRequest}
          />
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {renderDealsErrorBanner()}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Business Portal</h2>
            {portalSuccessMessage ? (
              <p className="text-sm font-semibold text-emerald-600 mt-2">{portalSuccessMessage}</p>
            ) : null}
          </div>
          <button 
            onClick={handleOpenCreateDeal}
            className="bg-indigo-600 p-3 rounded-2xl text-white shadow-xl shadow-indigo-200 hover:scale-105 transition-transform"
          >
            <AppIcon name="plus" size={24} />
          </button>
        </div>

        <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
          <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-6">Active Drops</h3>
          
          <div className="space-y-4">
            {deals.length > 0 ? (
              deals.map(deal => (
                <div key={deal.id} className="overflow-hidden bg-slate-50 border border-slate-100 rounded-3xl px-5 py-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <CompanyLogo businessName={deal.businessName} logoUrl={deal.logoUrl} category={deal.category} size={40} />
                      <div className="min-w-0">
                        <h4 className="text-slate-900 font-bold">{deal.title}</h4>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider">{deal.businessName}</p>
                        {isAdminRoute && showDebug && deal.businessType === 'online' ? (
                          <p className="mt-1 truncate font-mono text-[10px] text-slate-400">
                            {deal.websiteUrl ?? 'No websiteUrl saved'}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <Timer expiresAt={deal.expiresAt} className="text-xs" />
                      <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-full mt-2 ${deal.expiresAt > Date.now() ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                        {deal.expiresAt > Date.now() ? 'Active' : 'Expired'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-200/50 pt-5">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col">
                        <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest">Claims</span>
                        <span className="text-lg font-mono font-black text-slate-900">{deal.claimCount ?? deal.currentClaims}/{deal.maxClaims}</span>
                      </div>
                      <div className="flex w-full flex-wrap items-center justify-start gap-2">
                        <button
                          onClick={() => handleReuseDealAndGoLive(deal)}
                          className="inline-flex h-9 w-[96px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-white transition-colors hover:bg-indigo-500"
                        >
                          <AppIcon name="zap" size={14} />
                          Go Live
                        </button>
                        <button
                          onClick={() => handleReuseDeal(deal)}
                          className="inline-flex h-9 w-[88px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                        >
                          Reuse
                        </button>
                        <button
                          onClick={() => handleCancelDeal(deal.id)}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                          aria-label="Delete deal"
                        >
                          <AppIcon name="trash" size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-400 text-center py-6 text-sm italic">No deals created yet.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-slate-100 rounded-3xl p-6 flex flex-col items-center justify-center gap-1 shadow-sm">
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Total Drops</span>
            <span className="text-3xl font-black text-slate-900">{deals.length}</span>
          </div>
          <div className="bg-white border border-slate-100 rounded-3xl p-6 flex flex-col items-center justify-center gap-1 shadow-sm">
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Total Claims</span>
            <span className="text-3xl font-black text-slate-900">{deals.reduce((acc, d) => acc + (d.claimCount ?? d.currentClaims), 0)}</span>
          </div>
        </div>

        <button 
          onClick={handleOpenCreateDeal}
          className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-lg flex items-center justify-center gap-3 shadow-2xl shadow-slate-200 hover:bg-slate-800 transition-all"
        >
          <AppIcon name="plus" size={24} />
          CREATE NEW DROP
        </button>
      </div>
    );
  };

  const renderAdminPage = () => {
    if (!hasAdminAccess) {
      return (
        <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
          <div className="mx-auto max-w-[430px] space-y-4 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Admin Access</p>
              <h1 className="mt-1 text-2xl font-black text-slate-900">Sign in with the approved admin account</h1>
              <p className="mt-2 text-sm text-slate-500">Use the normal LiveDrop sign-in modal with the approved admin email to open the admin dashboard.</p>
            </div>
            {adminAccessError ? (
              <p className="text-sm font-semibold text-rose-500">{adminAccessError}</p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setAuthError('');
                setAuthInfo('Sign in with the approved admin account to continue.');
                setAuthModalOpen(true);
              }}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-indigo-600 px-4 text-[11px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-indigo-500"
            >
              Open Sign-In
            </button>
            <button
              type="button"
              onClick={handleReturnToPublicApp}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
            >
              Back to App
            </button>
          </div>
        </div>
      );
    }

    const managedDeals = [...deals].sort((a, b) => b.createdAt - a.createdAt);
    const localManagedDeals = managedDeals.filter((deal) => deal.businessType !== 'online');
    const onlineManagedDeals = managedDeals.filter((deal) => deal.businessType === 'online');
    const expiredManagedDeals = managedDeals.filter((deal) => isExpiredDeal(deal));

    const renderAdminDealCard = (deal: Deal) => {
      const isDeleting = deletingDealIds.has(deal.id);

      return (
      <div key={deal.id} className="rounded-[1.75rem] border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{deal.businessName}</p>
            <h3 className="mt-1 text-base font-black text-slate-900">{deal.title}</h3>
            <p className="mt-1 text-xs text-slate-500">
              {deal.category} · {deal.businessType === 'online' ? 'Online' : deal.distance}
            </p>
            <p className="mt-2 truncate font-mono text-[10px] text-slate-400">{deal.websiteUrl ?? deal.productUrl ?? 'No external link saved'}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[9px] font-black uppercase tracking-[0.1em] ${deal.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
              {deal.status ?? 'active'}
            </span>
            {deal.adminTag ? (
              <span className="inline-flex h-7 items-center justify-center rounded-full bg-indigo-50 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-indigo-600">
                {deal.adminTag}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => handleEditDeal(deal)} className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600">
            Edit
          </button>
          <button onClick={() => handleReuseDeal(deal)} className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600">
            Reuse
          </button>
          <button onClick={() => handleReuseDealAndGoLive(deal)} className="inline-flex h-9 items-center justify-center rounded-xl bg-indigo-600 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-white transition-colors hover:bg-indigo-500">
            Relaunch
          </button>
          <button onClick={() => void handleAdminSetDealStatus(deal, deal.status === 'active' ? 'draft' : 'active')} className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600">
            {deal.status === 'active' ? 'Unpublish' : 'Publish'}
          </button>
          <button onClick={() => void handleAdminToggleFeatured(deal)} className={`inline-flex h-9 items-center justify-center rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${deal.featured ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'border border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:text-indigo-600'}`}>
            {deal.featured ? 'Featured' : 'Mark Featured'}
          </button>
          <button onClick={() => void handleAdminToggleTrending(deal)} className={`inline-flex h-9 items-center justify-center rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${deal.adminTag === 'trending' ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'border border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:text-indigo-600'}`}>
            {deal.adminTag === 'trending' ? 'Trending' : 'Mark Trending'}
          </button>
          <button
            onClick={() => void handleAdminDeleteDeal(deal)}
            disabled={isDeleting}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Delete deal"
          >
            <AppIcon name="trash" size={16} />
          </button>
        </div>
      </div>
      );
    };

    if (isCreating) {
      return (
        <div className="min-h-screen bg-slate-50 px-3 py-4 text-slate-900">
          <div className="mx-auto max-w-[430px] space-y-4">
            <div className="rounded-[1rem] border border-indigo-100 bg-indigo-50/85 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-700">
              {`Logged in as Admin: ${adminStatusLabel}`}
            </div>
            <div className="flex items-center justify-between rounded-[1.75rem] border border-slate-100 bg-white px-4 py-3 shadow-sm">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Admin</p>
                <p className="text-sm font-semibold text-slate-500">Internal deal editor</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleBackFromAdminEditor()}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                >
                  <AppIcon name="play" size={12} className="rotate-180" />
                  Back
                </button>
                <button
                  onClick={() => void runWithUnsavedCreateGuard(() => {
                    handleReturnToPublicApp();
                  })}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                >
                  Public App
                </button>
                <button
                  onClick={() => void runWithUnsavedCreateGuard(() => handleAdminLogout())}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 transition-colors hover:border-rose-200 hover:text-rose-500"
                >
                  Logout
                </button>
              </div>
            </div>
            {renderImportedDraftSwitcher()}
            {hasUnsavedFormChanges ? (
              <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                Unsaved changes
              </p>
            ) : null}
            <CreateDealForm
              onSubmit={handleCreateDeal}
              onCancel={closeCreateEditor}
              userLocation={userLocation}
              hasPreciseUserLocation={hasPreciseUserLocation}
              initialData={dealDraft}
              onDraftChange={setPortalFieldSnapshot}
              onDirtyChange={setHasUnsavedFormChanges}
              autofillRequest={portalAutofillRequest}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 px-3 py-4 text-slate-900">
        <div className="mx-auto max-w-[1200px] space-y-4">
          <div className="rounded-[1rem] border border-indigo-100 bg-indigo-50/85 px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-indigo-700">
            {`Logged in as Admin: ${adminStatusLabel}`}
          </div>
          <div className="rounded-[1.75rem] border border-slate-100 bg-white px-4 py-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">LiveDrop Admin</p>
                <h1 className="mt-1 text-2xl font-black text-slate-900">Content Control Center</h1>
                <p className="mt-2 text-sm text-slate-500">Manage shared drops, backend state, and internal publishing tools.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={handleReturnToPublicApp}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                >
                  Public App
                </button>
                <button
                  onClick={handleAdminLogout}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 transition-colors hover:border-rose-200 hover:text-rose-500"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>

          {renderDealsErrorBanner()}

          {renderAIDealFinderPanel()}

          {renderBulkImportPanel()}

          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Manual Control</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">Create or refresh shared deals</h2>
                <p className="mt-2 text-sm text-slate-500">
                  {expiredManagedDeals.length > 0
                    ? `${expiredManagedDeals.length} expired deals are ready to relaunch.`
                    : 'No expired deals are waiting for relaunch right now.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  onClick={() => void refreshSharedDeals()}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                >
                  Force Refresh
                </button>
                <button
                  onClick={() => void handleReuseAllExpiredDeals()}
                  disabled={expiredManagedDeals.length === 0}
                  className={`inline-flex h-10 items-center justify-center rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.12em] transition-colors ${
                    expiredManagedDeals.length > 0
                      ? 'border border-indigo-200 bg-indigo-50 text-indigo-600 hover:border-indigo-300 hover:bg-indigo-100'
                      : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-300'
                  }`}
                >
                  Reuse All Expired
                </button>
                <button
                  onClick={handleOpenCreateDeal}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-600 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-indigo-500"
                >
                  New Deal
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Backend Activity</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">Shared backend activity</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{adminActivityCards.length} entries</span>
                {adminLogs.length > 0 ? (
                  <button
                    onClick={() => setShowAdvancedBackendLogs((prev) => !prev)}
                    className="inline-flex h-8 items-center justify-center rounded-full border border-slate-200 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                  >
                    {showAdvancedBackendLogs ? 'Hide Debug' : 'Advanced Debug'}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {adminActivityCards.length > 0 ? adminActivityCards.map((entry) => {
                const tone = entry.status === 'success'
                  ? {
                      card: 'border-emerald-100 bg-emerald-50/70',
                      badge: 'border-emerald-200 bg-white text-emerald-600',
                      title: 'text-emerald-700',
                    }
                  : entry.status === 'warning'
                    ? {
                        card: 'border-amber-100 bg-amber-50/70',
                        badge: 'border-amber-200 bg-white text-amber-600',
                        title: 'text-amber-700',
                      }
                    : {
                        card: 'border-rose-100 bg-rose-50/80',
                        badge: 'border-rose-200 bg-white text-rose-600',
                        title: 'text-rose-700',
                      };

                return (
                  <div key={entry.id} className={`rounded-2xl border px-4 py-3 shadow-sm ${tone.card}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex h-7 items-center justify-center rounded-full border px-2.5 text-[10px] font-black uppercase tracking-[0.1em] ${tone.badge}`}>
                            {entry.status}
                          </span>
                          <p className={`text-sm font-bold ${tone.title}`}>{entry.title}</p>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{entry.summary}</p>
                      </div>
                      <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              }) : (
                <p className="text-sm text-slate-400">No shared backend activity yet.</p>
              )}
            </div>
            {showAdvancedBackendLogs && adminLogs.length > 0 ? (
              <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Advanced Debug</p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">Raw backend logs</p>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Hidden by default
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {adminLogs.map((entry) => (
                    <div key={`debug-${entry.id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-700">{entry.message}</p>
                        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">
                          {new Date(entry.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      {entry.detail ? (
                        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
                          {entry.detail}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            {false && managedDeals.map((deal) => (
              <div key={deal.id} className="rounded-[1.75rem] border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{deal.businessName}</p>
                    <h3 className="mt-1 text-base font-black text-slate-900">{deal.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">{deal.category} · {deal.businessType === 'online' ? 'Online' : deal.distance}</p>
                    <p className="mt-2 truncate font-mono text-[10px] text-slate-400">{deal.websiteUrl ?? deal.productUrl ?? 'No external link saved'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`inline-flex h-7 items-center justify-center rounded-full px-3 text-[9px] font-black uppercase tracking-[0.1em] ${
                      deal.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {deal.status ?? 'active'}
                    </span>
                    {deal.adminTag ? (
                      <span className="inline-flex h-7 items-center justify-center rounded-full bg-indigo-50 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-indigo-600">
                        {deal.adminTag}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleEditDeal(deal)}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleReuseDeal(deal)}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                  >
                    Reuse
                  </button>
                  <button
                    onClick={() => handleReuseDealAndGoLive(deal)}
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-indigo-600 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-white transition-colors hover:bg-indigo-500"
                  >
                    Relaunch
                  </button>
                  <button
                    onClick={() => void handleAdminSetDealStatus(deal, deal.status === 'active' ? 'draft' : 'active')}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                  >
                    {deal.status === 'active' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    onClick={() => void handleAdminToggleFeatured(deal)}
                    className={`inline-flex h-9 items-center justify-center rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
                      deal.featured ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'border border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:text-indigo-600'
                    }`}
                  >
                    {deal.featured ? 'Featured' : 'Mark Featured'}
                  </button>
                  <button
                    onClick={() => void handleAdminToggleTrending(deal)}
                    className={`inline-flex h-9 items-center justify-center rounded-xl px-3 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
                      deal.adminTag === 'trending' ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'border border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:text-indigo-600'
                    }`}
                  >
                    {deal.adminTag === 'trending' ? 'Trending' : 'Mark Trending'}
                  </button>
                  <button
                    onClick={() => void handleAdminDeleteDeal(deal)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500"
                    aria-label="Delete deal"
                  >
                    <AppIcon name="trash" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-4">
            <div className="rounded-[1.5rem] border border-slate-100 bg-white p-3 shadow-sm">
              <div className="inline-flex w-full rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setAdminDealsView('local')}
                  aria-pressed={adminDealsView === 'local'}
                  className={`inline-flex h-9 flex-1 items-center justify-center rounded-lg px-3 text-[10px] font-black uppercase tracking-[0.12em] transition-colors ${
                    adminDealsView === 'local'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-indigo-600'
                  }`}
                >
                  Local ({localManagedDeals.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAdminDealsView('online')}
                  aria-pressed={adminDealsView === 'online'}
                  className={`inline-flex h-9 flex-1 items-center justify-center rounded-lg px-3 text-[10px] font-black uppercase tracking-[0.12em] transition-colors ${
                    adminDealsView === 'online'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-indigo-600'
                  }`}
                >
                  Online ({onlineManagedDeals.length})
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {adminDealsView === 'local' ? (
                localManagedDeals.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 py-5 text-center text-slate-500 shadow-sm">
                    No local deals yet.
                  </div>
                ) : (
                  localManagedDeals.map((deal) => renderAdminDealCard(deal))
                )
              ) : onlineManagedDeals.length === 0 ? (
                <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 py-5 text-center text-slate-500 shadow-sm">
                  No online deals yet.
                </div>
              ) : (
                onlineManagedDeals.map((deal) => renderAdminDealCard(deal))
              )}
            </div>
            {/*
            {adminDealsView === 'local' ? (
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setAdminDealsOpenSection((prev) => (prev === 'local' ? null : 'local'))}
                className="mb-2 flex w-full items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 text-left transition-colors hover:border-indigo-200 md:pointer-events-none md:cursor-default md:rounded-none md:border-0 md:bg-transparent md:p-0"
                aria-expanded={adminDealsOpenSection === 'local'}
                aria-controls="admin-local-deals"
              >
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Local Deals</p>
                  <h3 className="text-lg font-black text-slate-900">Nearby drops</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{localManagedDeals.length} total</span>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-sm font-black text-slate-400 transition-transform md:hidden">
                    {adminDealsOpenSection === 'local' ? '−' : '+'}
                  </span>
                </div>
              </button>
              <div
                id="admin-local-deals"
                className={`min-w-0 overflow-hidden transition-[max-height,opacity] duration-300 ease-out md:overflow-visible ${
                  adminDealsOpenSection === 'local'
                    ? 'max-h-[5000px] opacity-100'
                    : 'max-h-0 opacity-0 md:max-h-none md:opacity-100'
                }`}
              >
                <div className="space-y-3 pt-1 md:pt-0">
                  {localManagedDeals.length === 0 ? (
                    <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 py-5 text-center text-slate-500 shadow-sm">
                      No local deals yet.
                    </div>
                  ) : (
                    localManagedDeals.map((deal) => renderAdminDealCard(deal))
                  )}
                </div>
              </div>
            </div>

            <div className="min-w-0">
              <button
                type="button"
                onClick={() => setAdminDealsOpenSection((prev) => (prev === 'online' ? null : 'online'))}
                className="mb-2 flex w-full items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 text-left transition-colors hover:border-indigo-200 md:pointer-events-none md:cursor-default md:rounded-none md:border-0 md:bg-transparent md:p-0"
                aria-expanded={adminDealsOpenSection === 'online'}
                aria-controls="admin-online-deals"
              >
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Online Deals</p>
                  <h3 className="text-lg font-black text-slate-900">Live online drops</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{onlineManagedDeals.length} total</span>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-sm font-black text-slate-400 transition-transform md:hidden">
                    {adminDealsOpenSection === 'online' ? '−' : '+'}
                  </span>
                </div>
              </button>
              <div
                id="admin-online-deals"
                className={`min-w-0 overflow-hidden transition-[max-height,opacity] duration-300 ease-out md:overflow-visible ${
                  adminDealsOpenSection === 'online'
                    ? 'max-h-[5000px] opacity-100'
                    : 'max-h-0 opacity-0 md:max-h-none md:opacity-100'
                }`}
              >
                <div className="space-y-3 pt-1 md:pt-0">
                  {onlineManagedDeals.length === 0 ? (
                    <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50 px-4 py-5 text-center text-slate-500 shadow-sm">
                      No online deals yet.
                    </div>
                  ) : (
                    onlineManagedDeals.map((deal) => renderAdminDealCard(deal))
                  )}
                </div>
              </div>
            </div>
            */}
          </div>
        </div>
      </div>
    );
  };

  const renderPublicShell = () => (
    <Layout
      currentView={currentView}
      onViewChange={(view) => {
        setNotificationsOpen(false);

        if (view === currentView) {
          return;
        }

        setSelectedDetailDealId(null);

        if (view === 'catalog') {
          handleOpenCatalog();
          return;
        }

        if (view === 'business-portal') {
          handleOpenBusinessPortal();
          return;
        }

        setCurrentView(view);
      }}
      activeCatalogCount={catalogCoupons.filter(coupon => coupon.status === 'active').length}
      notifications={notifications}
      notificationsOpen={notificationsOpen}
      unreadNotificationCount={notifications.filter((item) => !item.read).length}
      onToggleNotifications={toggleNotifications}
      role={role}
      isAuthenticated={Boolean(session)}
      userEmail={authUser?.email}
      userAvatarUrl={authUser?.user_metadata?.avatar_url ?? null}
      isAdminSession={hasAdminAccess}
      adminLabel={adminStatusLabel}
      desktopSearchQuery={desktopSearchQuery}
      onDesktopSearchQueryChange={setDesktopSearchQuery}
      desktopSearchPlaceholder={dropMode === 'online' ? 'Search online deals, brands, categories' : 'Search local deals, stores, categories'}
      isDropModeHighlighted={false}
      onOpenAuth={() => {
        setAuthError('');
        setAuthInfo('');
        setAuthModalOpen(true);
      }}
      onSignOut={handleSignOut}
    >
      {currentView === 'live-deals' && renderLiveDeals()}
      {currentView === 'deal-detail' && renderDealDetail()}
      {currentView === 'catalog' && renderCatalog()}
      {currentView === 'my-claims' && renderMyClaims()}
      {currentView === 'business-portal' && renderBusinessPortal()}

      <ClaimModal 
        deal={selectedDeal} 
        onClose={() => setSelectedDeal(null)} 
        onConfirm={confirmClaim}
        onViewClaims={handleViewClaims}
      />
    </Layout>
  );

  const hasKnownRoute = routePath === '/admin' || routePath === '/' || routePath === '/dashboard';
  const routeFallback = (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-[430px] rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-500">Navigation Error</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">LiveDrop recovered safely</h1>
        <p className="mt-2 text-sm text-slate-500">The app hit an unexpected route state. You can return to the public app below.</p>
        <button
          onClick={() => navigateToPath('/')}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-indigo-600 px-4 text-[11px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-indigo-500"
        >
          Go to Home
        </button>
      </div>
    </div>
  );

  return (
    <AppErrorBoundary>
      <ToastStack notifications={toastNotifications} />
      <AppShellRoute
        routePath={hasKnownRoute ? routePath : '__fallback__'}
        renderAdminPage={renderAdminPage}
        renderPublicShell={renderPublicShell}
        fallback={routeFallback}
      />
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          setAuthError('');
          setAuthInfo('');
        }}
        onContinueWithGoogle={handleContinueWithGoogle}
        onEmailAuth={handleEmailAuth}
        loading={authLoading}
        error={authError}
        info={authInfo}
      />
    </AppErrorBoundary>
  );
}
