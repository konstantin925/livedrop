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
import { getCategoryIconName, getCategoryLabel } from './utils/categories';
import { canSaveDealToCatalog, createCatalogCouponFromDeal, refreshCatalogCoupons } from './utils/catalog';
import { CompanyLogo } from './components/CompanyLogo';
import { ToastStack } from './components/ToastStack';
import { AuthModal } from './components/AuthModal';
import { BusinessPaywall } from './components/BusinessPaywall';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { getAuthRedirectUrl, hasSupabaseAnonKey, hasSupabaseConfig, resolvedSupabaseUrl, supabase, supabaseConfigIssue, supabaseEdgeClient } from './lib/supabase';
import { emptyCloudAppState, mergeCloudState } from './utils/cloudState';
import { AppIcon } from './components/AppIcon';

const DEALS_STORAGE_KEY = 'livedrop_deals';
const CLAIMS_STORAGE_KEY = 'livedrop_claims';
const CATALOG_STORAGE_KEY = 'livedrop_catalog';
const NOTIFICATIONS_STORAGE_KEY = 'livedrop_notifications';
const ROLE_STORAGE_KEY = 'livedrop_user_role';
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
const BULK_IMPORT_SAMPLE = JSON.stringify(
  [
    {
      businessName: 'Amazon',
      title: 'Portable Monitor Flash Deal',
      description: 'A slim second-screen monitor with a limited online price drop for today.',
      category: 'Tech',
      offerText: '22% OFF',
      imageUrl: 'https://images.unsplash.com/photo-1527443154391-507e9dc6c5cc?auto=format&fit=crop&w=900&q=80',
      productUrl: 'https://example.com/portable-monitor',
      websiteUrl: 'https://example.com/portable-monitor',
      durationMinutes: 150,
      claimCount: 84,
      maxClaims: 999,
    },
    {
      businessName: 'Pixel Forge',
      title: 'Mechanical Keyboard Weekend Drop',
      description: 'Hot-swappable boards and compact layouts are part of this limited online drop.',
      category: 'Tech',
      offerText: '40% OFF',
      imageUrl: 'https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?auto=format&fit=crop&w=900&q=80',
      productUrl: 'https://example.com/keyboards',
      websiteUrl: 'https://example.com/keyboards',
      durationMinutes: 120,
      claimCount: 126,
      maxClaims: 999,
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

const readStoredDeals = (): Deal[] => {
  try {
    const raw = localStorage.getItem(DEALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((deal) => ({
          ...deal,
          businessType: deal.businessType ?? 'local',
          status: deal.status ?? 'active',
          currentClaims: deal.currentClaims ?? deal.claimCount ?? 0,
          claimCount: deal.claimCount ?? deal.currentClaims ?? 0,
          createdAt: deal.createdAt ?? Date.now(),
          expiresAt: deal.expiresAt ?? Date.now(),
          hasTimer: deal.hasTimer ?? true,
        }))
      : [];
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

const getDistanceForDeal = (location: UserLocation, deal: Deal) =>
  calculateDistance(location.lat, location.lng, deal.lat, deal.lng);

const getRadiusForDeal = (location: UserLocation, deal: Deal) => {
  const distance = getDistanceForDeal(location, deal);
  return RADIUS_OPTIONS.find(option => distance <= option) ?? RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1];
};

const parseDistanceLabel = (distanceLabel: string): number | null => {
  const normalized = distanceLabel.trim().toLowerCase();

  if (normalized.startsWith('<')) {
    const value = Number.parseFloat(normalized.replace(/[^0-9.]/g, ''));
    return Number.isFinite(value) ? value : 0.1;
  }

  const value = Number.parseFloat(normalized.replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) ? value : null;
};

const getEffectiveLocalDealDistance = (location: UserLocation, deal: Deal): number => {
  const hasUsableCoordinates =
    Number.isFinite(deal.lat) &&
    Number.isFinite(deal.lng) &&
    !(deal.lat === 0 && deal.lng === 0);

  if (hasUsableCoordinates) {
    return calculateDistance(location.lat, location.lng, deal.lat, deal.lng);
  }

  const fallbackDistance = parseDistanceLabel(deal.distance);
  return fallbackDistance ?? Number.POSITIVE_INFINITY;
};

const syncSharedOnlineDeals = (existingDeals: Deal[]): Deal[] => {
  const seededOnlineDeals = generateSeededOnlineDeals();
  const seededOnlineDealIds = new Set(seededOnlineDeals.map((deal) => deal.id));
  const nonSeededDeals = existingDeals.filter((deal) => !seededOnlineDealIds.has(deal.id));

  return [...seededOnlineDeals, ...nonSeededDeals];
};

const getDealExternalUrl = (deal: Deal) => deal.affiliateUrl ?? deal.websiteUrl ?? deal.productUrl ?? null;

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
  offerText: string;
  originalPrice?: number;
  price?: number;
  discountPercent?: number;
  affiliateUrl?: string;
  rating?: number;
  reviewCount?: number;
  merchant?: string;
  shippingInfo?: string;
  summary?: string;
  tags?: string[];
  sourceType?: 'keyword' | 'url';
  sourceQuery?: string;
  maxPriceMatched?: boolean;
  stockStatus?: string;
  imageUrl?: string;
  productLink?: string;
  productUrl?: string;
  websiteUrl?: string;
  durationMinutes?: number;
  claimCount?: number;
  maxClaims?: number;
  isOnline?: boolean;
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
    query: string;
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
  productLink: string;
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
    { key: 'productUrl', label: 'Product Link', value: normalizePortalFieldValue(portalState?.productUrl) },
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

  const buildPortalAutofillPayload = (
  source:
    | {
        businessName?: string;
        websiteUrl?: string;
        productUrl?: string;
        productLink?: string;
        affiliateUrl?: string;
        imageUrl?: string;
        title?: string;
        description?: string;
        category?: string;
        offerText?: string;
      }
    | null
    | undefined,
): PortalAutofillPayload => ({
  storeName: normalizePortalFieldValue(source?.businessName),
  websiteUrl: normalizePortalFieldValue(source?.websiteUrl),
  productLink: normalizePortalFieldValue(source?.productLink ?? source?.productUrl ?? source?.affiliateUrl),
  imageUrl: normalizePortalFieldValue(source?.imageUrl),
  dealTitle: normalizePortalFieldValue(source?.title),
  description: normalizePortalFieldValue(source?.description),
  category: normalizePortalFieldValue(source?.category),
  offerText: normalizePortalFieldValue(source?.offerText),
});

const TEST_COUPON_AUTOFILL: PortalAutofillPayload = {
  storeName: 'Amazon',
  websiteUrl: 'https://www.amazon.com',
  productLink: 'https://www.amazon.com/dp/test',
  imageUrl: '',
  dealTitle: 'Test Deal',
  description: 'Test description',
  category: 'Tech',
  offerText: 'Limited-time deal',
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
  owner_id: string | null;
};

type SharedPublishFailure = {
  deal: Deal;
  mode: 'insert' | 'update';
  payload: DealRow;
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
  extraFieldsRemoved: string[];
  payload: DealRow;
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
  'owner_id',
] as const satisfies ReadonlyArray<keyof DealRow>;

const PUBLIC_DEALS_SCHEMA_FIELD_SET = new Set<string>(PUBLIC_DEALS_SCHEMA_FIELDS);

const mapDealRowToDeal = (row: DealRow): Deal => ({
  id: row.id,
  businessType: row.business_type,
  status: row.status,
  featured: row.featured ?? false,
  adminTag: row.admin_tag ?? null,
  businessName: row.business_name ?? row.merchant ?? 'Unknown Merchant',
  logoUrl: row.logo_url ?? undefined,
  imageUrl: row.image_url ?? row.image ?? undefined,
  title: row.title,
  description: row.description,
  offerText: row.offer_text,
  originalPrice: row.original_price,
  discountPercent: row.discount_percent,
  affiliateUrl: row.affiliate_url ?? row.product_link ?? undefined,
  reviewCount: row.review_count,
  stockStatus: row.stock_status ?? undefined,
  websiteUrl: row.website_url ?? undefined,
  productUrl: row.product_link ?? row.product_url ?? row.affiliate_url ?? undefined,
  hasTimer: row.has_timer,
  distance: row.distance,
  lat: row.lat,
  lng: row.lng,
  createdAt: new Date(row.created_at).getTime(),
  expiresAt: new Date(row.expires_at).getTime(),
  maxClaims: row.max_claims,
  currentClaims: row.current_claims,
  claimCount: row.claim_count,
  category: row.category,
});

const mapDealToDealRow = (deal: Deal, ownerId?: string | null): DealRow => {
  const productLink = deal.affiliateUrl ?? deal.productUrl ?? null;

  return {
    id: deal.id,
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
    original_price: deal.originalPrice ?? null,
    discount_percent: deal.discountPercent ?? null,
    affiliate_url: productLink,
    review_count: deal.reviewCount ?? null,
    stock_status: deal.stockStatus ?? null,
    website_url: deal.websiteUrl ?? null,
    product_link: productLink,
    product_url: deal.productUrl ?? productLink,
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
    owner_id: ownerId ?? null,
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

const sanitizeDealRowForPublish = (row: DealRow) => {
  const sanitized = Object.fromEntries(
    PUBLIC_DEALS_SCHEMA_FIELDS.map((field) => [field, row[field]]),
  ) as DealRow;
  const extraFieldsRemoved = Object.keys(row).filter((field) => !PUBLIC_DEALS_SCHEMA_FIELD_SET.has(field));

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
  operation: 'insert' | 'update' | 'delete' | 'select' | 'bulk-upsert';
  payload?: DealRow | DealRow[];
  extraFieldsRemoved?: string[];
  schemaColumns?: string[];
  schemaSource?: 'rpc' | 'local-fallback';
  payloadKeys?: string[];
  missingColumns?: string[];
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
      typeof item.category !== 'string' ||
      typeof item.offerText !== 'string'
    ) {
      throw new Error(`Deal at index ${index} is missing required fields.`);
    }

    return {
      businessName: item.businessName.trim(),
      title: item.title.trim(),
      description: item.description.trim(),
      category: item.category.trim(),
      offerText: item.offerText.trim(),
      originalPrice:
        Number.isFinite(item.originalPrice) && Number(item.originalPrice) >= 0
          ? Number(item.originalPrice)
          : undefined,
      price:
        Number.isFinite(item.price) && Number(item.price) >= 0
          ? Number(item.price)
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
      maxPriceMatched: typeof item.maxPriceMatched === 'boolean' ? item.maxPriceMatched : undefined,
      stockStatus: typeof item.stockStatus === 'string' ? item.stockStatus.trim() : undefined,
      imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl.trim() : undefined,
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
    };
  });
};

export default function App() {
  const [currentView, setCurrentView] = useState<View>('live-deals');
  const [routePath, setRoutePath] = useState(() =>
    typeof window !== 'undefined' ? normalizeRoutePath(window.location.pathname) : '/',
  );
  const [role, setRole] = useState<UserRole>('customer');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [catalogCoupons, setCatalogCoupons] = useState<CatalogCoupon[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
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
  const [dropMode, setDropMode] = useState<'local' | 'online'>('local');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedFeedFilter, setSelectedFeedFilter] = useState<'all' | 'trending' | 'ending-soon' | 'just-dropped'>('all');
  const [locationStatus, setLocationStatus] = useState<'loading' | 'success' | 'denied' | 'error'>('loading');
  const [cityName, setCityName] = useState<string>('');
  const [showDebug, setShowDebug] = useState(false);
  const [claimCopyStatus, setClaimCopyStatus] = useState<Record<string, ClipboardCopyResult | null>>({});
  const [catalogDropWarnings, setCatalogDropWarnings] = useState<string[]>([]);
  const [catalogSaveFeedback, setCatalogSaveFeedback] = useState<Record<string, string | null>>({});
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toastNotifications, setToastNotifications] = useState<AppNotification[]>([]);
  const seenDealIdsRef = useRef<Set<string>>(new Set());
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
  const [adminLogs, setAdminLogs] = useState<Array<{ id: string; level: 'info' | 'error'; message: string; detail?: string; timestamp: number }>>([]);
  const [adminSessionEmail, setAdminSessionEmail] = useState<string | null>(() => readAdminSessionEmail());
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
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
  const adminEmail = (adminSessionEmail ?? authUser?.email ?? '').toLowerCase();
  const hasAdminAccess = adminEmail === APPROVED_ADMIN_EMAIL;
  const selectedAIFinderCandidate = useMemo(
    () =>
      aiFinderCandidates.find((candidate) => candidate.url === selectedAIFinderUrl)
      ?? aiFinderSearchSnapshot?.searchCandidates?.find((candidate) => candidate.url === selectedAIFinderUrl)
      ?? null,
    [aiFinderCandidates, aiFinderSearchSnapshot?.searchCandidates, selectedAIFinderUrl],
  );
  const aiFinderDirectUrl = aiFinderUrl.trim();
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
    seenDealIdsRef.current = new Set(nextDeals.map((deal) => deal.id));
  };

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

    console.info('[LiveDrop] Auto Fill Portal verification', {
      normalizedDeal: pendingPortalAutofill.normalizedDeal,
      mappedPortalPayload: expectedPortalValues,
      finalPortalFormState: livePortalValues,
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
    setAdminLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        level,
        message,
        detail,
        timestamp: Date.now(),
      },
      ...prev,
    ].slice(0, 20));
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
    operation: 'insert' | 'update' | 'bulk-upsert',
  ): Promise<DealsSchemaPreflightResult> => {
    const { payload, extraFieldsRemoved } = sanitizeDealRowForPublish(row);
    const { columns: schemaColumns, source: schemaSource } = await fetchDealsSchemaColumns();
    const payloadKeys = Object.keys(payload);
    const missingColumns = payloadKeys.filter((key) => !schemaColumns.includes(key));

    const logDetail = buildSharedWriteLogDetail({
      operation,
      payload,
      extraFieldsRemoved,
      schemaColumns,
      schemaSource,
      payloadKeys,
      missingColumns,
    });

    pushAdminLog('info', `Preflight checked ${DEALS_SCHEMA}.${DEALS_TABLE} ${operation} payload`, logDetail);

    if (missingColumns.length > 0) {
      const preflightError = Object.assign(
        new Error(`Schema mismatch on ${DEALS_SCHEMA}.${DEALS_TABLE}. Missing columns: ${missingColumns.join(', ')}`),
        {
          code: 'SCHEMA_MISMATCH',
          details: `Payload keys not present in ${DEALS_SCHEMA}.${DEALS_TABLE}: ${missingColumns.join(', ')}`,
          hint: 'Apply the latest supabase/schema.sql migration before retrying publish.',
          missingColumns,
          payloadKeys,
          schemaColumns,
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
    const directUrl = aiFinderUrl.trim();

    if (!directUrl) {
      const message = 'Paste a product URL in Advanced Filters to use the fallback path.';
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

    if (!selectedSourceUrl) {
      const message = 'Paste a direct product URL to continue.';
      setAiFinderError(message);
      setAiFinderMessage('Direct URL intake is the active admin flow right now. Paste a product URL to continue.');
      return null;
    }

    return selectedSourceUrl;
  };

  const navigateToPath = (path: string) => {
    if (typeof window === 'undefined') return;
    const nextPath = normalizeRoutePath(path);
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
    navigateToPath('/');
  };

  const fetchSharedDeals = async () => {
    const includeAllStatuses = isAdminRoute && hasAdminAccess;
    console.info('[LiveDrop] Querying shared deals table:', `${DEALS_SCHEMA}.${DEALS_TABLE}`, {
      projectUrl: resolvedSupabaseUrl,
      includeAllStatuses,
    });

    const baseQuery = getDealsTableClient()
      .select('*')
      .order('created_at', { ascending: false });

    const { data, error } = includeAllStatuses
      ? await baseQuery
      : await baseQuery.eq('status', 'active');

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

    return (data ?? []).map((row) => mapDealRowToDeal(row as DealRow));
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

    return mapDealRowToDeal(data as DealRow);
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

    return (data ?? []).map((row) => mapDealRowToDeal(row as DealRow));
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
      .eq('id', deal.id)
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
    return mapDealRowToDeal(data as DealRow);
  };

  const deleteDealFromBackend = async (dealId: string) => {
    const { error } = await getDealsTableClient()
      .delete()
      .eq('id', dealId);

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
    const sourceUrl = options?.overrideUrl?.trim() || aiFinderUrl.trim();

    setAiFinderRuntime({
      requestSent: true,
      responseReceived: false,
      actualQuery: sourceUrl,
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

    if (!sourceUrl) {
      const message = 'Paste a direct product URL to continue.';
      setAiFinderError(message);
      setAiFinderMessage('Direct URL intake is the only active admin flow right now.');
      setAiFinderRuntime((prev) => ({
        ...prev,
        currentAction: 'idle',
        lastError: message,
      }));
      throw new Error(message);
    }

    setAiFinderLoading(true);
    setAiFinderError('');
    setAiFinderMessage(mode === 'extract' ? 'URL accepted. Starting extraction...' : 'Generating coupon fields from the product URL...');
    setAiFinderStage('searching');
    setAiFinderSearchSnapshot(null);
    setAiFinderCandidates([]);
    setSelectedAIFinderUrl('');
    setAiFinderUseDirectUrlFallback(false);

    const requestPayload = {
      phase: mode,
      keyword: keyword || undefined,
      url: sourceUrl,
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

      setAiFinderRuntime((prev) => ({
        ...prev,
        responseReceived: true,
        currentAction: 'completed',
      }));
      setAiFinderResult(result);

      if (mode === 'extract') {
        const extractionSucceeded = result.extractionStatus === 'Extraction succeeded';
        setAiFinderStage(extractionSucceeded ? 'result-selected' : 'idle');
        setAiFinderMessage(
          extractionSucceeded
            ? 'Stage 1 complete. Source data was extracted and is ready for normalization.'
            : 'Stage 1 completed with partial data. Basic URL fields were mapped and you can still continue to Generate Deal.',
        );
      } else {
        const extractionSucceeded = result.extractionStatus === 'Extraction succeeded';
        setAiFinderStage('coupon-generated');
        setAiFinderMessage(
          extractionSucceeded
            ? 'Stage 2 complete. A normalized deal object is ready for portal mapping.'
            : 'Stage 2 completed with fallback data. The normalized deal object is ready, but some source fields are still missing.',
        );
        syncGeneratedDealToPortalFields(result);
        setBulkImportMessage(
          extractionSucceeded
            ? 'Generated coupon JSON inserted into the portal intake box.'
            : 'Fallback coupon JSON inserted into the portal intake box. Add any missing source assets before publishing.',
        );
      }

      pushAdminLog(
        'info',
        mode === 'extract' ? `Extracted deal from ${sourceUrl}` : `Generated coupon for ${result.normalizedDeal.title}`,
        result.missingFields.length ? `Missing: ${result.missingFields.join(', ')}` : 'All key fields extracted.',
      );

      return result;
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
      await runAIDealFinder('generate', { overrideUrl: sourceUrl });
    } catch (error) {
      console.error('[LiveDrop] AI Deal Finder JSON generation failed', error);
    }
  };

  const handleFillPortalFromAIDeal = async (overrideUrl?: string) => {
    const sourceUrl = ensureAIFinderSourceSelection(overrideUrl);
    if (!sourceUrl) return;

    try {
      const result = aiFinderResult?.generatedJson
        ? aiFinderResult
        : await runAIDealFinder('generate', { overrideUrl: sourceUrl });
      const mappedPortalPayload = buildPortalAutofillPayload(result.normalizedDeal);
      openPortalWithAutofillPayload(mappedPortalPayload, result.normalizedDeal, {
        serializedDeal: result.generatedJson,
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
      productLink: TEST_COUPON_AUTOFILL.productLink,
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
            aiFinderResult.normalizedDeal.affiliateUrl ??
            aiFinderResult.normalizedDeal.productUrl ??
            aiFinderResult.normalizedDeal.websiteUrl ??
            aiFinderUrl.trim()
          )
        ) || undefined,
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

      setAiFinderResult(result);
      setBulkImportJson(result.generatedJson);
      setBulkImportMessage('Enhanced deal JSON is ready and synced into the portal intake box.');
      setAiFinderMessage(result.resultQuality === 'enriched' ? 'Deal upgraded with full product-page data.' : 'Enhancement attempted. Partial data is still available.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Enhance Deal failed.';
      setAiFinderError(message);
      console.error('[LiveDrop] Enhance Deal failed', { error, message });
    } finally {
      setAiFinderLoading(false);
    }
  };

  const createDraftFromBulkImport = (item: BulkImportDealInput, index = 0): Deal => {
    const durationMinutes = item.durationMinutes && item.durationMinutes > 0 ? item.durationMinutes : 120;
    const currentClaims = item.claimCount && item.claimCount >= 0 ? item.claimCount : 0;
    const maxClaims = item.maxClaims && item.maxClaims > 0 ? item.maxClaims : 999;
    const createdAt = Date.now() - index * 60 * 1000;
    const businessType = item.isOnline === false ? 'local' : 'online';
    const affiliateUrl = item.affiliateUrl || undefined;
    const productLink = item.productLink || item.productUrl || undefined;
    const websiteUrl = item.websiteUrl || affiliateUrl || productLink || undefined;
    const productUrl = productLink || affiliateUrl || item.websiteUrl || undefined;

    return {
      id: `import-draft-${Math.random().toString(36).slice(2, 10)}`,
      businessType,
      status: 'draft',
      businessName: item.businessName,
      title: item.title,
      description: item.description,
      offerText: item.offerText,
      originalPrice: item.originalPrice ?? null,
      discountPercent: item.discountPercent ?? null,
      affiliateUrl,
      reviewCount: item.reviewCount ?? null,
      stockStatus: item.stockStatus ?? null,
      imageUrl: item.imageUrl || undefined,
      websiteUrl,
      productUrl,
      hasTimer: true,
      distance: businessType === 'online' ? 'Online' : '1 mi',
      lat: businessType === 'online' ? 0 : userLocation.lat,
      lng: businessType === 'online' ? 0 : userLocation.lng,
      createdAt,
      expiresAt: createdAt + durationMinutes * 60 * 1000,
      maxClaims,
      currentClaims,
      claimCount: currentClaims,
      category: item.category,
    };
  };

  const syncGeneratedDealToPortalFields = (
    result: AIDealFinderResult,
    options?: {
      openPortal?: boolean;
    },
  ) => {
    const serializedDeal = result.generatedJson || JSON.stringify(result.normalizedDeal, null, 2);
    const parsedDeals = parseBulkImportDeals(serializedDeal);
    const nextDraft = createDraftFromBulkImport(parsedDeals[0], 0);

    setDealDraft(nextDraft);
    setPortalFieldSnapshot(null);
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
    const fallbackDeals = syncSharedOnlineDeals(savedDeals);

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

        const nextDeals = remoteDeals.length > 0 ? syncSharedOnlineDeals(remoteDeals) : fallbackDeals;
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
    setLocationStatus('loading');
    if (!navigator.geolocation) {
      setLocationStatus('error');
      setUserLocation(DEFAULT_LOCATION);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        setUserLocation(newLocation);
        setLocationStatus('success');

        // If no deals exist yet, seed them near this location
        const savedDeals = readStoredDeals();
        if (savedDeals.length === 0) {
          const seeded = syncSharedOnlineDeals(generateSeededDeals(newLocation));
          setDeals(seeded);
          seenDealIdsRef.current = new Set(seeded.map((deal) => deal.id));
        }
      },
      (error) => {
        console.error('Geolocation error:', error);
        setLocationStatus(error.code === 1 ? 'denied' : 'error');
        setUserLocation(DEFAULT_LOCATION);
        
        // Do NOT seed here to avoid fallback coordinates
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const restartLocalDeals = (locationOverride?: UserLocation) => {
    const nextLocation = locationOverride ?? userLocation;
    const refreshedLocalDeals = generateSeededDeals(nextLocation);

    setDeals((prevDeals) => {
      const nonLocalDeals = prevDeals.filter((deal) => deal.businessType !== 'local');
      const nextDeals = syncSharedOnlineDeals([...refreshedLocalDeals, ...nonLocalDeals]);
      seenDealIdsRef.current = new Set(nextDeals.map((deal) => deal.id));
      return nextDeals;
    });

    setSelectedFeedFilter('all');
    setCurrentView('live-deals');
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  // Fetch city name from coordinates
  useEffect(() => {
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
        const data = await response.json();
        const city = data.address.city || data.address.town || data.address.village || data.address.suburb || data.address.county || 'Unknown City';
        setCityName(city);
      } catch (error) {
        console.error('Error fetching city name:', error);
        setCityName('Unknown Location');
      }
    };

    if (userLocation.lat && userLocation.lng) {
      fetchCity();
    }
  }, [userLocation.lat, userLocation.lng]);

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

    const nextSeenIds = new Set(seenDealIdsRef.current);
    const newDeals = deals.filter((deal) => !seenDealIdsRef.current.has(deal.id));

    newDeals.forEach((deal) => {
      nextSeenIds.add(deal.id);

      if (deal.businessType === 'online') {
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
  }, [deals, radius, userLocation.lat, userLocation.lng]);

  useEffect(() => {
    deals.forEach((deal) => {
      if (deal.businessType === 'online') return;

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
  }, [deals, radius, userLocation.lat, userLocation.lng]);

  // Save data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(DEALS_STORAGE_KEY, JSON.stringify(deals));
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

  const confirmClaim = (deal: Deal): Claim => {
    const existingClaim = claims.find(c => c.dealId === deal.id);
    if (existingClaim) {
      return existingClaim;
    }

    if (deal.currentClaims >= deal.maxClaims || deal.expiresAt <= Date.now()) {
      throw new Error('This deal can no longer be claimed.');
    }

    const newClaim: Claim = {
      id: Math.random().toString(36).substr(2, 9),
      dealId: deal.id,
      dealTitle: deal.title,
      businessName: deal.businessName,
      logoUrl: deal.logoUrl,
      category: deal.category,
      claimCode: Math.random().toString(36).substr(2, 6).toUpperCase(),
      claimedAt: Date.now(),
      expiresAt: deal.expiresAt,
      status: 'active'
    };

    setClaims(prev => [newClaim, ...prev]);
    setDeals(prev =>
      prev.map(d =>
        d.id === deal.id
          ? { ...d, currentClaims: d.currentClaims + 1, claimCount: (d.claimCount ?? d.currentClaims) + 1 }
          : d
      )
    );
    handleSaveToCatalog(deal);
    return newClaim;
  };

  const handleCreateDeal = async (dealData: Omit<Deal, 'id' | 'createdAt'>) => {
    const existingDraft = editingDealId ? deals.find((deal) => deal.id === editingDealId) : null;
    const localDeal: Deal = {
      ...dealData,
      id: editingDealId ?? Math.random().toString(36).substr(2, 9),
      createdAt: existingDraft?.createdAt ?? Date.now(),
      currentClaims: dealData.currentClaims ?? dealData.claimCount ?? 0,
      claimCount: dealData.claimCount ?? dealData.currentClaims ?? 0,
      status: 'active',
      featured: dealData.featured ?? existingDraft?.featured ?? false,
      adminTag: dealData.adminTag ?? existingDraft?.adminTag ?? null,
    };

    let publishedDeal = localDeal;
    let sharedWriteSucceeded = false;
    const sharedWriteMode: SharedPublishFailure['mode'] = editingDealId ? 'update' : 'insert';

    if (supabase && hasSupabaseConfig) {
      try {
        publishedDeal = editingDealId
          ? await updateDealInBackend(localDeal)
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
    } else {
      setLastSharedPublishFailure(null);
      setDealsError(`Shared backend is not configured for ${DEALS_SCHEMA}.${DEALS_TABLE} in ${resolvedSupabaseUrl || '(missing VITE_SUPABASE_URL)'}. Showing local-only publishing fallback.`);
    }

    setDeals(prev => [publishedDeal, ...prev.filter((deal) => deal.id !== publishedDeal.id)]);
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
    setBulkImportCandidates([]);
    setSelectedBulkImportIndex(0);
    if (publishedDeal.businessType !== 'online') {
      setRadius(prev => Math.max(prev, getRadiusForDeal(userLocation, publishedDeal)));
      setDropMode('local');
    } else {
      setDropMode('online');
    }
    setPortalSuccessMessage(sharedWriteSucceeded ? 'Your deal is live' : '');
    setIsCreating(false);
    if (!isAdminRoute) {
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
    setBulkImportCandidates([]);
    setSelectedBulkImportIndex(0);
    setIsCreating(true);
  };

  const createReusedDealPayload = (
    sourceDeal: Deal,
    options?: {
      durationMinutes?: number;
      publishImmediately?: boolean;
    },
  ): Omit<Deal, 'id' | 'createdAt'> => {
    const durationMinutes = options?.durationMinutes ?? 30;
    const nextExpiry = Date.now() + durationMinutes * 60 * 1000;

    return {
      businessType: sourceDeal.businessType,
      businessName: sourceDeal.businessName,
      logoUrl: sourceDeal.logoUrl,
      imageUrl: sourceDeal.imageUrl,
      title: sourceDeal.title,
      description: sourceDeal.description,
      offerText: sourceDeal.offerText,
      websiteUrl: sourceDeal.websiteUrl,
      productUrl: sourceDeal.productUrl,
      hasTimer: true,
      distance: sourceDeal.businessType === 'online' ? 'Online' : sourceDeal.distance,
      lat: sourceDeal.lat,
      lng: sourceDeal.lng,
      expiresAt: nextExpiry,
      maxClaims: sourceDeal.maxClaims,
      currentClaims: 0,
      claimCount: 0,
      category: sourceDeal.category,
    };
  };

  const handleReuseDeal = (deal: Deal) => {
    const nextDraft = {
      ...deal,
      expiresAt: Date.now() + 30 * 60 * 1000,
      currentClaims: 0,
      claimCount: 0,
      hasTimer: true,
    };
    setPortalSuccessMessage('');
    setEditingDealId(null);
    setBulkImportCandidates([]);
    setSelectedBulkImportIndex(0);
    setDealDraft(nextDraft);
    setPortalFieldSnapshot(nextDraft);
    setIsCreating(true);
  };

  const handleReuseDealAndGoLive = (deal: Deal) => {
    void handleCreateDeal(createReusedDealPayload(deal, { durationMinutes: 30, publishImmediately: true }));
  };

  const handleCancelDeal = (dealId: string) => {
    setDeals(prev => prev.filter(d => d.id !== dealId));
  };

  const handleEditDeal = (deal: Deal) => {
    setPortalSuccessMessage('');
    setDealDraft(deal);
    setPortalFieldSnapshot(deal);
    setEditingDealId(deal.id);
    setBulkImportCandidates([]);
    setSelectedBulkImportIndex(0);
    setIsCreating(true);
  };

  const refreshSharedDeals = async () => {
    setDealsLoading(true);
    try {
      const sharedDeals = await fetchSharedDeals();
      const fallbackDeals = syncSharedOnlineDeals(readStoredDeals());
      const nextDeals = sharedDeals.length > 0 ? syncSharedOnlineDeals(sharedDeals) : fallbackDeals;
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
    try {
      await deleteDealFromBackend(deal.id);
      setDeals((prev) => prev.filter((item) => item.id !== deal.id));
    } catch {
      setDealsError('Could not delete the shared deal.');
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
    setCurrentView('my-claims');
  };

  const renderDealsErrorBanner = () => {
    if (dealsLoading || !dealsError) {
      return null;
    }

    const canRetryPublish = Boolean(lastSharedPublishFailure) && (hasAdminAccess || currentView === 'business-portal' || isAdminRoute);

    return (
      <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p>{dealsError}</p>
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
    if (LOCAL_ADMIN_MODE) {
      setRole('business');
      setSubscriptionStatus('active');
      setSubscriptionPlan(BUSINESS_PLAN_ID);
      setSubscriptionMessage('');
      setCurrentView('business-portal');
      return;
    }

    if (!session) {
      setAuthError('Sign in with Google to start business access.');
      setAuthModalOpen(true);
      return;
    }

    setSubscriptionMessage('');
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

    window.location.href = data.url;
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
    setCurrentView('catalog');
  };

  const renderLiveDeals = () => {
    const localDeals = deals.filter((deal) => deal.businessType !== 'online');
    const onlineDeals = deals.filter((deal) => deal.businessType === 'online');
    const dealsWithDistance = localDeals.map(deal => {
      const dist = getEffectiveLocalDealDistance(userLocation, deal);
      return { ...deal, computedDistanceValue: dist, computedDistanceLabel: formatDistance(dist) };
    });

    const activeLocalDeals = dealsWithDistance
      .filter(d =>
        d.expiresAt > Date.now() &&
        d.computedDistanceValue <= radius &&
        (selectedCategory === 'All' || d.category === selectedCategory)
      )
      .sort((a, b) => a.computedDistanceValue - b.computedDistanceValue);

    const trendingDeals = [...activeLocalDeals]
      .sort((a, b) => (b.claimCount ?? b.currentClaims) - (a.claimCount ?? a.currentClaims))
      .slice(0, 5);

    const endingSoonDeals = activeLocalDeals
      .filter(d => d.expiresAt - Date.now() <= 10 * 60 * 1000)
      .sort((a, b) => a.expiresAt - b.expiresAt);

    const justDroppedDeals = activeLocalDeals
      .filter(d => Date.now() - d.createdAt <= 45 * 60 * 1000)
      .sort((a, b) => b.createdAt - a.createdAt);

    const expiredLocalDeals = dealsWithDistance.filter(d => d.expiresAt <= Date.now());
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

    const filteredOnlineDeals = onlineDeals
      .filter((deal) => deal.expiresAt > Date.now() && (selectedCategory === 'All' || deal.category === selectedCategory))
      .sort((a, b) => b.createdAt - a.createdAt);

    const trendingOnlineDeals = [...filteredOnlineDeals]
      .sort((a, b) => (b.claimCount ?? b.currentClaims) - (a.claimCount ?? a.currentClaims))
      .slice(0, 5);

    const endingSoonOnlineDeals = filteredOnlineDeals
      .filter((deal) => deal.hasTimer !== false && deal.expiresAt - Date.now() <= 10 * 60 * 1000)
      .sort((a, b) => a.expiresAt - b.expiresAt);

    const justDroppedOnlineDeals = filteredOnlineDeals
      .filter((deal) => Date.now() - deal.createdAt <= 60 * 60 * 1000)
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

    const getOnlineDealHeroLabel = (offerText: string) => {
      const normalizedOffer = offerText.trim();
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
    const controlHeightClass = 'h-9';
    const controlRadiusClass = 'rounded-xl';
    const controlPaddingClass = 'px-2.5';
    const controlTextClass = 'text-[9px] font-black uppercase tracking-[0.12em]';

    return (
      <div className="space-y-4">
        {dealsLoading ? (
          <div className="rounded-[1.25rem] border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-[11px] font-semibold text-indigo-700">
            Loading live deals...
          </div>
        ) : null}

        {renderDealsErrorBanner()}

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

        <div className="grid grid-cols-2 gap-1.5 rounded-[1.25rem] bg-slate-100/90 p-1">
          {[
            { id: 'local', label: 'Local' },
            { id: 'online', label: 'Online' },
          ].map(option => (
            <button
              key={option.id}
              onClick={() => {
                setDropMode(option.id as typeof dropMode);
                setSelectedCategory('All');
                setSelectedFeedFilter('all');
              }}
              className={`inline-flex ${controlHeightClass} items-center justify-center gap-1.5 rounded-[1rem] ${controlPaddingClass} text-[10px] font-black transition-all ${
                dropMode === option.id
                  ? 'bg-white text-indigo-600 shadow-sm shadow-slate-200/50'
                  : 'bg-transparent text-slate-500'
              }`}
            >
              <AppIcon name={option.id === 'local' ? 'pin' : 'online'} size={16} />
              {option.label}
            </button>
          ))}
        </div>

        {/* Location & Radius Header */}
        {dropMode === 'local' ? (
          <div className="bg-white border border-slate-100 rounded-[1.45rem] p-3 shadow-sm shadow-slate-200/40 mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-xl ${locationStatus === 'success' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-400'}`}>
                  <AppIcon name="pin" size={18} className={locationStatus === 'loading' ? 'animate-spin' : ''} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Your Location</p>
                  <p className="text-[13px] font-semibold text-slate-700">
                    {locationStatus === 'loading' ? 'Locating...' : (cityName || 'San Francisco')}
                  </p>
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
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Search Radius</span>
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-[0.9rem]">
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
          <div className="bg-white border border-slate-100 rounded-[1.45rem] p-3 shadow-sm shadow-slate-200/40 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="rounded-[1rem] bg-indigo-50 p-2.5 text-indigo-600">
                <AppIcon name="online" size={18} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Online Drops</p>
                <p className="text-[13px] font-semibold text-slate-700">Discover limited-time online offers from digital stores.</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-0.5">
          <h2 className="text-[1.45rem] font-black tracking-[-0.035em] text-slate-900">{dropMode === 'local' ? 'Live Near You' : 'Online Drops'}</h2>
          <span className="bg-indigo-100/80 text-indigo-600 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-[0.14em]">
            {dropMode === 'local' ? filteredActiveLocalDeals.length : filteredOnlineDealsByTab.length} Drops
          </span>
        </div>

        <div className="overflow-x-auto pb-0.5 -mx-0.5">
          <div className="flex min-w-max items-center gap-1.5 px-1">
            {activeCategoryOptions.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`inline-flex ${controlHeightClass} items-center ${controlPaddingClass} ${controlRadiusClass} border ${controlTextClass} whitespace-nowrap transition-all ${
                  selectedCategory === category
                    ? 'border-indigo-100 bg-white text-indigo-600 shadow-sm shadow-slate-200/40'
                    : 'border-transparent bg-slate-50 text-slate-500 hover:text-slate-700'
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

        <div className="overflow-x-auto pb-0.5 -mx-0.5">
          <div className="flex min-w-max items-center gap-1.5 px-1">
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
                    : 'border-transparent bg-slate-50 text-slate-500 hover:text-slate-700'
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

        <section className="space-y-2">
          {dropMode === 'local' ? (
            filteredActiveLocalDeals.length > 0 ? (
              filteredActiveLocalDeals.map(deal => (
                <DealCard 
                  key={deal.id} 
                  deal={deal} 
                  onClaim={handleClaimDeal} 
                  isClaimed={claims.some(c => c.dealId === deal.id)}
                  computedDistance={deal.computedDistanceLabel}
                  onSaveToCatalog={handleSaveToCatalog}
                  canSaveToCatalog={canSaveDealToCatalog(deal)}
                  isSavedToCatalog={catalogCoupons.some(c => c.dealId === deal.id && c.status === 'active')}
                  saveFeedback={catalogSaveFeedback[deal.id]}
                  badges={getDealFeedTag(deal.id) ? [getDealFeedTag(deal.id)!] : []}
                />
              ))
            ) : (
              <div className="text-center py-10 bg-white rounded-[1.7rem] border border-dashed border-slate-200 shadow-sm shadow-slate-200/30">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-slate-50 text-slate-300">
                  <AppIcon name="alert" size={28} />
                </div>
                <p className="text-slate-500 font-semibold">
                  {selectedFeedFilter === 'all'
                    ? `No live deals within ${radius} miles.`
                    : `No ${selectedFeedFilter.replace('-', ' ')} deals within ${radius} miles.`}
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
            filteredOnlineDealsByTab.length > 0 ? (
            filteredOnlineDealsByTab.map((deal) => (
              <div key={deal.id} className="overflow-hidden rounded-[1.45rem] border border-slate-100 bg-white shadow-sm shadow-slate-200/40">
                  <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
                    {deal.imageUrl ? (
                      <img src={deal.imageUrl} alt={deal.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 text-slate-300">
                        <AppIcon name="online" size={28} />
                      </div>
                    )}
                    <div className="pointer-events-none absolute left-3 top-3">
                      <span className="inline-flex min-h-[34px] items-center rounded-[0.95rem] bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 px-3 py-1.5 text-[14px] font-black uppercase tracking-[0.08em] text-white shadow-[0_10px_24px_rgba(99,102,241,0.28)] ring-1 ring-white/30 backdrop-blur-sm">
                        {getOnlineDealHeroLabel(deal.offerText)}
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="mb-2 flex items-start justify-between gap-2.5">
                      <div>
                        {getOnlineDropTag(deal.id) ? (
                          <span className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-indigo-600">
                            <AppIcon name={getFeedTagIconName(getOnlineDropTag(deal.id)!)} size={11} />
                            {getOnlineDropTag(deal.id)}
                          </span>
                        ) : null}
                        <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-500">
                          <AppIcon name={getCategoryIconName(deal.category)} size={12} />
                          {getCategoryLabel(deal.category)}
                        </p>
                        <h3 className="mt-1 text-[1.02rem] font-extrabold leading-[1.2] text-slate-900">{deal.title}</h3>
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{deal.businessName}</p>
                      </div>
                      {deal.hasTimer ? <Timer expiresAt={deal.expiresAt} className="text-sm" /> : null}
                    </div>
                    <div className="mb-2 rounded-[0.95rem] border border-indigo-100 bg-indigo-50/80 px-3 py-2">
                      <p className="text-[1.02rem] font-black text-indigo-600">{deal.offerText}</p>
                    </div>
                    <p className="mb-3 text-[12px] leading-[1.55] text-slate-500">{deal.description}</p>
                    {isAdminRoute && showDebug ? (
                      <p className="mb-3 truncate rounded-[0.9rem] bg-slate-50 px-3 py-2 font-mono text-[10px] text-slate-400">
                        Link: {getDealExternalUrl(deal) ?? 'No link saved'}
                      </p>
                    ) : null}
                    <button
                      onClick={() => {
                        const externalUrl = getDealExternalUrl(deal);
                        if (!externalUrl) return;
                        console.info('[LiveDrop] Opening deal link', {
                          dealId: deal.id,
                          title: deal.title,
                          affiliateUrl: deal.affiliateUrl ?? null,
                          websiteUrl: deal.websiteUrl ?? null,
                          productUrl: deal.productUrl ?? null,
                          externalUrl,
                        });
                        window.open(externalUrl, '_blank', 'noopener,noreferrer');
                      }}
                      disabled={!getDealExternalUrl(deal)}
                      className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-[1rem] px-4 text-[13px] font-black text-white transition-all shadow-lg shadow-slate-200/50 ${
                        getDealExternalUrl(deal)
                          ? 'bg-slate-900 hover:bg-slate-800'
                          : 'bg-slate-300 cursor-not-allowed shadow-none'
                      }`}
                    >
                      <AppIcon name="external" size={16} />
                      View Deal
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 bg-white rounded-[1.7rem] border border-dashed border-slate-200 shadow-sm shadow-slate-200/30">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-slate-50 text-slate-300">
                  <AppIcon name="alert" size={28} />
                </div>
                <p className="text-slate-500 font-semibold">
                  {selectedFeedFilter === 'all'
                    ? 'No online drops in this category right now.'
                    : `No ${selectedFeedFilter.replace('-', ' ')} online drops right now.`}
                </p>
                <p className="text-slate-300 text-xs mt-1.5">Try another tab or category and check back soon.</p>
              </div>
            )
          )}
        </section>

        {dropMode === 'local' && expiredLocalDeals.length > 0 && (
          <div className="pt-8">
            <h3 className="text-slate-300 text-[10px] font-black uppercase tracking-[0.2em] mb-6 text-center">Recently Expired</h3>
            <div className="opacity-40 grayscale pointer-events-none space-y-4">
              {expiredLocalDeals.slice(0, 2).map(deal => (
                <DealCard key={deal.id} deal={deal} onClaim={() => {}} computedDistance={deal.computedDistanceLabel} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMyClaims = () => {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-black mb-6 text-slate-900">My Claims</h2>
        
        {claims.length > 0 ? (
          <div className="space-y-4">
            {claims.map(claim => {
              const isExpired = claim.expiresAt <= Date.now() && claim.status === 'active';
              const displayStatus = isExpired ? 'expired' : claim.status;

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
            })}
          </div>
        ) : (
          <div className="text-center py-24">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-slate-50 text-slate-200">
              <AppIcon name="claims" size={36} />
            </div>
            <p className="text-slate-400 font-bold">You haven't claimed any deals yet.</p>
            <button 
              onClick={() => setCurrentView('live-deals')}
              className="mt-6 text-indigo-600 font-black text-xs uppercase tracking-[0.2em] hover:tracking-[0.3em] transition-all"
            >
              Go Find Deals
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderCatalog = () => {
    const activeCoupons = catalogCoupons.filter(coupon => coupon.status === 'active');
    const redeemedCoupons = catalogCoupons.filter(coupon => coupon.status === 'redeemed');
    const expiredCoupons = catalogCoupons.filter(coupon => coupon.status === 'expired');

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
          <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-slate-200">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.75rem] bg-slate-50 text-slate-300">
              <AppIcon name="catalog" size={28} />
            </div>
            <p className="text-slate-400 font-bold">No saved coupons in your Catalog yet.</p>
            <p className="text-slate-300 text-xs mt-1">Save eligible deals to keep them for later.</p>
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
      const generatedFieldRows = [
        { label: 'Business Name', value: previewDeal?.businessName ?? '' },
        { label: 'Deal Title', value: previewDeal?.title ?? '' },
        { label: 'Description', value: previewDeal?.description ?? '' },
        { label: 'Category', value: previewDeal?.category ?? '' },
        { label: 'Deal / Discount Text', value: previewDeal?.offerText ?? '' },
        { label: 'Website URL', value: previewDeal?.websiteUrl ?? '' },
        { label: 'Product Link', value: previewDeal?.productUrl ?? previewDeal?.productLink ?? previewDeal?.affiliateUrl ?? '' },
        { label: 'Image URL', value: previewDeal?.imageUrl ?? '' },
      ];
      const portalCoverageSource = portalFieldSnapshot;
      const portalCoverage = buildPortalFieldCoverage(portalCoverageSource);
      const filledFields = portalCoverage.filled;
      const requiredMissingFields = portalCoverage.missingRequired;
      const optionalMissingFields = portalCoverage.missingOptional;
      const completionPercent = portalCoverage.completionPercent;
      const normalizedJson = aiFinderResult?.generatedJson || (previewDeal ? JSON.stringify(previewDeal, null, 2) : '');
      const priceText = formatFinderPrice(previewDeal?.price);
      const originalPriceText = formatFinderPrice(previewDeal?.originalPrice);
      const hasAcceptedUrl = Boolean(aiFinderDirectUrl);
      const hasMappedBasicFields = Boolean(previewDeal?.websiteUrl || previewDeal?.productUrl || previewDeal?.businessName);
      const extractionSucceeded = aiFinderResult?.extractionStatus === 'Extraction succeeded';
      const extractionFailed = aiFinderResult?.extractionStatus === 'Extraction failed';
      const canGenerateCoupon = Boolean(aiFinderDirectUrl);
      const canFillPortal = Boolean(aiFinderResult?.generatedJson);
      const portalMappingReady = filledFields.length > 0;
      const portalMappingSucceeded = portalMappingReady && requiredMissingFields.length === 0;
      const requiredFilledCount = portalCoverage.required.filter((field) => field.filled).length;
      const optionalFilledCount = portalCoverage.optional.filter((field) => field.filled).length;
      const stageCards = [
        {
          key: 'extract',
          label: 'Stage 1',
          title: 'Extract',
          status: extractionSucceeded ? 'Ready' : extractionFailed ? 'Partial' : hasAcceptedUrl ? 'Pending' : 'Awaiting URL',
          tone: extractionSucceeded ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : extractionFailed ? 'bg-amber-100 text-amber-700 border-amber-200' : hasAcceptedUrl ? 'bg-sky-100 text-sky-700 border-sky-200' : 'bg-slate-100 text-slate-600 border-slate-200',
        },
        {
          key: 'normalize',
          label: 'Stage 2',
          title: 'Normalize',
          status: aiFinderResult?.generatedJson ? 'Ready' : aiFinderResult?.normalizedDeal ? 'Preview Ready' : 'Pending',
          tone: aiFinderResult?.generatedJson ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : aiFinderResult?.normalizedDeal ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-600 border-slate-200',
        },
        {
          key: 'map',
          label: 'Stage 3',
          title: 'Map to Portal',
          status: portalMappingSucceeded ? 'Ready' : portalMappingReady ? 'Partial' : 'Pending',
          tone: portalMappingSucceeded ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : portalMappingReady ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200',
        },
      ];

      return (
        <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Direct Deal Intake</p>
              <h3 className="mt-1 text-lg font-black text-slate-900">Paste a product URL, extract product data, generate coupon fields, then fill the portal</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">Tavily search is disabled for now. This admin tool uses a direct product URL only, keeps the cleaned product link and merchant even when extraction fails, and lets you review the result before it touches the portal.</p>
            </div>
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

          <div className="mt-5 rounded-[1.5rem] border border-slate-100 bg-slate-50/60 p-4">
            <label className="block">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Product URL</span>
              <input
                ref={aiFinderUrlInputRef}
                type="url"
                value={aiFinderUrl}
                onChange={(event) => setAiFinderUrl(event.target.value)}
                placeholder="https://www.amazon.com/... or another product page"
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50"
              />
              <p className="mt-2 text-xs leading-5 text-slate-400">Direct URL only. The app will always keep the cleaned link, merchant, and website domain even if deeper extraction fails.</p>
            </label>

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
                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950">
                  <div className="border-b border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Normalized Deal JSON
                  </div>
                  <pre className="max-h-[360px] overflow-auto px-4 py-4 text-xs leading-6 text-slate-200">{normalizedJson}</pre>
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
                        <p className="font-black uppercase tracking-[0.08em] text-slate-500">Product Link</p>
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
                        <p className="font-black uppercase tracking-[0.08em] text-slate-500">Product Link</p>
                        <p className="mt-1 break-all leading-5 text-slate-700">{sourceAssets?.productUrl ?? previewDeal?.productUrl ?? 'Missing source asset'}</p>
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
                        onClick={() => window.open(candidate.productLink ?? candidate.url, '_blank', 'noopener,noreferrer')}
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                      >
                        Open Source
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const copyResult = await copyTextToClipboard(candidate.productLink ?? candidate.url);
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
            Missing source asset: {!sourceAssets?.productUrl ? 'product link' : 'image'} could not be extracted yet.
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
                      <p className="font-black uppercase tracking-[0.08em] text-slate-500">Product Link</p>
                      <p className="mt-1 break-all leading-5 text-slate-700">{sourceAssets?.productUrl ?? 'Missing source asset'}</p>
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
            <CreateDealForm
              onSubmit={handleCreateDeal}
              onCancel={() => {
                setIsCreating(false);
                setDealDraft(null);
                setPortalFieldSnapshot(null);
                setPortalAutofillRequest(null);
                setBulkImportCandidates([]);
                setSelectedBulkImportIndex(0);
              }}
              userLocation={userLocation}
              initialData={dealDraft}
              onDraftChange={setPortalFieldSnapshot}
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

    if (!session) {
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

    if (!hasPortalAccess) {
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
          <CreateDealForm 
            onSubmit={handleCreateDeal} 
            onCancel={() => {
              setIsCreating(false);
              setDealDraft(null);
              setPortalFieldSnapshot(null);
              setPortalAutofillRequest(null);
              setBulkImportCandidates([]);
              setSelectedBulkImportIndex(0);
            }} 
            userLocation={userLocation}
            initialData={dealDraft}
            onDraftChange={setPortalFieldSnapshot}
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

    if (isCreating) {
      return (
        <div className="min-h-screen bg-slate-50 px-3 py-4 text-slate-900">
          <div className="mx-auto max-w-[430px] space-y-4">
            <div className="flex items-center justify-between rounded-[1.75rem] border border-slate-100 bg-white px-4 py-3 shadow-sm">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Admin</p>
                <p className="text-sm font-semibold text-slate-500">Internal deal editor</p>
              </div>
              <div className="flex items-center gap-2">
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
            {renderImportedDraftSwitcher()}
            <CreateDealForm
              onSubmit={handleCreateDeal}
              onCancel={() => {
                setIsCreating(false);
                setDealDraft(null);
                setPortalFieldSnapshot(null);
                setPortalAutofillRequest(null);
                setEditingDealId(null);
                setBulkImportCandidates([]);
                setSelectedBulkImportIndex(0);
              }}
              userLocation={userLocation}
              initialData={dealDraft}
              onDraftChange={setPortalFieldSnapshot}
              autofillRequest={portalAutofillRequest}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 px-3 py-4 text-slate-900">
        <div className="mx-auto max-w-[430px] space-y-4">
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
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void refreshSharedDeals()}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
                >
                  Force Refresh
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
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Backend Logs</p>
                <h2 className="mt-1 text-lg font-black text-slate-900">Shared backend activity</h2>
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{adminLogs.length} entries</span>
            </div>
            <div className="mt-4 space-y-2">
              {adminLogs.length > 0 ? adminLogs.map((entry) => (
                <div key={entry.id} className={`rounded-xl border px-3 py-3 ${entry.level === 'error' ? 'border-rose-100 bg-rose-50' : 'border-slate-100 bg-slate-50'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className={`text-sm font-semibold ${entry.level === 'error' ? 'text-rose-600' : 'text-slate-700'}`}>{entry.message}</p>
                    <span className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  </div>
                  {entry.detail ? (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-white/80 px-3 py-2 text-[11px] leading-5 text-slate-600">
                      {entry.detail}
                    </pre>
                  ) : null}
                </div>
              )) : (
                <p className="text-sm text-slate-400">No backend logs yet.</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {managedDeals.map((deal) => (
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
        </div>
      </div>
    );
  };

  const renderPublicShell = () => (
    <Layout
      currentView={currentView}
      onViewChange={(view) => {
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
      onOpenAuth={() => {
        setAuthError('');
        setAuthInfo('');
        setAuthModalOpen(true);
      }}
      onSignOut={handleSignOut}
    >
      {currentView === 'live-deals' && renderLiveDeals()}
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
