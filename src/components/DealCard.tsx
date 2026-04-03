import React, { useState } from 'react';
import { Deal } from '../types';
import { Timer } from './Timer';
import { isUrgent } from '../utils/time';
import { getCategoryIconName, getCategoryLabel } from '../utils/categories';
import { CompanyLogo } from './CompanyLogo';
import { AppIcon } from './AppIcon';
import { DealEngagementAction, DealEngagementBar } from './DealEngagementBar';

interface DealCardProps {
  deal: Deal;
  onClaim: (deal: Deal) => void;
  isClaimed?: boolean;
  isViewed?: boolean;
  computedDistance?: string;
  onSaveToCatalog?: (deal: Deal) => void;
  canSaveToCatalog?: boolean;
  isSavedToCatalog?: boolean;
  saveFeedback?: string | null;
  compact?: boolean;
  badges?: string[];
  pendingEngagementAction?: DealEngagementAction | null;
  onLike?: (deal: Deal) => void;
  onDislike?: (deal: Deal) => void;
  onShare?: (deal: Deal) => void;
  showAdminActions?: boolean;
  onEditDeal?: (deal: Deal) => void;
  onDeleteDeal?: (deal: Deal) => void | Promise<void>;
  isDeleting?: boolean;
}

export const DealCard: React.FC<DealCardProps> = ({
  deal,
  onClaim,
  isClaimed = false,
  isViewed = false,
  computedDistance,
  onSaveToCatalog,
  canSaveToCatalog = false,
  isSavedToCatalog = false,
  saveFeedback,
  compact = false,
  badges = [],
  pendingEngagementAction = null,
  onLike,
  onDislike,
  onShare,
  showAdminActions = false,
  onEditDeal,
  onDeleteDeal,
  isDeleting = false,
}) => {
  const showTimer = deal.businessType !== 'online' && deal.hasTimer !== false;
  const [isExpired, setIsExpired] = useState(showTimer && deal.expiresAt <= Date.now());
  const getBadgeIcon = (badge: string) => {
    if (badge === 'Trending') return 'trending' as const;
    if (badge === 'Ending Soon') return 'ending' as const;
    return 'dropped' as const;
  };
  
  const claimCount = deal.claimCount ?? deal.currentClaims;
  const isSoldOut = claimCount >= deal.maxClaims;
  const canClaim = !isExpired && !isSoldOut && !isClaimed;
  const canEngage = Boolean(onLike && onDislike && onShare);
  const displayBusinessName = deal.businessName?.trim() || 'LiveDrop Partner';
  const displayTitle = deal.title?.trim() || 'Limited-Time Deal';
  const displayDescription = deal.description?.trim() || 'Fresh deal available right now.';
  const displayOfferText = deal.offerText?.trim() || 'Live Deal';

  // Handle expiration in real-time
  const handleExpire = () => {
    setIsExpired(true);
  };

  if (compact) {
    return (
      <div className={`overflow-hidden border bg-white ${isUrgent(deal.expiresAt) && !isExpired ? 'border-rose-200 ring-1 ring-rose-100' : 'border-slate-100/90'} rounded-[1.3rem] p-2.25 max-[359px]:p-2 shadow-sm shadow-slate-200/35`}>
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <CompanyLogo businessName={displayBusinessName} logoUrl={deal.logoUrl} category={deal.category} size={32} />
            <div className="min-w-0 flex-1">
              <p className={`mb-1 text-[8px] font-black uppercase tracking-[0.16em] ${isExpired ? 'text-slate-300' : 'text-indigo-500'}`}>
                <span className="inline-flex items-center gap-1.5">
                  <AppIcon name={getCategoryIconName(deal.category)} size={11} />
                  {getCategoryLabel(deal.category)}
                </span>
              </p>
              <p className="mb-1 truncate text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{displayBusinessName}</p>
              <h3 className="line-clamp-2 break-words text-[13px] font-extrabold leading-[1.18] text-slate-900">{displayTitle}</h3>
              <p className={`mt-1.5 line-clamp-2 break-words text-[12px] font-black italic leading-[1.15] tracking-tight ${isExpired ? 'text-slate-300' : 'text-indigo-600'}`}>
                {displayOfferText}
              </p>
            </div>
          </div>
          {showTimer ? (
            <Timer expiresAt={deal.expiresAt} onExpire={handleExpire} className="shrink-0 text-[10px] min-[360px]:text-[11px]" />
          ) : null}
        </div>

        <div className="mt-2 flex flex-col gap-2 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
          <div className="grid min-w-0 grid-cols-2 gap-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 min-[390px]:flex min-[390px]:flex-wrap min-[390px]:items-center min-[390px]:gap-x-3 min-[390px]:gap-y-1.5">
            <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1">
              <AppIcon name="pin" size={13} className={isExpired ? 'text-slate-200' : 'text-indigo-400'} />
              <span className="truncate">{computedDistance || deal.distance}</span>
            </div>
            <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1">
              <AppIcon name="users" size={13} className={isExpired ? 'text-slate-200' : 'text-indigo-400'} />
              <span className="truncate">{isSoldOut ? 'Sold Out' : `${deal.maxClaims - claimCount} left`}</span>
            </div>
          </div>
          <button
            onClick={() => canClaim && onClaim(deal)}
            disabled={!canClaim}
            className={`inline-flex h-9 w-full shrink-0 items-center justify-center rounded-[0.95rem] px-3 font-black text-[10px] uppercase tracking-[0.08em] transition-all shadow-sm min-[360px]:w-auto ${
              canClaim
                ? 'bg-indigo-600 text-white shadow-indigo-200/80 hover:bg-indigo-700'
                : isClaimed
                  ? 'bg-emerald-500 text-white shadow-emerald-100/70'
                  : 'bg-slate-100 text-slate-400 shadow-none'
            }`}
          >
            {isClaimed ? 'Claimed' : isExpired ? 'Expired' : isSoldOut ? 'Sold Out' : 'Claim'}
          </button>
        </div>

        {canEngage ? (
          <DealEngagementBar
            deal={deal}
            compact
            pendingAction={pendingEngagementAction}
            onLike={onLike!}
            onDislike={onDislike!}
            onShare={onShare!}
          />
        ) : null}

        {showAdminActions && onEditDeal && onDeleteDeal ? (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEditDeal(deal);
              }}
              className="inline-flex h-9.5 items-center justify-center rounded-[1rem] border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void onDeleteDeal(deal);
              }}
              disabled={isDeleting}
              className={`inline-flex h-9.5 items-center justify-center rounded-[1rem] border px-3 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
                isDeleting
                  ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                  : 'border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100'
              }`}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`mb-3 overflow-hidden border bg-white ${isUrgent(deal.expiresAt) && !isExpired ? 'border-rose-200 ring-1 ring-rose-100' : 'border-slate-100/90'} rounded-[1.5rem] p-3 max-[359px]:p-2.5 shadow-[0_12px_28px_rgba(148,163,184,0.16)] transition-all hover:shadow-[0_16px_34px_rgba(148,163,184,0.18)] active:scale-[0.985] ${isViewed ? 'opacity-90 border-slate-200 shadow-[0_8px_18px_rgba(148,163,184,0.12)]' : ''}`}>
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <CompanyLogo businessName={displayBusinessName} logoUrl={deal.logoUrl} category={deal.category} size={36} />
          <div className="min-w-0 flex-1">
            {badges.length > 0 ? (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {badges.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-indigo-600"
                  >
                    <AppIcon name={getBadgeIcon(badge)} size={11} />
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}
            <p className={`mb-1 text-[9px] font-black uppercase tracking-[0.16em] ${isExpired ? 'text-slate-300' : 'text-indigo-500'}`}>
              <span className="inline-flex items-center gap-1.5">
                <AppIcon name={getCategoryIconName(deal.category)} size={12} />
                {getCategoryLabel(deal.category)}
                </span>
              </p>
            <p className="mb-1 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{displayBusinessName}</p>
            <h2 className="line-clamp-2 break-words pr-1 text-[0.98rem] font-extrabold leading-[1.15] text-slate-900">{displayTitle}</h2>
            {isViewed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                <AppIcon name="eye" size={11} /> Viewed
              </span>
            ) : null}
          </div>
        </div>
        {showTimer ? (
          <Timer expiresAt={deal.expiresAt} onExpire={handleExpire} className="shrink-0 text-[13px] min-[360px]:text-base" />
        ) : null}
      </div>

      <div className={`mb-2 rounded-[1rem] border px-3 py-2 transition-colors ${isExpired ? 'border-slate-100 bg-slate-50' : 'border-indigo-100/90 bg-[linear-gradient(135deg,rgba(238,242,255,0.92),rgba(224,231,255,0.72))]'}`}>
        <span className={`line-clamp-2 break-words font-black italic tracking-tighter text-[1.08rem] min-[360px]:text-[1.2rem] ${isExpired ? 'text-slate-300' : 'text-indigo-600'}`}>
          {displayOfferText}
        </span>
      </div>

      <p className={`mb-2.5 line-clamp-3 break-words text-[12px] leading-[1.55] ${isExpired ? 'text-slate-300' : 'text-slate-500'}`}>
        {displayDescription}
      </p>

      <div className="mb-2.5 grid grid-cols-2 gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
        <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1.5">
          <AppIcon name="pin" size={14} className={isExpired ? 'text-slate-200' : 'text-indigo-400'} />
          <span className="truncate">{computedDistance || deal.distance}</span>
        </div>
        <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1.5">
          <AppIcon name="users" size={14} className={isExpired ? 'text-slate-200' : 'text-indigo-400'} />
          <span className="truncate">{isSoldOut ? 'Sold Out' : `${deal.maxClaims - claimCount} left`}</span>
        </div>
      </div>

      {canEngage ? (
        <DealEngagementBar
          deal={deal}
          pendingAction={pendingEngagementAction}
          onLike={onLike!}
          onDislike={onDislike!}
          onShare={onShare!}
        />
      ) : null}

      {showAdminActions && onEditDeal && onDeleteDeal ? (
        <div className="mb-3 mt-2.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEditDeal(deal);
            }}
            className="inline-flex h-10 items-center justify-center rounded-[1rem] border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void onDeleteDeal(deal);
            }}
            disabled={isDeleting}
            className={`inline-flex h-10 items-center justify-center rounded-[1rem] border px-3 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
              isDeleting
                ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                : 'border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100'
            }`}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      ) : null}

      <div className="space-y-2">
        <button
          onClick={() => canClaim && onClaim(deal)}
          disabled={!canClaim}
          className={`inline-flex h-10 w-full items-center justify-center rounded-[1rem] px-3 font-black text-[10px] uppercase tracking-[0.08em] transition-all shadow-md ${
            canClaim 
              ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-indigo-200/80' 
              : isClaimed 
                ? 'bg-emerald-500 text-white shadow-emerald-100/80'
                : 'cursor-not-allowed bg-slate-100 text-slate-400 shadow-none'
          }`}
        >
          {isClaimed ? 'CLAIMED' : isExpired ? 'EXPIRED' : isSoldOut ? 'SOLD OUT' : 'CLAIM DEAL'}
        </button>

        {onSaveToCatalog && canSaveToCatalog ? (
          <button
            onClick={() => !isSavedToCatalog && onSaveToCatalog(deal)}
            disabled={isSavedToCatalog}
            className={`inline-flex h-10 w-full items-center justify-center rounded-[1rem] border px-3 font-black text-[10px] min-[360px]:text-[11px] uppercase tracking-[0.08em] transition-all ${
              isSavedToCatalog
                ? 'border-emerald-100 bg-emerald-50 text-emerald-600'
                : 'border-indigo-100 bg-white text-indigo-600 hover:bg-indigo-50/80'
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
