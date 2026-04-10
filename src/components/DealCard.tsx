import React, { useState } from 'react';
import { Deal } from '../types';
import { Timer } from './Timer';
import { isUrgent } from '../utils/time';
import { getCategoryIconName, getCategoryLabel } from '../utils/categories';
import { AppIcon } from './AppIcon';
import { DealEngagementAction, DealEngagementBar } from './DealEngagementBar';
import { DealArtwork } from './DealArtwork';
import { buildDealIconPngPath, normalizeDealIconName } from '../utils/dealIcons';

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

export const DealCard = React.memo(({
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
}: DealCardProps) => {
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
  const rawIconNameInput = typeof deal.iconName === 'string' ? deal.iconName.trim() : '';
  const normalizedIconName = normalizeDealIconName(rawIconNameInput);
  const customCardIconSrc = buildDealIconPngPath(normalizedIconName);
  const cardImageCandidate =
    (typeof deal.cardImageUrl === 'string' ? deal.cardImageUrl.trim() : '')
    || (typeof deal.cardImage === 'string' ? deal.cardImage.trim() : '')
    || (typeof deal.imageUrl === 'string' ? deal.imageUrl.trim() : '');
  const detailImageCandidate =
    (typeof deal.detailImageUrl === 'string' ? deal.detailImageUrl.trim() : '')
    || (typeof deal.detailImage === 'string' ? deal.detailImage.trim() : '')
    || '';
  const cardImageLooksLikeIcon = /\/category-icons\//i.test(cardImageCandidate);
  const hasDistinctCardPreviewAsset = !detailImageCandidate || cardImageCandidate !== detailImageCandidate;
  const cardArtworkSrc = customCardIconSrc
    || (cardImageLooksLikeIcon || hasDistinctCardPreviewAsset ? cardImageCandidate || undefined : undefined)
    || undefined;
  const fallbackCategoryIconName = getCategoryIconName(deal.category);
  const parseOfferPrices = () => {
    if (!displayOfferText) return { current: null, original: null };
    const match = displayOfferText.match(
      /\$?\s*(\d{1,4}(?:,\d{3})?(?:\.\d{1,2})?)\s*(?:->|→|to)\s*\$?\s*(\d{1,4}(?:,\d{3})?(?:\.\d{1,2})?)/i,
    );
    if (match) {
      const original = Number(match[1].replace(/,/g, ''));
      const current = Number(match[2].replace(/,/g, ''));
      if (Number.isFinite(original) && Number.isFinite(current)) {
        return { current, original };
      }
    }
    const single = displayOfferText.match(/\$?\s*(\d{1,4}(?:,\d{3})?(?:\.\d{1,2})?)/);
    if (single) {
      const current = Number(single[1].replace(/,/g, ''));
      if (Number.isFinite(current)) {
        return { current, original: null };
      }
    }
    return { current: null, original: null };
  };
  const formatPrice = (value: number | null | undefined) => {
    if (!Number.isFinite(value)) return null;
    return `$${(value as number).toFixed(2).replace(/\.00$/, '')}`;
  };
  const offerPrices = parseOfferPrices();
  const currentPrice = deal.currentPrice ?? offerPrices.current;
  const originalPrice = deal.originalPrice ?? offerPrices.original;
  const currentPriceLabel = formatPrice(currentPrice);
  const originalPriceLabel = formatPrice(originalPrice);
  const badgePercent = typeof deal.discountPercent === 'number' && Number.isFinite(deal.discountPercent)
    ? `${Math.round(deal.discountPercent)}% OFF`
    : (() => {
        const percentMatch = displayOfferText.match(/(\d{1,3})\s*%/);
        return percentMatch ? `${percentMatch[1]}% OFF` : 'DEAL';
      })();

  // Handle expiration in real-time
  const handleExpire = () => {
    setIsExpired(true);
  };

  if (compact) {
    return (
      <div className={`overflow-hidden rounded-[1.3rem] border bg-white shadow-sm shadow-slate-200/30 ${
        isUrgent(deal.expiresAt) && !isExpired ? 'border-rose-200' : 'border-slate-100/90'
      }`}>
        <div className="relative aspect-[4/3] w-full bg-slate-50">
          <DealArtwork
            src={cardArtworkSrc}
            iconName={normalizedIconName || undefined}
            dealId={deal.id}
            fallbackIconName={fallbackCategoryIconName}
            alt={displayTitle}
            preferredWidth={360}
            sizes="(max-width: 520px) 90vw, 340px"
            className="h-full w-full"
            imageClassName="object-contain"
          />
          <div className="absolute left-2 top-2 rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white shadow-sm">
            {badgePercent}
          </div>
          {showTimer ? (
            <Timer expiresAt={deal.expiresAt} onExpire={handleExpire} className="absolute right-2 top-2 text-[10px]" />
          ) : null}
        </div>

        <div className="px-3 pb-3 pt-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">{displayBusinessName}</p>
          <h3 className="mt-1 line-clamp-2 text-[13px] font-bold leading-[1.2] text-slate-900">{displayTitle}</h3>

          <div className="mt-2 flex items-center gap-2">
            {originalPriceLabel ? (
              <span className="text-[11px] font-semibold text-slate-400 line-through">{originalPriceLabel}</span>
            ) : null}
            {currentPriceLabel ? (
              <span className="text-[14px] font-black text-slate-900">{currentPriceLabel}</span>
            ) : (
              <span className="text-[12px] font-semibold text-indigo-600">{displayOfferText}</span>
            )}
          </div>

          {canEngage ? (
            <div className="mt-2">
              <DealEngagementBar
                deal={deal}
                compact
                pendingAction={pendingEngagementAction}
                onLike={onLike!}
                onDislike={onDislike!}
                onShare={onShare!}
              />
            </div>
          ) : null}

          {showAdminActions && onEditDeal && onDeleteDeal ? (
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onEditDeal(deal);
                }}
                className="inline-flex h-9 items-center justify-center rounded-[0.9rem] border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.1em] text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600"
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
                className={`inline-flex h-9 items-center justify-center rounded-[0.9rem] border px-3 text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
                  isDeleting
                    ? 'cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400'
                    : 'border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100'
                }`}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          ) : null}

          <button
            onClick={() => canClaim && onClaim(deal)}
            disabled={!canClaim}
            className={`mt-2 inline-flex h-9 w-full items-center justify-center rounded-[0.95rem] px-3 text-[10px] font-black uppercase tracking-[0.08em] transition-all ${
              canClaim
                ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-700'
                : isClaimed
                  ? 'bg-emerald-500 text-white'
                  : 'cursor-not-allowed bg-slate-100 text-slate-400'
            }`}
          >
            {isClaimed ? 'Claimed' : isExpired ? 'Expired' : isSoldOut ? 'Sold Out' : 'Claim Deal'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`mb-3 overflow-hidden rounded-[1.5rem] border bg-white shadow-[0_10px_24px_rgba(148,163,184,0.12)] transition-all ${
      isUrgent(deal.expiresAt) && !isExpired ? 'border-rose-200' : 'border-slate-100/90'
    } ${isViewed ? 'opacity-90 border-slate-200' : ''}`}>
      <div className="relative aspect-[4/3] w-full bg-slate-50">
        <DealArtwork
          src={cardArtworkSrc}
          iconName={normalizedIconName || undefined}
          dealId={deal.id}
          fallbackIconName={fallbackCategoryIconName}
          alt={displayTitle}
          preferredWidth={520}
          sizes="(max-width: 640px) 90vw, 420px"
          className="h-full w-full"
          imageClassName="object-contain"
        />
        <div className="absolute left-3 top-3 rounded-full bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 px-3 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-white shadow-sm">
          {badgePercent}
        </div>
        {showTimer ? (
          <Timer expiresAt={deal.expiresAt} onExpire={handleExpire} className="absolute right-3 top-3 text-[12px]" />
        ) : null}
      </div>

      <div className="px-4 pb-4 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{displayBusinessName}</p>
            <h2 className="mt-1 line-clamp-2 text-[1rem] font-bold leading-[1.2] text-slate-900">{displayTitle}</h2>
          </div>
          {isViewed ? (
            <span className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Viewed
            </span>
          ) : null}
        </div>

        <div className="mt-2 flex items-center gap-2">
          {originalPriceLabel ? (
            <span className="text-[12px] font-semibold text-slate-400 line-through">{originalPriceLabel}</span>
          ) : null}
          {currentPriceLabel ? (
            <span className="text-[16px] font-black text-slate-900">{currentPriceLabel}</span>
          ) : (
            <span className="text-[12px] font-semibold text-indigo-600">{displayOfferText}</span>
          )}
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
          <div className="mb-3 mt-3 grid grid-cols-2 gap-2">
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

        <div className="mt-3">
          <button
            onClick={() => canClaim && onClaim(deal)}
            disabled={!canClaim}
            className={`inline-flex h-10 w-full items-center justify-center rounded-[1rem] px-3 font-black text-[10px] uppercase tracking-[0.08em] transition-all shadow-sm ${
              canClaim 
                ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
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
              className={`mt-2 inline-flex h-9 w-full items-center justify-center rounded-[0.95rem] border px-3 text-[9px] font-black uppercase tracking-[0.08em] transition-all ${
                isSavedToCatalog
                  ? 'border-emerald-100 bg-emerald-50 text-emerald-600'
                  : 'border-indigo-100 bg-white text-indigo-600 hover:bg-indigo-50/80'
              }`}
            >
              {isSavedToCatalog ? 'Saved' : 'Save to Catalog'}
            </button>
          ) : null}
          {saveFeedback ? (
            <p className="mt-2 text-center text-xs font-semibold text-emerald-600">{saveFeedback}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
});

DealCard.displayName = 'DealCard';
