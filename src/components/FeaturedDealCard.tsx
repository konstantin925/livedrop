import React, { useState } from 'react';
import { Deal } from '../types';
import { Timer } from './Timer';
import { isUrgent } from '../utils/time';
import { getCategoryIconName, getCategoryLabel } from '../utils/categories';
import { CompanyLogo } from './CompanyLogo';
import { AppIcon } from './AppIcon';
import { DealEngagementAction, DealEngagementBar } from './DealEngagementBar';

interface FeaturedDealCardProps {
  deal: Deal;
  onClaim: (deal: Deal) => void;
  isClaimed?: boolean;
  computedDistance?: string;
  onSaveToCatalog?: (deal: Deal) => void;
  canSaveToCatalog?: boolean;
  isSavedToCatalog?: boolean;
  saveFeedback?: string | null;
  badges?: string[];
  pendingEngagementAction?: DealEngagementAction | null;
  onLike?: (deal: Deal) => void;
  onDislike?: (deal: Deal) => void;
  onShare?: (deal: Deal) => void;
}

export const FeaturedDealCard: React.FC<FeaturedDealCardProps> = ({
  deal,
  onClaim,
  isClaimed = false,
  computedDistance,
  onSaveToCatalog,
  canSaveToCatalog = false,
  isSavedToCatalog = false,
  saveFeedback,
  badges = [],
  pendingEngagementAction = null,
  onLike,
  onDislike,
  onShare,
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
  const canEngage = Boolean(onLike && onDislike && onShare);
  const displayBusinessName = deal.businessName?.trim() || 'LiveDrop Partner';
  const displayTitle = deal.title?.trim() || 'Limited-Time Deal';
  const displayDescription = deal.description?.trim() || 'Fresh deal available right now.';
  const displayOfferText = deal.offerText?.trim() || 'Live Deal';

  // Handle expiration in real-time
  const handleExpire = () => {
    setIsExpired(true);
  };

  return (
    <div className="relative mb-4 overflow-hidden border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 rounded-[1.8rem] p-4 shadow-[0_20px_40px_rgba(245,158,11,0.15)] transition-all hover:shadow-[0_24px_48px_rgba(245,158,11,0.2)] active:scale-[0.98]">
      {/* Featured Badge */}
      <div className="absolute -top-1 -right-1 z-10">
        <div className="flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1 text-xs font-black uppercase tracking-wide text-white shadow-lg">
          <AppIcon name="star" size={12} />
          Featured
        </div>
      </div>

      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <CompanyLogo businessName={displayBusinessName} logoUrl={deal.logoUrl} category={deal.category} size={44} />
          <div className="min-w-0 flex-1">
            {badges.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {badges.map((badge) => (
                  <span
                    key={badge}
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-amber-700"
                  >
                    <AppIcon name={getBadgeIcon(badge)} size={12} />
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}
            <p className={`mb-1 text-xs font-black uppercase tracking-wider ${isExpired ? 'text-slate-300' : 'text-amber-600'}`}>
              <span className="inline-flex items-center gap-1.5">
                <AppIcon name={getCategoryIconName(deal.category)} size={14} />
                {getCategoryLabel(deal.category)}
              </span>
            </p>
            <p className="mb-1 truncate text-xs font-bold uppercase tracking-wide text-slate-500">{displayBusinessName}</p>
            <h2 className="line-clamp-2 break-words pr-1 text-xl font-extrabold leading-tight text-slate-900">{displayTitle}</h2>
          </div>
        </div>
        <Timer expiresAt={deal.expiresAt} onExpire={handleExpire} className="shrink-0 text-lg font-bold" />
      </div>

      <div className={`mb-3 rounded-xl border-2 px-4 py-3 transition-colors ${isExpired ? 'border-slate-200 bg-slate-100' : 'border-amber-200 bg-gradient-to-r from-amber-100 to-orange-100'}`}>
        <span className={`line-clamp-2 break-words font-black italic tracking-tight text-xl ${isExpired ? 'text-slate-300' : 'text-amber-700'}`}>
          {displayOfferText}
        </span>
      </div>

      <p className={`mb-4 line-clamp-3 break-words text-sm leading-relaxed ${isExpired ? 'text-slate-300' : 'text-slate-600'}`}>
        {displayDescription}
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <div className="inline-flex min-w-0 items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm">
          <AppIcon name="pin" size={16} className={isExpired ? 'text-slate-200' : 'text-amber-500'} />
          <span className="truncate">{computedDistance || deal.distance}</span>
        </div>
        <div className="inline-flex min-w-0 items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm">
          <AppIcon name="users" size={16} className={isExpired ? 'text-slate-200' : 'text-amber-500'} />
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

      <div className="space-y-3">
        <button
          onClick={() => canClaim && onClaim(deal)}
          disabled={!canClaim}
          className={`inline-flex h-12 w-full items-center justify-center rounded-xl px-4 font-black text-sm uppercase tracking-wide transition-all shadow-lg ${
            canClaim
              ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 active:from-amber-700 active:to-orange-800 shadow-amber-200/80'
              : isClaimed
                ? 'bg-emerald-500 text-white shadow-emerald-100/80'
                : 'cursor-not-allowed bg-slate-100 text-slate-400 shadow-none'
          }`}
        >
          {isClaimed ? 'CLAIMED' : isExpired ? 'EXPIRED' : isSoldOut ? 'SOLD OUT' : 'CLAIM FEATURED DEAL'}
        </button>

        {onSaveToCatalog && canSaveToCatalog ? (
          <button
            onClick={() => !isSavedToCatalog && onSaveToCatalog(deal)}
            disabled={isSavedToCatalog}
            className={`inline-flex h-12 w-full items-center justify-center rounded-xl border-2 px-4 font-black text-sm uppercase tracking-wide transition-all ${
              isSavedToCatalog
                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                : 'border-amber-200 bg-white text-amber-600 hover:bg-amber-50/80'
            }`}
          >
            {isSavedToCatalog ? 'Saved' : 'Save to Catalog'}
          </button>
        ) : null}

        {saveFeedback ? (
          <p className="text-center text-sm font-semibold text-emerald-600">{saveFeedback}</p>
        ) : null}
      </div>
    </div>
  );
};</content>
<parameter name="filePath">c:\Users\User\Desktop\livedrop\livedrop\src\components\FeaturedDealCard.tsx