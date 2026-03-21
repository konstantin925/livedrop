import { CatalogCoupon, Deal } from '../types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DISCOUNT_DECAY = 5;
const MINIMUM_DISCOUNT = 5;

export function extractDiscountPercent(text: string): number | null {
  const match = text.match(/(\d+)\s*%/);
  if (!match) return null;

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function getDealDiscountPercent(deal: Deal): number | null {
  return (
    extractDiscountPercent(deal.offerText) ??
    extractDiscountPercent(deal.title) ??
    extractDiscountPercent(deal.description)
  );
}

export function canSaveDealToCatalog(deal: Deal): boolean {
  return deal.expiresAt > Date.now();
}

export function createCatalogCouponFromDeal(deal: Deal): CatalogCoupon {
  const discount = getDealDiscountPercent(deal);
  const timestamp = Date.now();

  return {
    id: `catalog-${deal.id}`,
    dealId: deal.id,
    businessName: deal.businessName,
    logoUrl: deal.logoUrl,
    title: deal.title,
    description: deal.description,
    category: deal.category,
    offerText: deal.offerText,
    originalDiscount: discount,
    currentDiscount: discount,
    savedAt: timestamp,
    lastDiscountUpdateAt: timestamp,
    lastViewedDiscount: discount,
    expiresAt: deal.expiresAt,
    status: 'active',
  };
}

export function refreshCatalogCoupons(coupons: CatalogCoupon[]): {
  coupons: CatalogCoupon[];
  droppedIds: string[];
} {
  const now = Date.now();
  const droppedIds: string[] = [];

  const nextCoupons = coupons.map((coupon) => {
    let nextCoupon = { ...coupon };

    if (nextCoupon.status === 'active' && nextCoupon.expiresAt && nextCoupon.expiresAt <= now) {
      nextCoupon.status = 'expired';
    }

    if (nextCoupon.status !== 'active') {
      nextCoupon.lastViewedDiscount = nextCoupon.currentDiscount;
      return nextCoupon;
    }

    if (nextCoupon.currentDiscount === null) {
      nextCoupon.lastViewedDiscount = null;
      return nextCoupon;
    }

    const fullDaysElapsed = Math.floor((now - nextCoupon.lastDiscountUpdateAt) / ONE_DAY_MS);

    if (fullDaysElapsed > 0) {
      const nextDiscount = Math.max(
        MINIMUM_DISCOUNT,
        nextCoupon.currentDiscount - fullDaysElapsed * DISCOUNT_DECAY
      );
      nextCoupon.currentDiscount = nextDiscount;
      nextCoupon.lastDiscountUpdateAt = nextCoupon.lastDiscountUpdateAt + fullDaysElapsed * ONE_DAY_MS;
    }

    if (nextCoupon.currentDiscount < nextCoupon.lastViewedDiscount) {
      droppedIds.push(nextCoupon.id);
    }

    nextCoupon.lastViewedDiscount = nextCoupon.currentDiscount;
    return nextCoupon;
  });

  return { coupons: nextCoupons, droppedIds };
}
