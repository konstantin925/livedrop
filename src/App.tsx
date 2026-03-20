/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { DealCard } from './components/DealCard';
import { ClaimModal } from './components/ClaimModal';
import { CreateDealForm } from './components/CreateDealForm';
import { Deal, Claim, View, UserLocation } from './types';
import { DEFAULT_LOCATION } from './constants';
import { Timer } from './components/Timer';
import { Ticket, Clock, CheckCircle, Trash2, Plus, AlertCircle, MapPin, Navigation, RefreshCw, ChevronDown, Terminal } from 'lucide-react';
import { calculateDistance, formatDistance } from './utils/distance';
import { generateSeededDeals } from './utils/seed';
import { formatDateTime } from './utils/time';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('live-deals');
  const [deals, setDeals] = useState<Deal[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation>(DEFAULT_LOCATION);
  const [radius, setRadius] = useState<number>(5);
  const [locationStatus, setLocationStatus] = useState<'loading' | 'success' | 'denied' | 'error'>('loading');
  const [cityName, setCityName] = useState<string>('');
  const [showDebug, setShowDebug] = useState(true);

  // Load data from localStorage or use seeded data
  useEffect(() => {
    const savedDeals = localStorage.getItem('livedrop_deals');
    const savedClaims = localStorage.getItem('livedrop_claims');

    if (savedDeals) {
      try {
        const parsedDeals = JSON.parse(savedDeals);
        if (parsedDeals.length > 0) {
          setDeals(parsedDeals);
        } else {
          // If empty, we'll wait for location to seed
        }
      } catch (e) {
        // Error parsing, will seed later
      }
    }

    if (savedClaims) {
      try {
        setClaims(JSON.parse(savedClaims));
      } catch (e) {
        setClaims([]);
      }
    }
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
        const savedDeals = localStorage.getItem('livedrop_deals');
        if (!savedDeals || JSON.parse(savedDeals).length === 0) {
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

  // Save data to localStorage whenever it changes
  useEffect(() => {
    // Only save if we have initialized (deals is not empty or we explicitly set it)
    if (deals.length > 0 || localStorage.getItem('livedrop_deals')) {
      localStorage.setItem('livedrop_deals', JSON.stringify(deals));
    }
    localStorage.setItem('livedrop_claims', JSON.stringify(claims));
  }, [deals, claims]);

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
    const newClaim: Claim = {
      id: Math.random().toString(36).substr(2, 9),
      dealId: deal.id,
      dealTitle: deal.title,
      businessName: deal.businessName,
      claimCode: Math.random().toString(36).substr(2, 6).toUpperCase(),
      claimedAt: Date.now(),
      expiresAt: deal.expiresAt,
      status: 'active'
    };

    setClaims(prev => [newClaim, ...prev]);
    setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, currentClaims: d.currentClaims + 1 } : d));
    return newClaim;
  };

  const handleCreateDeal = (dealData: Omit<Deal, 'id' | 'createdAt' | 'currentClaims'>) => {
    const newDeal: Deal = {
      ...dealData,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: Date.now(),
      currentClaims: 0
    };

    setDeals([newDeal, ...deals]);
    setIsCreating(false);
    setCurrentView('live-deals');
  };

  const handleCancelDeal = (dealId: string) => {
    setDeals(deals.filter(d => d.id !== dealId));
  };

  const handleRedeemClaim = (claimId: string) => {
    setClaims(claims.map(c => c.id === claimId ? { ...c, status: 'redeemed' } : c));
  };

  const renderLiveDeals = () => {
    // Calculate distances and filter by radius
    const dealsWithDistance = deals.map(deal => {
      const dist = calculateDistance(userLocation.lat, userLocation.lng, deal.lat, deal.lng);
      return { ...deal, computedDistanceValue: dist, computedDistanceLabel: formatDistance(dist) };
    });

    const activeDeals = dealsWithDistance
      .filter(d => d.expiresAt > Date.now() && d.computedDistanceValue <= radius)
      .sort((a, b) => a.computedDistanceValue - b.computedDistanceValue);

    const expiredDeals = dealsWithDistance.filter(d => d.expiresAt <= Date.now());

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
                    localStorage.removeItem('livedrop_deals');
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
              {[1, 3, 5, 10, 25].map(r => (
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

        {activeDeals.length > 0 ? (
          activeDeals.map(deal => (
            <DealCard 
              key={deal.id} 
              deal={deal} 
              onClaim={handleClaimDeal} 
              isClaimed={claims.some(c => c.dealId === deal.id)}
              computedDistance={deal.computedDistanceLabel}
            />
          ))
        ) : (
          <div className="text-center py-16 bg-white rounded-[2.5rem] border border-dashed border-slate-200">
            <AlertCircle className="mx-auto text-slate-200 mb-4" size={56} />
            <p className="text-slate-400 font-bold">No live deals within {radius} miles.</p>
            <p className="text-slate-300 text-xs mt-1">Try increasing your radius or check back later!</p>
            <button 
              onClick={() => setRadius(prev => prev < 25 ? (prev === 1 ? 3 : prev === 3 ? 5 : prev === 5 ? 10 : 25) : 25)}
              className="mt-6 text-indigo-600 font-black text-xs uppercase tracking-[0.2em] hover:tracking-[0.3em] transition-all"
            >
              Expand Search
            </button>
          </div>
        )}

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
                    <div>
                      <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">{claim.businessName}</p>
                      <h3 className="text-slate-900 text-lg font-bold leading-tight">{claim.dealTitle}</h3>
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

  const renderBusinessPortal = () => {
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
          <h2 className="text-2xl font-black text-slate-900">Business Portal</h2>
          <button 
            onClick={() => setIsCreating(true)}
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
                    <div>
                      <h4 className="text-slate-900 font-bold">{deal.title}</h4>
                      <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider">{deal.businessName}</p>
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
                        <span className="text-lg font-mono font-black text-slate-900">{deal.currentClaims}/{deal.maxClaims}</span>
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
            <span className="text-3xl font-black text-slate-900">{deals.reduce((acc, d) => acc + d.currentClaims, 0)}</span>
          </div>
        </div>

        <button 
          onClick={() => setIsCreating(true)}
          className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-lg flex items-center justify-center gap-3 shadow-2xl shadow-slate-200 hover:bg-slate-800 transition-all"
        >
          <Plus size={24} />
          CREATE NEW DROP
        </button>
      </div>
    );
  };

  return (
    <Layout currentView={currentView} onViewChange={setCurrentView}>
      {currentView === 'live-deals' && renderLiveDeals()}
      {currentView === 'my-claims' && renderMyClaims()}
      {currentView === 'business-portal' && renderBusinessPortal()}

      <ClaimModal 
        deal={selectedDeal} 
        onClose={() => setSelectedDeal(null)} 
        onConfirm={confirmClaim}
      />
    </Layout>
  );
}
