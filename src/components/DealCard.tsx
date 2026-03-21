import React, { useState } from 'react';
import { Deal } from '../types';
import { Timer } from './Timer';
import { isUrgent } from '../utils/time';
import { getCategoryIconName, getCategoryLabel } from '../utils/categories';
import { CompanyLogo } from './CompanyLogo';
import { AppIcon } from './AppIcon';

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
  const getBadgeIcon = (badge: string) => {
    if (badge === 'Trending') return 'trending' as const;
    if (badge === 'Ending Soon') return 'ending' as const;
    return 'dropped' as const;
  };
  
  const claimCount = deal.claimCount ?? deal.currentClaims;
  const isSoldOut = claimCount >= deal.maxClaims;
  const canClaim = !isExpired && !isSoldOut && !isClaimed;

  // Handle expiration in real-time
  const handleExpire = () => {
    setIsExpired(true);
  };

  if (compact) {
    return (
      <div className={`bg-white border ${isUrgent(deal.expiresAt) && !isExpired ? 'border-rose-200 ring-1 ring-rose-100' : 'border-slate-100'} rounded-[1.28rem] p-2.5 shadow-sm shadow-slate-200/40`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <CompanyLogo businessName={deal.businessName} logoUrl={deal.logoUrl} category={deal.category} size={32} />
            <div className="min-w-0">
              <p className={`text-[9px] font-black uppercase tracking-[0.16em] mb-1 ${isExpired ? 'text-slate-300' : 'text-indigo-500'}`}>
                <span className="inline-flex items-center gap-1.5">
                  <AppIcon name={getCategoryIconName(deal.category)} size={11} />
                  {getCategoryLabel(deal.category)}
                </span>
              </p>
              <p className="text-slate-400 text-[9px] font-black uppercase tracking-[0.14em] mb-1">{deal.businessName}</p>
              <h3 className="text-slate-900 text-[13px] font-extrabold leading-tight">{deal.title}</h3>
              <p className={`mt-1.5 text-sm font-black italic tracking-tight ${isExpired ? 'text-slate-300' : 'text-indigo-600'}`}>
                {deal.offerText}
              </p>
            </div>
          </div>
          <Timer expiresAt={deal.expiresAt} onExpire={handleExpire} className="text-sm" />
        </div>

        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5">
              <AppIcon name="pin" size={13} className={isExpired ? 'text-slate-200' : 'text-indigo-400'} />
              <span>{computedDistance || deal.distance}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AppIcon name="users" size={13} className={isExpired ? 'text-slate-200' : 'text-indigo-400'} />
              <span>{isSoldOut ? 'Sold Out' : `${deal.maxClaims - claimCount} left`}</span>
            </div>
          </div>
          <button
            onClick={() => canClaim && onClaim(deal)}
            disabled={!canClaim}
            className={`inline-flex h-9 shrink-0 items-center justify-center px-3 rounded-[0.9rem] font-black text-[10px] uppercase tracking-[0.1em] transition-all ${
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
      <div className={`bg-white border ${isUrgent(deal.expiresAt) && !isExpired ? 'border-rose-200 ring-1 ring-rose-100' : 'border-slate-100'} rounded-[1.45rem] p-3.5 mb-2.5 shadow-sm shadow-slate-200/50 hover:shadow-md hover:shadow-slate-200/60 transition-all active:scale-[0.985]`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <CompanyLogo businessName={deal.businessName} logoUrl={deal.logoUrl} category={deal.category} size={36} />
          <div className="min-w-0">
            {badges.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 mb-1">
                {badges.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-[0.12em]"
                  >
                    <AppIcon name={getBadgeIcon(badge)} size={11} />
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}
            <p className={`text-[10px] font-black uppercase tracking-[0.16em] mb-1 ${isExpired ? 'text-slate-300' : 'text-indigo-500'}`}>
              <span className="inline-flex items-center gap-1.5">
                <AppIcon name={getCategoryIconName(deal.category)} size={12} />
                {getCategoryLabel(deal.category)}
              </span>
            </p>
            <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-[0.14em] mb-1">{deal.businessName}</h3>
            <h2 className="text-slate-900 text-[0.98rem] font-extrabold leading-[1.15]">{deal.title}</h2>
          </div>
        </div>
        <Timer expiresAt={deal.expiresAt} onExpire={handleExpire} className="text-lg" />
      </div>

      <div className={`rounded-[0.95rem] p-2.5 mb-2 border transition-colors ${isExpired ? 'bg-slate-50 border-slate-100' : 'bg-indigo-50/80 border-indigo-100'}`}>
        <span className={`font-black text-[1.35rem] italic tracking-tighter ${isExpired ? 'text-slate-300' : 'text-indigo-600'}`}>
          {deal.offerText}
        </span>
      </div>

      <p className={`text-[12px] mb-2 leading-[1.5] ${isExpired ? 'text-slate-300' : 'text-slate-500'}`}>
        {deal.description}
      </p>

      <div className="flex items-center gap-3 mb-2.5 text-slate-400 text-[10px] font-bold uppercase tracking-[0.1em]">
        <div className="flex items-center gap-1.5">
          <AppIcon name="pin" size={14} className={isExpired ? 'text-slate-200' : 'text-indigo-400'} />
          {computedDistance || deal.distance}
        </div>
        <div className="flex items-center gap-1.5">
          <AppIcon name="users" size={14} className={isExpired ? 'text-slate-200' : 'text-indigo-400'} />
          {isSoldOut ? 'Sold Out' : `${deal.maxClaims - claimCount} left`}
        </div>
      </div>

      <div className="space-y-1.5">
        <button
          onClick={() => canClaim && onClaim(deal)}
          disabled={!canClaim}
          className={`inline-flex h-9.5 w-full items-center justify-center rounded-[0.95rem] px-3 font-black text-[11px] uppercase tracking-[0.1em] transition-all shadow-lg ${
            canClaim 
              ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-indigo-200/80' 
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
            className={`inline-flex h-9.5 w-full items-center justify-center rounded-[0.95rem] px-3 font-black text-[11px] uppercase tracking-[0.1em] transition-all ${
              isSavedToCatalog
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                : 'bg-white border border-indigo-100 text-indigo-600 hover:bg-indigo-50/80'
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
