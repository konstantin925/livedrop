import React, { useState } from 'react';
import { Deal } from '../types';
import { Timer } from './Timer';
import { MapPin, Users } from 'lucide-react';
import { isUrgent } from '../utils/time';
import { getCategoryLabel } from '../utils/categories';
import { CompanyLogo } from './CompanyLogo';

interface DealCardProps {
  deal: Deal;
  onClaim: (deal: Deal) => void;
  isClaimed?: boolean;
  computedDistance?: string;
  onSaveToCatalog?: (deal: Deal) => void;
  canSaveToCatalog?: boolean;
  isSavedToCatalog?: boolean;
  saveFeedback?: string | null;
  compact?: boolean;
  badges?: string[];
}

export const DealCard: React.FC<DealCardProps> = ({
  deal,
  onClaim,
  isClaimed = false,
  computedDistance,
  onSaveToCatalog,
  canSaveToCatalog = false,
  isSavedToCatalog = false,
  saveFeedback,
  compact = false,
  badges = [],
}) => {
  const [isExpired, setIsExpired] = useState(deal.expiresAt <= Date.now());
  
  const claimCount = deal.claimCount ?? deal.currentClaims;
  const isSoldOut = claimCount >= deal.maxClaims;
  const canClaim = !isExpired && !isSoldOut && !isClaimed;

  // Handle expiration in real-time
  const handleExpire = () => {
    setIsExpired(true);
  };

  if (compact) {
    return (
      <div className={`bg-white border ${isUrgent(deal.expiresAt) && !isExpired ? 'border-rose-200 ring-1 ring-rose-100' : 'border-slate-100'} rounded-[1.75rem] p-4 shadow-sm`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <CompanyLogo businessName={deal.businessName} logoUrl={deal.logoUrl} category={deal.category} size={38} />
            <div className="min-w-0">
              <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isExpired ? 'text-slate-300' : 'text-indigo-500'}`}>
                {getCategoryLabel(deal.category)}
              </p>
              <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-1">{deal.businessName}</p>
              <h3 className="text-slate-900 text-base font-black leading-tight">{deal.title}</h3>
              <p className={`mt-2 text-sm font-black italic tracking-tight ${isExpired ? 'text-slate-300' : 'text-indigo-600'}`}>
                {deal.offerText}
              </p>
            </div>
          </div>
          <Timer expiresAt={deal.expiresAt} onExpire={handleExpire} className="text-sm" />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5">
              <MapPin size={13} className={isExpired ? 'text-slate-200' : 'text-indigo-400'} />
              <span>{computedDistance || deal.distance}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users size={13} className={isExpired ? 'text-slate-200' : 'text-indigo-400'} />
              <span>{isSoldOut ? 'Sold Out' : `${deal.maxClaims - claimCount} left`}</span>
            </div>
          </div>
          <button
            onClick={() => canClaim && onClaim(deal)}
            disabled={!canClaim}
            className={`shrink-0 px-4 py-2 rounded-xl font-black text-[11px] transition-all ${
              canClaim
                ? 'bg-indigo-600 text-white'
                : isClaimed
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-100 text-slate-400'
            }`}
          >
            {isClaimed ? 'Claimed' : isExpired ? 'Expired' : isSoldOut ? 'Sold Out' : 'Claim'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border ${isUrgent(deal.expiresAt) && !isExpired ? 'border-rose-200 ring-1 ring-rose-100' : 'border-slate-100'} rounded-3xl p-6 mb-4 shadow-sm hover:shadow-md transition-all active:scale-[0.98]`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <CompanyLogo businessName={deal.businessName} logoUrl={deal.logoUrl} category={deal.category} size={42} />
          <div className="min-w-0">
            {badges.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {badges.map((badge) => (
                  <span
                    key={badge}
                    className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-wider"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}
            <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isExpired ? 'text-slate-300' : 'text-indigo-500'}`}>
              {getCategoryLabel(deal.category)}
            </p>
            <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">{deal.businessName}</h3>
            <h2 className="text-slate-900 text-xl font-black leading-tight">{deal.title}</h2>
          </div>
        </div>
        <Timer expiresAt={deal.expiresAt} onExpire={handleExpire} className="text-lg" />
      </div>

      <div className={`rounded-2xl p-4 mb-4 border transition-colors ${isExpired ? 'bg-slate-50 border-slate-100' : 'bg-indigo-50 border-indigo-100'}`}>
        <span className={`font-black text-2xl italic tracking-tighter ${isExpired ? 'text-slate-300' : 'text-indigo-600'}`}>
          {deal.offerText}
        </span>
      </div>

      <p className={`text-sm mb-4 leading-relaxed ${isExpired ? 'text-slate-300' : 'text-slate-500'}`}>
        {deal.description}
      </p>

      <div className="flex items-center gap-4 mb-6 text-slate-400 text-xs font-bold uppercase tracking-wider">
        <div className="flex items-center gap-1.5">
          <MapPin size={14} className={isExpired ? 'text-slate-200' : 'text-indigo-400'} />
          {computedDistance || deal.distance}
        </div>
        <div className="flex items-center gap-1.5">
          <Users size={14} className={isExpired ? 'text-slate-200' : 'text-indigo-400'} />
          {isSoldOut ? 'Sold Out' : `${deal.maxClaims - claimCount} left`}
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => canClaim && onClaim(deal)}
          disabled={!canClaim}
          className={`w-full py-4 rounded-2xl font-black text-lg transition-all shadow-lg ${
            canClaim 
              ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-indigo-200' 
              : isClaimed 
                ? 'bg-emerald-500 text-white shadow-emerald-100'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
          }`}
        >
          {isClaimed ? 'CLAIMED' : isExpired ? 'EXPIRED' : isSoldOut ? 'SOLD OUT' : 'CLAIM DEAL'}
        </button>

        {onSaveToCatalog && canSaveToCatalog ? (
          <button
            onClick={() => !isSavedToCatalog && onSaveToCatalog(deal)}
            disabled={isSavedToCatalog}
            className={`w-full py-3 rounded-2xl font-black text-sm transition-all ${
              isSavedToCatalog
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                : 'bg-white border border-indigo-100 text-indigo-600 hover:bg-indigo-50'
            }`}
          >
            {isSavedToCatalog ? 'Saved' : 'Save to Catalog'}
          </button>
        ) : null}

        {saveFeedback ? (
          <p className="text-center text-xs font-semibold text-emerald-600">{saveFeedback}</p>
        ) : null}
      </div>
    </div>
  );
};
