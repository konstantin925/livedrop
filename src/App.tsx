/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { DealCard } from './components/DealCard';
import { ClaimModal } from './components/ClaimModal';
import { CreateDealForm } from './components/CreateDealForm';
import { Deal, Claim, View, UserLocation, CatalogCoupon, AppNotification, UserRole } from './types';
import { CATEGORY_OPTIONS, DEFAULT_LOCATION } from './constants';
import { Timer } from './components/Timer';
import { Ticket, CheckCircle, Trash2, Plus, AlertCircle, Navigation, RefreshCw, Terminal, Bookmark, Percent } from 'lucide-react';
import { calculateDistance, formatDistance } from './utils/distance';
import { generateSeededDeals } from './utils/seed';
import { formatDateTime } from './utils/time';
import { copyTextToClipboard, ClipboardCopyResult } from './utils/clipboard';
import { getCategoryLabel } from './utils/categories';
import { canSaveDealToCatalog, createCatalogCouponFromDeal, refreshCatalogCoupons } from './utils/catalog';
import { CompanyLogo } from './components/CompanyLogo';
import { ToastStack } from './components/ToastStack';

const DEALS_STORAGE_KEY = 'livedrop_deals';
const CLAIMS_STORAGE_KEY = 'livedrop_claims';
const CATALOG_STORAGE_KEY = 'livedrop_catalog';
const NOTIFICATIONS_STORAGE_KEY = 'livedrop_notifications';
const ROLE_STORAGE_KEY = 'livedrop_user_role';
const RADIUS_OPTIONS = [1, 3, 5, 10, 25];

const readStoredDeals = (): Deal[] => {
  try {
    const raw = localStorage.getItem(DEALS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((deal) => ({
          ...deal,
          currentClaims: deal.currentClaims ?? deal.claimCount ?? 0,
          claimCount: deal.claimCount ?? deal.currentClaims ?? 0,
          createdAt: deal.createdAt ?? Date.now(),
          expiresAt: deal.expiresAt ?? Date.now(),
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readStoredRole = (): UserRole => {
  try {
    const raw = localStorage.getItem(ROLE_STORAGE_KEY);
    return raw === 'business' ? 'business' : 'customer';
  } catch {
    return 'customer';
  }
};

const getDistanceForDeal = (location: UserLocation, deal: Deal) =>
  calculateDistance(location.lat, location.lng, deal.lat, deal.lng);

const getRadiusForDeal = (location: UserLocation, deal: Deal) => {
  const distance = getDistanceForDeal(location, deal);
  return RADIUS_OPTIONS.find(option => distance <= option) ?? RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1];
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

  // Load data from localStorage or use seeded data
  useEffect(() => {
    const savedDeals = readStoredDeals();
    const savedClaims = readStoredClaims();
    const savedCatalog = readStoredCatalog();
    const savedNotifications = readStoredNotifications();
    const savedRole = readStoredRole();

    if (savedDeals.length > 0) {
      setDeals(savedDeals);
      seenDealIdsRef.current = new Set(savedDeals.map((deal) => deal.id));
    }

    setRole(savedRole);
    setClaims(savedClaims);
    setNotifications(savedNotifications);
    const refreshedCatalog = refreshCatalogCoupons(savedCatalog);
    setCatalogCoupons(refreshedCatalog.coupons);
    setCatalogDropWarnings(refreshedCatalog.droppedIds);
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
          const seeded = generateSeededDeals(newLocation);
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
        message: '📉 Your saved deal dropped in value',
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

      const distance = calculateDistance(userLocation.lat, userLocation.lng, deal.lat, deal.lng);
      if (deal.expiresAt > Date.now() && distance <= radius) {
        pushNotification({
          message: `🔥 New deal nearby: ${deal.title}`,
          type: 'new_deal',
          dealId: deal.id,
        });
      }
    });

    seenDealIdsRef.current = nextSeenIds;
  }, [deals, radius, userLocation.lat, userLocation.lng]);

  useEffect(() => {
    deals.forEach((deal) => {
      const distance = calculateDistance(userLocation.lat, userLocation.lng, deal.lat, deal.lng);
      const isVisible = deal.expiresAt > Date.now() && distance <= radius;
      const isEndingSoon = isVisible && deal.expiresAt - Date.now() <= 5 * 60 * 1000;

      if (isEndingSoon) {
        pushNotification({
          message: `⏳ Hurry! ${deal.title} is ending soon`,
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
    setRadius(prev => Math.max(prev, getRadiusForDeal(userLocation, newDeal)));
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

    setNotifications((prev) => {
      const exists = prev.some((item) =>
        item.type === payload.type &&
        item.message === payload.message &&
        item.dealId === payload.dealId &&
        item.couponId === payload.couponId
      );

      if (exists) return prev;

      created = {
        ...payload,
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

  const handleStartBusinessAccount = () => {
    setRole('business');
    setCurrentView('business-portal');
  };

  const renderLiveDeals = () => {
    // Calculate distances and filter by radius
    const dealsWithDistance = deals.map(deal => {
      const dist = calculateDistance(userLocation.lat, userLocation.lng, deal.lat, deal.lng);
      return { ...deal, computedDistanceValue: dist, computedDistanceLabel: formatDistance(dist) };
    });

    const activeDeals = dealsWithDistance
      .filter(d =>
        d.expiresAt > Date.now() &&
        d.computedDistanceValue <= radius &&
        (selectedCategory === 'All' || d.category === selectedCategory)
      )
      .sort((a, b) => a.computedDistanceValue - b.computedDistanceValue);

    const trendingDeals = [...activeDeals]
      .sort((a, b) => (b.claimCount ?? b.currentClaims) - (a.claimCount ?? a.currentClaims))
      .slice(0, 5);

    const endingSoonDeals = activeDeals
      .filter(d => d.expiresAt - Date.now() <= 10 * 60 * 1000)
      .sort((a, b) => a.expiresAt - b.expiresAt);

    const justDroppedDeals = activeDeals
      .filter(d => Date.now() - d.createdAt <= 45 * 60 * 1000)
      .sort((a, b) => b.createdAt - a.createdAt);

    const expiredDeals = dealsWithDistance.filter(d => d.expiresAt <= Date.now());
    const trendingIds = new Set(trendingDeals.map(deal => deal.id));
    const endingSoonIds = new Set(endingSoonDeals.map(deal => deal.id));
    const justDroppedIds = new Set(justDroppedDeals.map(deal => deal.id));

    const getDealFeedTag = (dealId: string): 'Trending' | 'Ending Soon' | 'Just Dropped' | null => {
      if (trendingIds.has(dealId)) return 'Trending';
      if (endingSoonIds.has(dealId)) return 'Ending Soon';
      if (justDroppedIds.has(dealId)) return 'Just Dropped';
      return null;
    };

    const filteredActiveDeals = activeDeals.filter((deal) => {
      const dealTag = getDealFeedTag(deal.id);
      if (selectedFeedFilter === 'trending') return dealTag === 'Trending';
      if (selectedFeedFilter === 'ending-soon') return dealTag === 'Ending Soon';
      if (selectedFeedFilter === 'just-dropped') return dealTag === 'Just Dropped';
      return true;
    });

    return (
      <div className="space-y-6">
        {/* Developer Debug Section */}
        {showDebug && (
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-2xl mb-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Terminal size={60} />
            </div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400">Developer Debug</h3>
                <button onClick={() => setShowDebug(false)} className="text-[10px] font-black uppercase text-white/40 hover:text-white">Hide</button>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-[8px] font-black uppercase text-white/40 mb-1">User Lat/Lng</p>
                  <p className="font-mono text-[10px] font-bold">{userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-[8px] font-black uppercase text-white/40 mb-1">Total Deals</p>
                  <p className="font-mono text-xs font-bold">{deals.length}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-[8px] font-black uppercase text-white/40 mb-1">Active Deals</p>
                  <p className="font-mono text-xs font-bold">{deals.filter(d => d.expiresAt > Date.now()).length}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                  <p className="text-[8px] font-black uppercase text-white/40 mb-1">Visible (in {radius}mi)</p>
                  <p className="font-mono text-xs font-bold text-indigo-400">{activeDeals.length}</p>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    localStorage.removeItem(DEALS_STORAGE_KEY);
                    const seeded = generateSeededDeals(userLocation);
                    setDeals(seeded);
                  }}
                  className="flex-1 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-[8px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw size={12} />
                  Reset & Re-seed Near Me
                </button>
              </div>
              
              <p className="text-[8px] text-white/30 italic mt-3">Deals are sorted by nearest first.</p>
            </div>
          </div>
        )}

        {/* Location & Radius Header */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-5 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-xl ${locationStatus === 'success' ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-50 text-slate-400'}`}>
                <Navigation size={18} className={locationStatus === 'loading' ? 'animate-spin' : ''} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Your Location</p>
                <p className="text-xs font-bold text-slate-700">
                  {locationStatus === 'loading' ? 'Locating...' : (cityName || 'San Francisco')}
                </p>
              </div>
            </div>
            <button 
              onClick={fetchLocation}
              className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
              title="Refresh Location"
            >
              <RefreshCw size={18} />
            </button>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-50">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Search Radius</span>
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl">
              {RADIUS_OPTIONS.map(r => (
                <button
                  key={r}
                  onClick={() => setRadius(r)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${radius === r ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  {r}mi
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-black text-slate-900">Live Near You</h2>
          <span className="bg-indigo-100 text-indigo-600 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider animate-pulse">
            {activeDeals.length} Drops
          </span>
        </div>

        <div className="overflow-x-auto pb-1 -mx-1">
          <div className="flex min-w-max items-center gap-2 px-1">
            {CATEGORY_OPTIONS.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                  selectedCategory === category
                    ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100'
                    : 'bg-slate-50 text-slate-400 hover:text-slate-600'
                }`}
              >
                {category === 'All' ? category : getCategoryLabel(category)}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto pb-1 -mx-1">
          <div className="flex min-w-max items-center gap-2 px-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'trending', label: 'Trending' },
              { id: 'ending-soon', label: 'Ending Soon' },
              { id: 'just-dropped', label: 'Just Dropped' },
            ].map(filter => (
              <button
                key={filter.id}
                onClick={() => setSelectedFeedFilter(filter.id as typeof selectedFeedFilter)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${
                  selectedFeedFilter === filter.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-500 hover:text-slate-700'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <section className="space-y-4">
          {filteredActiveDeals.length > 0 ? (
            filteredActiveDeals.map(deal => (
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
            <div className="text-center py-16 bg-white rounded-[2.5rem] border border-dashed border-slate-200">
              <AlertCircle className="mx-auto text-slate-200 mb-4" size={56} />
              <p className="text-slate-400 font-bold">
                {selectedFeedFilter === 'all'
                  ? `No live deals within ${radius} miles.`
                  : `No ${selectedFeedFilter.replace('-', ' ')} deals within ${radius} miles.`}
              </p>
              <p className="text-slate-300 text-xs mt-1">Try changing filters or check back later!</p>
              <button 
                onClick={() => {
                  if (selectedFeedFilter !== 'all') {
                    setSelectedFeedFilter('all');
                    return;
                  }
                  const nextRadius = RADIUS_OPTIONS.find(option => option > radius) ?? RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1];
                  setRadius(nextRadius);
                }}
                className="mt-6 text-indigo-600 font-black text-xs uppercase tracking-[0.2em] hover:tracking-[0.3em] transition-all"
              >
                {selectedFeedFilter === 'all' ? 'Expand Search' : 'Show All Deals'}
              </button>
            </div>
          )}
        </section>

        {expiredDeals.length > 0 && (
          <div className="pt-8">
            <h3 className="text-slate-300 text-[10px] font-black uppercase tracking-[0.2em] mb-6 text-center">Recently Expired</h3>
            <div className="opacity-40 grayscale pointer-events-none space-y-4">
              {expiredDeals.slice(0, 2).map(deal => (
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
                      Copy Code
                    </button>
                  </div>

                  {displayStatus === 'active' && (
                    <button 
                      onClick={() => handleRedeemClaim(claim.id)}
                      className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
                    >
                      <CheckCircle size={18} />
                      MARK AS REDEEMED
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-24">
            <Ticket className="mx-auto text-slate-100 mb-6" size={80} />
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
            <RefreshCw size={18} />
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
                        {getCategoryLabel(coupon.category)}
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
                  <Percent size={18} />
                  REDEEM FROM CATALOG
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-[2.5rem] border border-dashed border-slate-200">
            <Bookmark className="mx-auto text-slate-200 mb-4" size={56} />
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
    if (role !== 'business') {
      return (
        <div className="space-y-8">
          <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm text-center">
            <div className="mx-auto w-16 h-16 rounded-3xl bg-indigo-50 flex items-center justify-center mb-6">
              <Plus className="text-indigo-600" size={28} />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-3">Own a business?</h2>
            <p className="text-slate-500 leading-relaxed mb-8">
              Create live deals and attract customers instantly.
            </p>
            <button
              onClick={handleStartBusinessAccount}
              className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all"
            >
              Start Business Account
            </button>
          </div>
        </div>
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
            <Plus size={24} />
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
                      <Trash2 size={20} />
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
          <Plus size={24} />
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

          setCurrentView(view);
        }}
        activeCatalogCount={catalogCoupons.filter(coupon => coupon.status === 'active').length}
        notifications={notifications}
        notificationsOpen={notificationsOpen}
        unreadNotificationCount={notifications.filter((item) => !item.read).length}
        onToggleNotifications={toggleNotifications}
        role={role}
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
    </>
  );
}
