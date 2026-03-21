/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
import { getAuthRedirectUrl, hasSupabaseConfig, supabase } from './lib/supabase';
import { emptyCloudAppState, mergeCloudState } from './utils/cloudState';
import { AppIcon } from './components/AppIcon';

const DEALS_STORAGE_KEY = 'livedrop_deals';
const CLAIMS_STORAGE_KEY = 'livedrop_claims';
const CATALOG_STORAGE_KEY = 'livedrop_catalog';
const NOTIFICATIONS_STORAGE_KEY = 'livedrop_notifications';
const ROLE_STORAGE_KEY = 'livedrop_user_role';
const RADIUS_OPTIONS = [1, 3, 5, 10, 25];
const LOCAL_ADMIN_MODE = true;

const USER_PROFILE_TABLE = 'profiles';
const USER_STATE_TABLE = 'user_app_state';
const BUSINESS_PLAN_ID = 'business_monthly';

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

const mergeMissingSeededOnlineDeals = (existingDeals: Deal[]): Deal[] => {
  const seededOnlineDeals = generateSeededOnlineDeals();
  const existingIds = new Set(existingDeals.map((deal) => deal.id));
  const missingSeededOnlineDeals = seededOnlineDeals.filter((deal) => !existingIds.has(deal.id));

  return missingSeededOnlineDeals.length > 0
    ? [...missingSeededOnlineDeals, ...existingDeals]
    : existingDeals;
};

export default function App() {
  const [currentView, setCurrentView] = useState<View>('live-deals');
  const [role, setRole] = useState<UserRole>('customer');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [catalogCoupons, setCatalogCoupons] = useState<CatalogCoupon[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation>(DEFAULT_LOCATION);
  const [radius, setRadius] = useState<number>(5);
  const [dropMode, setDropMode] = useState<'local' | 'online'>('local');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedFeedFilter, setSelectedFeedFilter] = useState<'all' | 'trending' | 'ending-soon' | 'just-dropped'>('all');
  const [locationStatus, setLocationStatus] = useState<'loading' | 'success' | 'denied' | 'error'>('loading');
  const [cityName, setCityName] = useState<string>('');
  const [showDebug, setShowDebug] = useState(true);
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
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>(LOCAL_ADMIN_MODE ? 'active' : 'inactive');
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null);
  const [subscriptionMessage, setSubscriptionMessage] = useState('');
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const cloudHydratedRef = useRef(false);
  const isBusinessSubscribed = role === 'business' && subscriptionStatus === 'active';
  const hasPortalAccess = LOCAL_ADMIN_MODE || isBusinessSubscribed;

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

  // Load data from localStorage or use seeded data
  useEffect(() => {
    const savedDeals = readStoredDeals();
    const savedClaims = readStoredClaims();
    const savedCatalog = readStoredCatalog();
    const savedNotifications = readStoredNotifications();
    const savedRole = readStoredRole();

    if (savedDeals.length > 0) {
      const hydratedDeals = mergeMissingSeededOnlineDeals(savedDeals);

      setDeals(hydratedDeals);
      seenDealIdsRef.current = new Set(hydratedDeals.map((deal) => deal.id));
    }

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
          const seeded = [...generateSeededDeals(newLocation), ...generateSeededOnlineDeals()];
          setDeals(seeded);
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
      const preservedOnlineDeals = prevDeals.filter((deal) => deal.businessType === 'online');
      const nextDeals = [...refreshedLocalDeals, ...preservedOnlineDeals];
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

  const handleCreateDeal = (dealData: Omit<Deal, 'id' | 'createdAt' | 'currentClaims'>) => {
    const newDeal: Deal = {
      ...dealData,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: Date.now(),
      currentClaims: 0,
      claimCount: 0
    };

    setDeals(prev => [newDeal, ...prev]);
    if (newDeal.businessType !== 'online') {
      setRadius(prev => Math.max(prev, getRadiusForDeal(userLocation, newDeal)));
      setDropMode('local');
    } else {
      setDropMode('online');
    }
    setPortalSuccessMessage('Your deal is live');
    setIsCreating(false);
    setCurrentView('live-deals');
  };

  const handleCancelDeal = (dealId: string) => {
    setDeals(prev => prev.filter(d => d.id !== dealId));
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
      setAuthError('Supabase is not configured yet. Add your project URL and anon key first.');
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
    if (!supabase) {
      setAuthError('Supabase is not configured yet. Add your project URL and anon key first.');
      return;
    }

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

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
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
        email: email.trim(),
        password,
      });

      if (error) {
        setAuthError(error.message);
        setAuthLoading(false);
        return;
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Email authentication failed.');
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAuthLoading(false);
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

    const activeCategoryOptions = dropMode === 'local' ? CATEGORY_OPTIONS : ONLINE_CATEGORY_OPTIONS;
    const controlHeightClass = 'h-9';
    const controlRadiusClass = 'rounded-xl';
    const controlPaddingClass = 'px-2.5';
    const controlTextClass = 'text-[9px] font-black uppercase tracking-[0.12em]';

    return (
      <div className="space-y-4">
        {/* Developer Debug Section */}
        {showDebug && dropMode === 'local' && (
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
                  <div className="aspect-[16/10] overflow-hidden bg-slate-100">
                    {deal.imageUrl ? (
                      <img src={deal.imageUrl} alt={deal.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 text-slate-300">
                        <AppIcon name="online" size={28} />
                      </div>
                    )}
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
                    <button
                      onClick={() => {
                        const externalUrl = deal.productUrl ?? deal.websiteUrl;
                        if (!externalUrl) return;
                        window.open(externalUrl, '_blank', 'noopener,noreferrer');
                      }}
                      disabled={!deal.productUrl && !deal.websiteUrl}
                      className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-[1rem] px-4 text-[13px] font-black text-white transition-all shadow-lg shadow-slate-200/50 ${
                        deal.productUrl || deal.websiteUrl
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

  const renderBusinessPortal = () => {
    if (LOCAL_ADMIN_MODE) {
      if (isCreating) {
        return (
          <CreateDealForm
            onSubmit={handleCreateDeal}
            onCancel={() => setIsCreating(false)}
            userLocation={userLocation}
          />
        );
      }

      return (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-900">Business Portal</h2>
              {portalSuccessMessage ? (
                <p className="text-sm font-semibold text-emerald-600 mt-2">{portalSuccessMessage}</p>
              ) : null}
            </div>
            <button
              onClick={() => {
                setPortalSuccessMessage('');
                setIsCreating(true);
              }}
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
                  <div key={deal.id} className="bg-slate-50 border border-slate-100 rounded-3xl p-5">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <CompanyLogo businessName={deal.businessName} logoUrl={deal.logoUrl} category={deal.category} size={40} />
                        <div className="min-w-0">
                          <h4 className="text-slate-900 font-bold">{deal.title}</h4>
                          <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider">{deal.businessName}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <Timer expiresAt={deal.expiresAt} className="text-xs" />
                        <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-full mt-2 ${deal.expiresAt > Date.now() ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                          {deal.expiresAt > Date.now() ? 'Active' : 'Expired'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-5 pt-5 border-t border-slate-200/50">
                      <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                          <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest">Claims</span>
                          <span className="text-lg font-mono font-black text-slate-900">{deal.claimCount ?? deal.currentClaims}/{deal.maxClaims}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancelDeal(deal.id)}
                        className="text-slate-300 hover:text-rose-500 transition-colors p-2"
                      >
                        <AppIcon name="trash" size={20} />
                      </button>
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
            onClick={() => {
              setPortalSuccessMessage('');
              setIsCreating(true);
            }}
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
        <CreateDealForm 
          onSubmit={handleCreateDeal} 
          onCancel={() => setIsCreating(false)} 
          userLocation={userLocation}
        />
      );
    }

    return (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Business Portal</h2>
            {portalSuccessMessage ? (
              <p className="text-sm font-semibold text-emerald-600 mt-2">{portalSuccessMessage}</p>
            ) : null}
          </div>
          <button 
            onClick={() => {
              setPortalSuccessMessage('');
              setIsCreating(true);
            }}
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
                <div key={deal.id} className="bg-slate-50 border border-slate-100 rounded-3xl p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <CompanyLogo businessName={deal.businessName} logoUrl={deal.logoUrl} category={deal.category} size={40} />
                      <div className="min-w-0">
                        <h4 className="text-slate-900 font-bold">{deal.title}</h4>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider">{deal.businessName}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <Timer expiresAt={deal.expiresAt} className="text-xs" />
                      <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-full mt-2 ${deal.expiresAt > Date.now() ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                        {deal.expiresAt > Date.now() ? 'Active' : 'Expired'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-5 pt-5 border-t border-slate-200/50">
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col">
                        <span className="text-[8px] text-slate-400 font-black uppercase tracking-widest">Claims</span>
                        <span className="text-lg font-mono font-black text-slate-900">{deal.claimCount ?? deal.currentClaims}/{deal.maxClaims}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleCancelDeal(deal.id)}
                      className="text-slate-300 hover:text-rose-500 transition-colors p-2"
                    >
                      <AppIcon name="trash" size={20} />
                    </button>
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
          onClick={() => {
            setPortalSuccessMessage('');
            setIsCreating(true);
          }}
          className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-lg flex items-center justify-center gap-3 shadow-2xl shadow-slate-200 hover:bg-slate-800 transition-all"
        >
          <AppIcon name="plus" size={24} />
          CREATE NEW DROP
        </button>
      </div>
    );
  };

  return (
    <>
      <ToastStack notifications={toastNotifications} />
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
    </>
  );
}
