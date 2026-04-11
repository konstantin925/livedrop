import React, { useEffect, useMemo, useState } from 'react';
import { Deal, UserLocation } from '../types';
import {
  getCategoryIconName,
  getCategoryLabel,
  getDefaultCategoryForMode,
  getCategoryOptionsForMode,
  normalizeCategoryValue,
} from '../utils/categories';
import {
  DEAL_STATUS_FILTER_OPTIONS,
  getDealStatusFilterLabel,
  sanitizeDealStatusTags,
} from '../utils/dealStatus';
import {
  getKnownDealIconNames,
  inferDealIconNameFromDealSignals,
  normalizeDealIconName,
  resolveDealIcon,
} from '../utils/dealIcons';
import { getOptimizedDealImageSrcSet, getOptimizedDealImageUrl } from '../utils/dealImages';
import { DealCard } from './DealCard';
import { AppIcon } from './AppIcon';

interface CreateDealFormProps {
  onSubmit: (
    deal: Omit<Deal, 'id' | 'createdAt'>,
    options?: { mode: 'publish' | 'draft' }
  ) => void | Promise<void>;
  onCancel: () => void;
  userLocation: UserLocation;
  hasPreciseUserLocation?: boolean;
  initialData?: Deal | null;
  onDraftChange?: (draft: Deal) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onValidationChange?: (error: string) => void;
  showHeader?: boolean;
  showActions?: boolean;
  autofillRequest?: {
    id: number;
    payload: {
      storeName: string;
      websiteUrl: string;
      productUrl: string;
      affiliateUrl: string;
      cardImage?: string;
      imageUrl: string;
      detailImage?: string;
      detailImageUrl?: string;
      dealTitle: string;
      description: string;
      category: string;
      offerText: string;
      originalPrice?: string;
      currentPrice?: string;
    };
  } | null;
}

const BUSINESS_DEFAULTS_KEY = 'livedrop_business_defaults';
const CARD_IMAGE_TARGET_DATA_URL_LENGTH = 95_000;
const DETAIL_IMAGE_TARGET_DATA_URL_LENGTH = 125_000;
const FORM_SUBMIT_TIMEOUT_MS = 20_000;

type OfferType = 'percentage' | 'fixed' | 'custom';
type BusinessMode = 'local' | 'online';
type DealStatusTag = Exclude<(typeof DEAL_STATUS_FILTER_OPTIONS)[number]['id'], 'all'>;
const DEAL_STATUS_TAG_OPTIONS = DEAL_STATUS_FILTER_OPTIONS.filter((option) => option.id !== 'all');

const normalizeTextValue = (value: string | null | undefined) => (typeof value === 'string' ? value : '');
const pickCardImageValue = (deal?: Deal | null) =>
  normalizeTextValue(deal?.cardImageUrl) || normalizeTextValue(deal?.cardImage) || normalizeTextValue(deal?.imageUrl);
const pickDetailImageValue = (deal?: Deal | null) =>
  normalizeTextValue(deal?.detailImageUrl)
  || normalizeTextValue(deal?.detailImage)
  || normalizeTextValue(deal?.cardImageUrl)
  || normalizeTextValue(deal?.cardImage)
  || normalizeTextValue(deal?.imageUrl);
const CANONICAL_ICON_OPTIONS = getKnownDealIconNames();
const formatIconOptionLabel = (value: string) =>
  value
    .split('-')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
const normalizeCanonicalIconSelection = (value: string | null | undefined) => {
  const normalized = normalizeDealIconName(normalizeTextValue(value));
  return CANONICAL_ICON_OPTIONS.includes(normalized) ? normalized : '';
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Could not read selected image file.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read selected image file.'));
    reader.readAsDataURL(file);
  });

const loadImageElement = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not process selected image.'));
    image.src = dataUrl;
  });

const optimizeUploadedImage = async (
  file: File,
  options: { maxDimension: number; targetDataUrlLength: number },
) => {
  const rawDataUrl = await readFileAsDataUrl(file);

  if (!rawDataUrl.startsWith('data:image/')) {
    return rawDataUrl;
  }

  try {
    const image = await loadImageElement(rawDataUrl);
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight, 1);
    const initialScale = Math.min(1, options.maxDimension / longestSide);
    let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
    let height = Math.max(1, Math.round(image.naturalHeight * initialScale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      return rawDataUrl;
    }

    const qualitySteps = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42, 0.36, 0.32];
    let bestDataUrl = rawDataUrl;

    for (let dimensionAttempt = 0; dimensionAttempt < 12; dimensionAttempt += 1) {
      canvas.width = width;
      canvas.height = height;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      for (const quality of qualitySteps) {
        const webpDataUrl = canvas.toDataURL('image/webp', quality);
        if (webpDataUrl.length < bestDataUrl.length) {
          bestDataUrl = webpDataUrl;
        }
        if (webpDataUrl.length <= options.targetDataUrlLength) {
          return webpDataUrl;
        }
      }

      const nextWidth = Math.max(120, Math.round(width * 0.78));
      const nextHeight = Math.max(120, Math.round(height * 0.78));
      if (nextWidth === width && nextHeight === height) {
        break;
      }

      width = nextWidth;
      height = nextHeight;
    }

    if (bestDataUrl.length > options.targetDataUrlLength) {
      console.warn('[LiveDrop] Optimized image still above preferred storage threshold', {
        targetDataUrlLength: options.targetDataUrlLength,
        actualDataUrlLength: bestDataUrl.length,
      });
    }

    return bestDataUrl;
  } catch (error) {
    console.warn('[LiveDrop] Falling back to original image upload payload', error);
    return rawDataUrl;
  }
};
const normalizePriceInput = (value: string | null | undefined) => {
  const cleaned = normalizeTextValue(value).replace(/[^0-9.]/g, '').trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};
const formatPriceInput = (value?: number | null) => (
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : ''
);
const normalizeUrlValue = (value: string | null | undefined) => {
  const trimmed = normalizeTextValue(value).trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }

    return parsed.toString();
  } catch {
    return '';
  }
};

const deriveWebsiteOrigin = (value: string | null | undefined) => {
  const normalized = normalizeUrlValue(value);
  if (!normalized) return '';

  try {
    return new URL(normalized).origin;
  } catch {
    return '';
  }
};

const resolveFormLinkState = (formData: {
  websiteUrl: string;
  productUrl: string;
  affiliateUrl: string;
}) => {
  const productUrl = normalizeUrlValue(formData.productUrl);
  const affiliateUrl = normalizeUrlValue(formData.affiliateUrl);
  const websiteUrl =
    deriveWebsiteOrigin(formData.websiteUrl)
    || deriveWebsiteOrigin(productUrl)
    || deriveWebsiteOrigin(affiliateUrl);

  return {
    websiteUrl,
    productUrl,
    affiliateUrl,
  };
};

function readBusinessDefaults() {
  try {
    const raw = localStorage.getItem(BUSINESS_DEFAULTS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { businessName?: string; category?: string; businessMode?: BusinessMode } | null;
  } catch {
    return null;
  }
}

const getOfferTypeFromDeal = (deal: Deal): OfferType => {
  const trimmedOffer = normalizeTextValue(deal.offerText).trim();

  if (/%\s*OFF$/i.test(trimmedOffer)) return 'percentage';
  if (/^\$\d+(\.\d+)?\s*OFF$/i.test(trimmedOffer)) return 'fixed';
  return 'custom';
};

const getDiscountValueFromDeal = (deal: Deal) => {
  const trimmedOffer = normalizeTextValue(deal.offerText).trim();
  const percentageMatch = trimmedOffer.match(/^(\d+(\.\d+)?)\s*%\s*OFF$/i);
  if (percentageMatch) return percentageMatch[1];

  const fixedMatch = trimmedOffer.match(/^\$(\d+(\.\d+)?)\s*OFF$/i);
  if (fixedMatch) return fixedMatch[1];

  return '30';
};

const getOfferTypeFromText = (offerText?: string | null): OfferType => {
  const trimmedOffer = normalizeTextValue(offerText).trim();

  if (/%\s*OFF$/i.test(trimmedOffer)) return 'percentage';
  if (/^\$\d+(\.\d+)?\s*OFF$/i.test(trimmedOffer)) return 'fixed';
  return 'custom';
};

const getDiscountValueFromText = (offerText?: string | null) => {
  const trimmedOffer = normalizeTextValue(offerText).trim();
  const percentageMatch = trimmedOffer.match(/^(\d+(\.\d+)?)\s*%\s*OFF$/i);
  if (percentageMatch) return percentageMatch[1];

  const fixedMatch = trimmedOffer.match(/^\$(\d+(\.\d+)?)\s*OFF$/i);
  if (fixedMatch) return fixedMatch[1];

  return '30';
};

const getDiscountPercentFromPrices = (originalPrice?: number | null, currentPrice?: number | null) => {
  if (
    typeof originalPrice !== 'number'
    || typeof currentPrice !== 'number'
    || !Number.isFinite(originalPrice)
    || !Number.isFinite(currentPrice)
    || originalPrice <= 0
    || currentPrice < 0
    || currentPrice > originalPrice
  ) {
    return null;
  }

  return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
};

const getDurationFieldsFromDeal = (deal: Deal) => {
  if (deal.hasTimer === false) {
    return {
      durationPreset: 'none' as const,
      customDuration: '45',
    };
  }

  const durationMinutes = Math.max(
    1,
    Math.round((deal.expiresAt - deal.createdAt) / (60 * 1000)),
  );

  if (durationMinutes === 15 || durationMinutes === 30 || durationMinutes === 60) {
    return {
      durationPreset: String(durationMinutes) as '15' | '30' | '60',
      customDuration: String(durationMinutes),
    };
  }

  return {
    durationPreset: 'custom' as const,
    customDuration: String(durationMinutes),
  };
};

const getInitialFormData = (
  savedDefaults: ReturnType<typeof readBusinessDefaults>,
  initialData?: Deal | null,
) => {
  if (initialData) {
    const inferredOfferType = getOfferTypeFromDeal(initialData);
    const durationFields = getDurationFieldsFromDeal(initialData);
    const businessMode = (initialData.businessType ?? 'local') as BusinessMode;
    const inferredRadiusMiles = initialData.businessType === 'online'
      ? '1'
      : (() => {
          const radiusMatch = normalizeTextValue(initialData.distance).match(/(\d+(\.\d+)?)/);
          return radiusMatch?.[1] ?? '1';
        })();
    const linkState = resolveFormLinkState({
      websiteUrl: normalizeTextValue(initialData.websiteUrl),
      productUrl: normalizeTextValue(initialData.productUrl),
      affiliateUrl: normalizeTextValue(initialData.affiliateUrl),
    });

    const normalizedCategory = normalizeCategoryValue(initialData.category, businessMode, [
      initialData.title,
      initialData.description,
      initialData.businessName,
      initialData.offerText,
    ]);
    const normalizedOriginalPrice = typeof initialData.originalPrice === 'number'
      ? initialData.originalPrice
      : null;
    const normalizedCurrentPrice = typeof initialData.currentPrice === 'number'
      ? initialData.currentPrice
      : null;
    const inferredDiscountPercent = getDiscountPercentFromPrices(
      normalizedOriginalPrice,
      normalizedCurrentPrice,
    );
    const inferredDiscountValue = inferredDiscountPercent !== null
      ? String(inferredDiscountPercent)
      : getDiscountValueFromDeal(initialData);

    return {
      businessMode,
      businessName: normalizeTextValue(initialData.businessName),
      websiteUrl: linkState.websiteUrl,
      productUrl: linkState.productUrl,
      affiliateUrl: linkState.affiliateUrl,
      title: normalizeTextValue(initialData.title),
      description: normalizeTextValue(initialData.description),
      category: normalizedCategory,
      subcategory: '',
      statusTags: sanitizeDealStatusTags(initialData.statusTags),
      offerType: inferredOfferType,
      discountValue: inferredDiscountValue,
      customOfferText: inferredOfferType === 'custom' ? normalizeTextValue(initialData.offerText) : '',
      quantity: initialData.maxClaims,
      currentClaims: initialData.claimCount ?? initialData.currentClaims,
      durationPreset: durationFields.durationPreset,
      customDuration: durationFields.customDuration,
      radiusMiles: inferredRadiusMiles,
      boostDeal: false,
      iconName: normalizeCanonicalIconSelection(
        normalizeTextValue(initialData.iconName)
        || inferDealIconNameFromDealSignals({
          title: normalizeTextValue(initialData.title),
          businessName: normalizeTextValue(initialData.businessName),
          description: normalizeTextValue(initialData.description),
          category: normalizedCategory,
        })
        || pickCardImageValue(initialData),
      ),
      cardImageUrl: pickCardImageValue(initialData),
      detailImageUrl: pickDetailImageValue(initialData),
      originalPrice: formatPriceInput(normalizedOriginalPrice),
      currentPrice: formatPriceInput(normalizedCurrentPrice),
    };
  }

  const defaultBusinessMode = (savedDefaults?.businessMode ?? 'local') as BusinessMode;
  const defaultCategory = normalizeCategoryValue(savedDefaults?.category, defaultBusinessMode);

  return {
    businessMode: defaultBusinessMode,
    businessName: savedDefaults?.businessName ?? '',
    websiteUrl: '',
    productUrl: '',
    affiliateUrl: '',
    title: '',
    description: '',
    category: defaultCategory,
    subcategory: '',
    statusTags: [] as DealStatusTag[],
    offerType: 'percentage' as OfferType,
    discountValue: '30',
    customOfferText: '',
    quantity: 20,
    currentClaims: 0,
    durationPreset: '30' as '15' | '30' | '60' | 'custom' | 'none',
    customDuration: '45',
    radiusMiles: '1',
    boostDeal: false,
    iconName: '',
    cardImageUrl: '',
    detailImageUrl: '',
    originalPrice: '',
    currentPrice: '',
  };
};

export const CreateDealForm: React.FC<CreateDealFormProps> = ({
  onSubmit,
  onCancel,
  userLocation,
  hasPreciseUserLocation = false,
  initialData,
  onDraftChange,
  onDirtyChange,
  onValidationChange,
  showHeader = true,
  showActions = true,
  autofillRequest,
}) => {
  const savedDefaults = readBusinessDefaults();
  const [formData, setFormData] = useState(() => getInitialFormData(savedDefaults, initialData));
  const [submitError, setSubmitError] = useState<string>('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const safeLocalLocation = hasPreciseUserLocation ? userLocation : { lat: 0, lng: 0 };

  useEffect(() => {
    const nextFormData = getInitialFormData(readBusinessDefaults(), initialData);
    setFormData(nextFormData);
    setSubmitError('');

    console.info('[LiveDrop] CreateDealForm hydrated form state from initialData', {
      initialData,
      finalPortalFormState: nextFormData,
    });
  }, [initialData]);

  useEffect(() => {
    if (!autofillRequest) return;

    const nextOfferType = getOfferTypeFromText(autofillRequest.payload.offerText);
    const linkState = resolveFormLinkState({
      websiteUrl: autofillRequest.payload.websiteUrl,
      productUrl: autofillRequest.payload.productUrl,
      affiliateUrl: autofillRequest.payload.affiliateUrl,
    });

    setFormData((prev) => {
      const nextState = {
        ...prev,
        businessMode: 'online' as BusinessMode,
        businessName: normalizeTextValue(autofillRequest.payload.storeName),
        websiteUrl: linkState.websiteUrl,
        productUrl: linkState.productUrl,
        affiliateUrl: linkState.affiliateUrl,
        title: normalizeTextValue(autofillRequest.payload.dealTitle),
        description: normalizeTextValue(autofillRequest.payload.description),
        category: normalizeCategoryValue(autofillRequest.payload.category, 'online', [
          autofillRequest.payload.dealTitle,
          autofillRequest.payload.description,
          autofillRequest.payload.storeName,
          autofillRequest.payload.offerText,
        ]),
        offerType: nextOfferType,
        discountValue: getDiscountValueFromText(autofillRequest.payload.offerText),
        customOfferText: nextOfferType === 'custom' ? normalizeTextValue(autofillRequest.payload.offerText) : '',
        cardImageUrl:
          normalizeTextValue(autofillRequest.payload.cardImage)
          || normalizeTextValue(autofillRequest.payload.imageUrl),
        detailImageUrl:
          normalizeTextValue(autofillRequest.payload.detailImage)
          || normalizeTextValue(autofillRequest.payload.detailImageUrl)
          || normalizeTextValue(autofillRequest.payload.cardImage)
          || normalizeTextValue(autofillRequest.payload.imageUrl),
        originalPrice: normalizeTextValue(autofillRequest.payload.originalPrice) || prev.originalPrice,
        currentPrice: normalizeTextValue(autofillRequest.payload.currentPrice) || prev.currentPrice,
      };
      const normalizedCategory = normalizeCategoryValue(nextState.category, 'online', [
        nextState.title,
        nextState.description,
        nextState.businessName,
        nextState.customOfferText,
      ]);
      nextState.subcategory = '';
      nextState.statusTags = nextState.statusTags?.length ? nextState.statusTags : ['new-deals'];

      console.info('[LiveDrop] CreateDealForm applied autofill request', {
        autofillRequest,
        finalPortalFormState: nextState,
      });

      return nextState;
    });

    setSubmitError('');
  }, [autofillRequest]);

  useEffect(() => {
    if (normalizeCanonicalIconSelection(formData.iconName)) {
      return;
    }

    const inferredIconName = normalizeCanonicalIconSelection(
      inferDealIconNameFromDealSignals({
        title: normalizeTextValue(formData.title),
        businessName: normalizeTextValue(formData.businessName),
        description: normalizeTextValue(formData.description),
        category: normalizeTextValue(formData.category),
      })
      || normalizeTextValue(formData.cardImageUrl)
      || normalizeTextValue(formData.detailImageUrl),
    );

    if (!inferredIconName) {
      return;
    }

    setFormData((previous) => {
      if (normalizeCanonicalIconSelection(previous.iconName)) {
        return previous;
      }
      return { ...previous, iconName: inferredIconName };
    });
  }, [
    formData.iconName,
    formData.title,
    formData.businessName,
    formData.description,
    formData.category,
    formData.cardImageUrl,
    formData.detailImageUrl,
  ]);

  const durationMinutes = formData.durationPreset === 'custom'
    ? Number(formData.customDuration || 0)
    : formData.durationPreset === 'none'
      ? 7 * 24 * 60
      : Number(formData.durationPreset);

  const radiusMiles = Number(formData.radiusMiles || 0);
  const normalizedLinkState = useMemo(
    () => resolveFormLinkState(formData),
    [formData.affiliateUrl, formData.productUrl, formData.websiteUrl],
  );
  const normalizedCategory = useMemo(
    () => normalizeCategoryValue(formData.category, formData.businessMode, [
      formData.title,
      formData.description,
      formData.businessName,
      formData.customOfferText,
    ]),
    [formData.businessMode, formData.businessName, formData.category, formData.customOfferText, formData.description, formData.title],
  );
  const availableCategoryOptions = useMemo(
    () => getCategoryOptionsForMode(formData.businessMode),
    [formData.businessMode],
  );
  const selectedIconPreview = useMemo(
    () => resolveDealIcon(formData.iconName, normalizedCategory),
    [formData.iconName, normalizedCategory],
  );
  const normalizedStatusTags = useMemo(
    () => sanitizeDealStatusTags(formData.statusTags),
    [formData.statusTags],
  );
  const normalizedOriginalPrice = useMemo(
    () => normalizePriceInput(formData.originalPrice),
    [formData.originalPrice],
  );
  const normalizedCurrentPrice = useMemo(
    () => normalizePriceInput(formData.currentPrice),
    [formData.currentPrice],
  );
  const computedDiscountPercent = useMemo(
    () => getDiscountPercentFromPrices(normalizedOriginalPrice, normalizedCurrentPrice),
    [normalizedOriginalPrice, normalizedCurrentPrice],
  );
  const normalizedDiscountPercent = useMemo(() => {
    if (computedDiscountPercent !== null) return computedDiscountPercent;
    if (formData.offerType !== 'percentage') return null;
    const parsedValue = normalizePriceInput(formData.discountValue);
    if (parsedValue === null) return null;
    return Math.min(100, Math.max(0, Math.round(parsedValue)));
  }, [computedDiscountPercent, formData.discountValue, formData.offerType]);

  useEffect(() => {
    if (formData.offerType !== 'percentage' || computedDiscountPercent === null) {
      return;
    }

    const nextValue = String(computedDiscountPercent);
    if (formData.discountValue !== nextValue) {
      setFormData((prev) => ({ ...prev, discountValue: nextValue }));
    }
  }, [computedDiscountPercent, formData.discountValue, formData.offerType]);

  const offerText = useMemo(() => {
    if (formData.offerType === 'percentage') return `${formData.discountValue}% OFF`;
    if (formData.offerType === 'fixed') return `$${formData.discountValue} OFF`;
    return normalizeTextValue(formData.customOfferText).trim();
  }, [formData.offerType, formData.discountValue, formData.customOfferText]);

  const portalDraft: Deal = useMemo(() => {
    const safeRadius = Number.isFinite(radiusMiles) && radiusMiles > 0 ? radiusMiles : 1;
    const latOffset = safeRadius / 69;
    const isOnline = formData.businessMode === 'online';
    const createdAt = Date.now();

    return {
      id: initialData?.id ?? 'portal-draft',
      businessType: formData.businessMode,
      status: initialData?.status ?? 'draft',
      businessName: formData.businessName.trim(),
      title: formData.title.trim(),
      description: formData.description.trim(),
      offerText: offerText.trim(),
      currentPrice: normalizedCurrentPrice,
      originalPrice: normalizedOriginalPrice,
      discountPercent: normalizedDiscountPercent,
      affiliateUrl: normalizedLinkState.affiliateUrl || undefined,
      reviewCount: initialData?.reviewCount ?? null,
      stockStatus: initialData?.stockStatus ?? null,
      iconName: normalizeCanonicalIconSelection(
        formData.iconName
        || inferDealIconNameFromDealSignals({
          title: normalizeTextValue(formData.title),
          businessName: normalizeTextValue(formData.businessName),
          description: normalizeTextValue(formData.description),
          category: normalizedCategory,
        }),
      ) || undefined,
      cardImageUrl: normalizeTextValue(formData.cardImageUrl).trim() || undefined,
      cardImage: normalizeTextValue(formData.cardImageUrl).trim() || undefined,
      detailImageUrl:
        normalizeTextValue(formData.detailImageUrl).trim()
        || normalizeTextValue(formData.cardImageUrl).trim()
        || undefined,
      detailImage:
        normalizeTextValue(formData.detailImageUrl).trim()
        || normalizeTextValue(formData.cardImageUrl).trim()
        || undefined,
      imageUrl: normalizeTextValue(formData.cardImageUrl).trim() || undefined,
      websiteUrl: normalizedLinkState.websiteUrl || undefined,
      productUrl: normalizedLinkState.productUrl || undefined,
      hasTimer: formData.durationPreset !== 'none',
      distance: isOnline ? 'Online' : safeRadius > 0 ? `${safeRadius.toFixed(safeRadius >= 10 ? 0 : 1)} mi` : 'Nearby',
      lat: isOnline ? 0 : safeLocalLocation.lat + latOffset / 4,
      lng: isOnline ? 0 : safeLocalLocation.lng,
      createdAt,
      expiresAt: createdAt + Math.max(durationMinutes, 1) * 60 * 1000,
      maxClaims: Math.max(Number(formData.quantity || 0), 0),
      currentClaims: Math.max(Number(formData.currentClaims || 0), 0),
      claimCount: Math.max(Number(formData.currentClaims || 0), 0),
      category: normalizedCategory,
      statusTags: normalizedStatusTags,
    };
  }, [
    durationMinutes,
    formData.businessMode,
    formData.businessName,
    formData.category,
    formData.currentClaims,
    formData.description,
    formData.durationPreset,
    formData.iconName,
    formData.cardImageUrl,
    formData.detailImageUrl,
    formData.quantity,
    formData.statusTags,
    formData.title,
    initialData?.affiliateUrl,
    initialData?.id,
    initialData?.reviewCount,
    initialData?.status,
    initialData?.stockStatus,
    normalizedCurrentPrice,
    normalizedDiscountPercent,
    normalizedOriginalPrice,
    normalizedCategory,
    normalizedStatusTags,
    normalizedLinkState.affiliateUrl,
    normalizedLinkState.productUrl,
    normalizedLinkState.websiteUrl,
    offerText,
    radiusMiles,
    safeLocalLocation.lat,
    safeLocalLocation.lng,
  ]);

  useEffect(() => {
    onDraftChange?.(portalDraft);
  }, [onDraftChange, portalDraft]);

  const previewDeal: Deal = useMemo(() => {
    const safeRadius = Number.isFinite(radiusMiles) && radiusMiles > 0 ? radiusMiles : 1;
    const latOffset = safeRadius / 69;
    const isOnline = formData.businessMode === 'online';

    return {
      id: 'preview',
      businessType: formData.businessMode,
      businessName: normalizeTextValue(formData.businessName) || (isOnline ? 'Your Online Store' : 'Your Business'),
      title: normalizeTextValue(formData.title) || (isOnline ? 'Your online drop title' : 'Your Deal Title'),
      description: normalizeTextValue(formData.description) || 'Your deal description will appear here in the preview.',
      offerText: offerText || 'SPECIAL OFFER',
      iconName: normalizeCanonicalIconSelection(
        formData.iconName
        || inferDealIconNameFromDealSignals({
          title: normalizeTextValue(formData.title),
          businessName: normalizeTextValue(formData.businessName),
          description: normalizeTextValue(formData.description),
          category: normalizedCategory,
        }),
      ) || undefined,
      distance: isOnline ? 'Online' : `${safeRadius.toFixed(safeRadius >= 10 ? 0 : 1)} mi`,
      lat: isOnline ? 0 : safeLocalLocation.lat + latOffset / 4,
      lng: isOnline ? 0 : safeLocalLocation.lng,
      cardImageUrl: normalizeTextValue(formData.cardImageUrl) || undefined,
      cardImage: normalizeTextValue(formData.cardImageUrl) || undefined,
      detailImageUrl:
        normalizeTextValue(formData.detailImageUrl)
        || normalizeTextValue(formData.cardImageUrl)
        || undefined,
      detailImage:
        normalizeTextValue(formData.detailImageUrl)
        || normalizeTextValue(formData.cardImageUrl)
        || undefined,
      imageUrl: normalizeTextValue(formData.cardImageUrl) || undefined,
      websiteUrl: normalizedLinkState.websiteUrl || undefined,
      productUrl: normalizedLinkState.productUrl || undefined,
      affiliateUrl: normalizedLinkState.affiliateUrl || undefined,
      hasTimer: formData.durationPreset !== 'none',
      createdAt: Date.now(),
      expiresAt: Date.now() + Math.max(durationMinutes, 1) * 60 * 1000,
      maxClaims: Math.max(Number(formData.quantity || 0), 0),
      currentClaims: Math.max(Number(formData.currentClaims || 0), 0),
      claimCount: Math.max(Number(formData.currentClaims || 0), 0),
      category: normalizedCategory,
      statusTags: normalizedStatusTags,
      currentPrice: normalizedCurrentPrice,
      originalPrice: normalizedOriginalPrice,
      discountPercent: normalizedDiscountPercent,
    };
  }, [
    durationMinutes,
    formData.businessMode,
    formData.businessName,
    formData.category,
    formData.currentClaims,
    formData.description,
    formData.durationPreset,
    formData.iconName,
    formData.cardImageUrl,
    formData.detailImageUrl,
    formData.quantity,
    formData.statusTags,
    formData.title,
    normalizedCategory,
    normalizedCurrentPrice,
    normalizedDiscountPercent,
    normalizedStatusTags,
    normalizedLinkState.affiliateUrl,
    normalizedLinkState.productUrl,
    normalizedLinkState.websiteUrl,
    offerText,
    radiusMiles,
    safeLocalLocation.lat,
    safeLocalLocation.lng,
    normalizedOriginalPrice,
  ]);

  const getDraftFingerprint = () =>
    JSON.stringify({
      businessMode: formData.businessMode,
      businessName: normalizeTextValue(formData.businessName).trim(),
      websiteUrl: normalizeTextValue(formData.websiteUrl).trim(),
      productUrl: normalizeTextValue(formData.productUrl).trim(),
      affiliateUrl: normalizeTextValue(formData.affiliateUrl).trim(),
      title: normalizeTextValue(formData.title).trim(),
      description: normalizeTextValue(formData.description).trim(),
      category: normalizedCategory,
      statusTags: normalizedStatusTags,
      offerType: formData.offerType,
      discountValue: normalizeTextValue(formData.discountValue).trim(),
      customOfferText: normalizeTextValue(formData.customOfferText).trim(),
      originalPrice: normalizeTextValue(formData.originalPrice).trim(),
      currentPrice: normalizeTextValue(formData.currentPrice).trim(),
      quantity: String(formData.quantity ?? ''),
      currentClaims: String(formData.currentClaims ?? ''),
      durationPreset: formData.durationPreset,
      customDuration: normalizeTextValue(formData.customDuration).trim(),
      radiusMiles: normalizeTextValue(formData.radiusMiles).trim(),
      iconName: normalizeCanonicalIconSelection(formData.iconName),
      cardImageUrl: normalizeTextValue(formData.cardImageUrl).trim(),
      detailImageUrl: normalizeTextValue(formData.detailImageUrl).trim(),
    });

  const [initialFingerprint, setInitialFingerprint] = useState(getDraftFingerprint());

  useEffect(() => {
    const nextFingerprint = getDraftFingerprint();
    setInitialFingerprint(nextFingerprint);
    setIsDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  useEffect(() => {
    const dirty = getDraftFingerprint() !== initialFingerprint;
    setIsDirty(dirty);
    onDirtyChange?.(dirty);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, normalizedCategory, initialFingerprint, onDirtyChange]);

  useEffect(() => {
    if (!isDirty || typeof window === 'undefined') {
      return undefined;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = 'You have unsaved changes. Save before leaving?';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  const buildDealPayload = () => {
    const safeRadius = Number.isFinite(radiusMiles) && radiusMiles >= 0 ? radiusMiles : 0;
    const latOffset = safeRadius / 69;
    const isOnline = formData.businessMode === 'online';

    return {
      businessType: formData.businessMode,
      businessName: normalizeTextValue(formData.businessName).trim(),
      title: normalizeTextValue(formData.title).trim(),
      description: normalizeTextValue(formData.description).trim(),
      offerText,
      currentPrice: normalizedCurrentPrice,
      originalPrice: normalizedOriginalPrice,
      discountPercent: normalizedDiscountPercent,
      iconName: normalizeCanonicalIconSelection(
        formData.iconName
        || inferDealIconNameFromDealSignals({
          title: normalizeTextValue(formData.title),
          businessName: normalizeTextValue(formData.businessName),
          description: normalizeTextValue(formData.description),
          category: normalizedCategory,
        }),
      ) || undefined,
      cardImageUrl: normalizeTextValue(formData.cardImageUrl).trim() || undefined,
      cardImage: normalizeTextValue(formData.cardImageUrl).trim() || undefined,
      detailImageUrl:
        normalizeTextValue(formData.detailImageUrl).trim()
        || normalizeTextValue(formData.cardImageUrl).trim()
        || undefined,
      detailImage:
        normalizeTextValue(formData.detailImageUrl).trim()
        || normalizeTextValue(formData.cardImageUrl).trim()
        || undefined,
      imageUrl: normalizeTextValue(formData.cardImageUrl).trim() || undefined,
      websiteUrl: normalizedLinkState.websiteUrl || undefined,
      productUrl: normalizedLinkState.productUrl || undefined,
      affiliateUrl: normalizedLinkState.affiliateUrl || undefined,
      hasTimer: formData.durationPreset !== 'none',
      distance: isOnline ? 'Online' : safeRadius > 0 ? `${safeRadius.toFixed(safeRadius >= 10 ? 0 : 1)} mi` : 'Nearby',
      lat: isOnline ? 0 : safeLocalLocation.lat + latOffset / 4,
      lng: isOnline ? 0 : safeLocalLocation.lng,
      expiresAt: Date.now() + Math.max(durationMinutes, 1) * 60 * 1000,
      maxClaims: Number(formData.quantity),
      currentClaims: Number(formData.currentClaims),
      claimCount: Number(formData.currentClaims),
      category: normalizedCategory,
      statusTags: normalizedStatusTags,
      localSubcategory: undefined,
      onlineSubcategory: undefined,
      logoUrl: undefined,
    } as Omit<Deal, 'id' | 'createdAt'>;
  };

  const getPublishValidationError = () => {
    const originalPriceValue = normalizePriceInput(formData.originalPrice);
    const currentPriceValue = normalizePriceInput(formData.currentPrice);
    const normalizedSelectedIconName = normalizeCanonicalIconSelection(
      formData.iconName
      || inferDealIconNameFromDealSignals({
        title: normalizeTextValue(formData.title),
        businessName: normalizeTextValue(formData.businessName),
        description: normalizeTextValue(formData.description),
        category: normalizedCategory,
      }),
    );

    if (
      !normalizeTextValue(formData.businessName).trim() ||
      !normalizeTextValue(formData.title).trim() ||
      !normalizeTextValue(formData.description).trim()
    ) {
      return 'Please complete all required fields.';
    }

    if (!offerText) {
      return 'Please enter a valid offer.';
    }

    if (!normalizedCategory.trim()) {
      return 'Please choose a category.';
    }

    if (!normalizedSelectedIconName) {
      return 'Please select a card icon name.';
    }

    if ((formData.offerType === 'percentage' || formData.offerType === 'fixed') && Number(formData.discountValue) <= 0) {
      return 'Discount value must be greater than 0.';
    }

    if (normalizeTextValue(formData.originalPrice).trim() && originalPriceValue === null) {
      return 'Enter a valid original price.';
    }

    if (normalizeTextValue(formData.currentPrice).trim() && currentPriceValue === null) {
      return 'Enter a valid deal price.';
    }

    if (formData.businessMode === 'online') {
      if (!normalizedLinkState.websiteUrl || !normalizedLinkState.productUrl) {
        return 'Website URL and source product URL are required for online drops.';
      }
      if (!normalizeTextValue(formData.productUrl).trim() || !normalizedLinkState.productUrl) {
        return 'Paste a valid full product page URL for online drops.';
      }
      if (normalizeTextValue(formData.affiliateUrl).trim() && !normalizedLinkState.affiliateUrl) {
        return 'Paste a valid affiliate / outbound URL or leave that field blank.';
      }
      if (!normalizeTextValue(formData.cardImageUrl).trim()) {
        return 'Please upload a card image for online drops.';
      }
    }

    if (formData.businessMode === 'local' && !hasPreciseUserLocation) {
      return 'Enable location access before publishing a local drop so nearby users get the correct location.';
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return 'Please enter a valid duration.';
    }

    if (!Number.isFinite(Number(formData.quantity)) || Number(formData.quantity) <= 0) {
      return 'Quantity must be at least 1.';
    }

    if (!Number.isFinite(Number(formData.currentClaims)) || Number(formData.currentClaims) < 0) {
      return 'Current claims must be 0 or greater.';
    }

    if (Number(formData.currentClaims) > Number(formData.quantity)) {
      return 'Current claims cannot be greater than max claims.';
    }

    return '';
  };

  const publishValidationError = useMemo(() => getPublishValidationError(), [
    durationMinutes,
    formData.affiliateUrl,
    formData.businessMode,
    formData.businessName,
    formData.currentClaims,
    formData.customOfferText,
    formData.description,
    formData.discountValue,
    formData.durationPreset,
    formData.cardImageUrl,
    formData.detailImageUrl,
    formData.offerType,
    formData.productUrl,
    formData.quantity,
    formData.originalPrice,
    formData.currentPrice,
    formData.statusTags,
    formData.title,
    formData.websiteUrl,
    hasPreciseUserLocation,
    normalizedCategory,
    normalizedLinkState.affiliateUrl,
    normalizedLinkState.productUrl,
    normalizedLinkState.websiteUrl,
    offerText,
  ]);

  useEffect(() => {
    onValidationChange?.(publishValidationError);
  }, [onValidationChange, publishValidationError]);

  const finalizeSavedDefaults = () => {
    localStorage.setItem(BUSINESS_DEFAULTS_KEY, JSON.stringify({
      businessName: normalizeTextValue(formData.businessName).trim(),
      category: normalizedCategory,
      businessMode: formData.businessMode,
    }));
    const nextFingerprint = getDraftFingerprint();
    setInitialFingerprint(nextFingerprint);
    setIsDirty(false);
  };

  const submitWithTimeout = async (mode: 'publish' | 'draft') => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = globalThis.setTimeout(() => {
        reject(new Error('Save request timed out. Please try again.'));
      }, FORM_SUBMIT_TIMEOUT_MS);
    });

    try {
      await Promise.race([
        Promise.resolve(onSubmit(buildDealPayload(), { mode })),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    }
  };

  const handlePublish = async () => {
    setSubmitError('');
    const validationError = publishValidationError;
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setIsPublishing(true);
    try {
      await submitWithTimeout('publish');
      finalizeSavedDefaults();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not publish this deal right now.';
      setSubmitError(message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveDraft = async () => {
    setSubmitError('');
    setIsSavingDraft(true);
    try {
      await submitWithTimeout('draft');
      finalizeSavedDefaults();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save this draft right now.';
      setSubmitError(message);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleCancel = async () => {
    if (!isDirty) {
      onCancel();
      return;
    }

    const shouldSave = window.confirm('You have unsaved changes. Save before leaving?');
    if (shouldSave) {
      await handleSaveDraft();
      return;
    }

    onCancel();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!showActions) {
      return;
    }
    void handlePublish();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {showHeader ? (
        <>
          <div className="flex justify-between items-center mb-2">
            <div>
              <h2 className="text-2xl font-black">Drop a Deal</h2>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-[0.18em] mt-1">
                {initialData ? 'Review imported details before publishing' : 'Post in under 30 seconds'}
              </p>
            </div>
            <span className="text-zinc-400 text-xs font-bold uppercase tracking-[0.14em]">Editor</span>
          </div>

          {initialData ? (
            <div className="rounded-[1.75rem] border border-indigo-100 bg-indigo-50/60 px-4 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Portal Draft Loaded</p>
              <p className="mt-1 text-sm text-slate-600">
                This deal was loaded into the portal from imported JSON. Review the fields below, then publish when it looks right.
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="bg-white border border-slate-100 rounded-[2rem] p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <AppIcon name="spark" size={16} className="text-indigo-500" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Business Type</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { id: 'local', label: 'Local Business', icon: 'store' as const },
            { id: 'online', label: 'Online Business', icon: 'online' as const },
          ].map(option => {
            const active = formData.businessMode === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFormData(prev => ({
                  ...prev,
                  businessMode: option.id as BusinessMode,
                  category: normalizeCategoryValue(
                    prev.category,
                    option.id as BusinessMode,
                    [prev.title, prev.description, prev.businessName, prev.customOfferText],
                  ) || getDefaultCategoryForMode(option.id as BusinessMode),
                  subcategory: '',
                }))}
                className={`rounded-[1.5rem] border px-4 py-4 text-left transition-all ${
                  active
                    ? 'border-indigo-200 bg-indigo-50 shadow-sm'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <AppIcon name={option.icon} size={18} />
                  </div>
                  <div>
                    <p className={`text-sm font-black ${active ? 'text-indigo-700' : 'text-slate-800'}`}>{option.label}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {option.id === 'local' ? 'Nearby real-time offers' : 'Website and product-based drops'}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {formData.businessMode === 'local' && !hasPreciseUserLocation ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
          Enable location access to publish an accurate local deal.
        </div>
      ) : null}

      <div className="bg-white border border-slate-100 rounded-[2rem] p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <AppIcon name="spark" size={16} className="text-indigo-500" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Live Preview</p>
        </div>
        {formData.businessMode === 'local' ? (
          <DealCard deal={previewDeal} onClaim={() => {}} computedDistance={previewDeal.distance} />
        ) : (
          <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
            <div className="aspect-[16/10] bg-slate-100 overflow-hidden">
              {previewDeal.cardImageUrl || previewDeal.imageUrl ? (
                <img
                  src={getOptimizedDealImageUrl(previewDeal.cardImageUrl ?? previewDeal.imageUrl ?? '', { width: 720, fit: 'cover' })}
                  srcSet={getOptimizedDealImageSrcSet(previewDeal.cardImageUrl ?? previewDeal.imageUrl ?? '', { width: 720, fit: 'cover' })}
                  alt={previewDeal.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 text-slate-400">
                  <AppIcon name="image" size={32} />
                </div>
              )}
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">
                    <AppIcon name={getCategoryIconName(previewDeal.category)} size={12} />
                    {getCategoryLabel(previewDeal.category)}
                  </p>
                  <h3 className="text-lg font-black text-slate-900 mt-1">{previewDeal.title}</h3>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 mt-1">{previewDeal.businessName}</p>
                </div>
                {previewDeal.hasTimer ? (
                  <div className="rounded-2xl bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-rose-500">
                    {formData.durationPreset === 'custom' ? `${formData.customDuration || 0} min` : formData.durationPreset === 'none' ? 'No timer' : `${formData.durationPreset} min`}
                  </div>
                ) : null}
              </div>
              <p className="text-sm font-black text-indigo-600 mb-2">{previewDeal.offerText}</p>
              <p className="text-sm text-slate-500 leading-relaxed mb-4">{previewDeal.description}</p>
              <button type="button" className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-black text-white">
                View Deal
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4 bg-white border border-slate-100 rounded-[2rem] p-5 shadow-sm">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
            {formData.businessMode === 'online' ? 'Store Name' : 'Business Name'}
          </label>
          <div className="relative">
            <AppIcon name="tag" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              required
              type="text"
              placeholder={formData.businessMode === 'online' ? 'e.g. Glow Haus' : 'e.g. Pizza Palace'}
              className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
              value={formData.businessName}
              onChange={e => setFormData({ ...formData, businessName: e.target.value })}
            />
          </div>
        </div>

        {formData.businessMode === 'online' ? (
          <>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Website URL</label>
              <div className="relative">
                <AppIcon name="online" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  type="url"
                  placeholder="https://yourstore.com"
                  className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                  value={formData.websiteUrl}
                  onChange={e => setFormData({ ...formData, websiteUrl: e.target.value })}
                />
              </div>
              <p className="px-1 text-xs leading-5 text-slate-400">
                Store homepage. If left incomplete, LiveDrop will derive the origin from the product or affiliate URL.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Source Product URL</label>
              <div className="relative">
                <AppIcon name="link" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  required
                  type="url"
                  placeholder="https://www.amazon.com/dp/..."
                  className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                  value={formData.productUrl}
                  onChange={e => setFormData({ ...formData, productUrl: e.target.value })}
                />
              </div>
              <p className="px-1 text-xs leading-5 text-slate-400">
                Use the full product page URL here for import, reference, and product detail extraction.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Affiliate / Outbound Link</label>
              <div className="relative">
                <AppIcon name="external" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  type="url"
                  placeholder="https://amzn.to/... or another tracking link"
                  className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                  value={formData.affiliateUrl}
                  onChange={e => setFormData({ ...formData, affiliateUrl: e.target.value })}
                />
              </div>
              <p className="px-1 text-xs leading-5 text-slate-400">
                LiveDrop uses this link for Get Deal buttons, redirects, and commission tracking when it is provided.
              </p>
            </div>

          </>
        ) : null}

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Card Image</label>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50 px-4 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-indigo-500 shadow-sm">
              <AppIcon name="image" size={18} />
            </div>
            <div>
              <p className="text-sm font-black text-indigo-700">Choose card image</p>
              <p className="text-xs text-indigo-400 mt-1">
                {formData.cardImageUrl ? 'Card image ready for feed cards' : 'Shown on main deal cards (PNG, JPG, or WEBP)'}
              </p>
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (!file) return;
                void (async () => {
                  const optimizedDataUrl = await optimizeUploadedImage(file, {
                    maxDimension: 960,
                    targetDataUrlLength: CARD_IMAGE_TARGET_DATA_URL_LENGTH,
                  });
                  setFormData((prev) => ({ ...prev, cardImageUrl: optimizedDataUrl }));
                })();
              }}
            />
          </label>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Detail Image</label>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-sky-200 bg-sky-50 px-4 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sky-500 shadow-sm">
              <AppIcon name="image" size={18} />
            </div>
            <div>
              <p className="text-sm font-black text-sky-700">Choose detail image</p>
              <p className="text-xs text-sky-400 mt-1">
                {formData.detailImageUrl
                  ? 'Detail image ready for Product Details'
                  : 'Shown only inside Product Details'}
              </p>
            </div>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                if (!file) return;
                void (async () => {
                  const optimizedDataUrl = await optimizeUploadedImage(file, {
                    maxDimension: 1280,
                    targetDataUrlLength: DETAIL_IMAGE_TARGET_DATA_URL_LENGTH,
                  });
                  setFormData((prev) => ({ ...prev, detailImageUrl: optimizedDataUrl }));
                })();
              }}
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Deal Title</label>
          <div className="relative">
            <AppIcon name="info" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
            <input
              required
              type="text"
              placeholder={formData.businessMode === 'online' ? 'e.g. Weekend Product Drop' : 'e.g. Lunch Special'}
              className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
            Card Icon Name
          </label>
          <div className="relative">
            <AppIcon name="grid" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
            <select
              required
              className="w-full appearance-none bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-10 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
              value={normalizeCanonicalIconSelection(formData.iconName)}
              onChange={e => setFormData((previous) => ({ ...previous, iconName: normalizeCanonicalIconSelection(e.target.value) }))}
            >
              <option value="">Select card icon</option>
              {CANONICAL_ICON_OPTIONS.map((iconName) => (
                <option key={iconName} value={iconName}>
                  {formatIconOptionLabel(iconName)}
                </option>
              ))}
            </select>
          </div>
          {selectedIconPreview.normalizedIconName ? (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
              <div className="h-10 w-10 overflow-hidden rounded-lg bg-white/95">
                <picture>
                  {selectedIconPreview.primarySrc ? (
                    <source srcSet={selectedIconPreview.primarySrc} type="image/webp" />
                  ) : null}
                  <img
                    src={selectedIconPreview.fallbackSrc || selectedIconPreview.primarySrc}
                    alt={`${selectedIconPreview.normalizedIconName} icon preview`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain p-1"
                  />
                </picture>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-indigo-500">Selected Icon</p>
                <p className="truncate text-xs font-semibold text-slate-600">{formatIconOptionLabel(selectedIconPreview.normalizedIconName)}</p>
              </div>
            </div>
          ) : null}
          <p className="px-1 text-xs leading-5 text-slate-400">
            Stored per deal and resolved from the icon registry in <code>src/assets/category-icons</code> (prefers <code>.webp</code>, then <code>.png</code>).
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Discount / Deal</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'percentage', label: 'Percentage' },
              { id: 'fixed', label: 'Fixed' },
              { id: 'custom', label: 'Custom Text' },
            ].map(type => (
              <button
                key={type.id}
                type="button"
                onClick={() => setFormData({ ...formData, offerType: type.id as OfferType })}
                className={`py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  formData.offerType === type.id
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                    : 'bg-slate-50 text-slate-500'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
          {formData.offerType === 'custom' ? (
            <input
              required
              type="text"
              placeholder={formData.businessMode === 'online' ? 'e.g. Free shipping today' : 'e.g. $2 LATTES'}
              className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-4 text-indigo-600 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all font-black text-lg"
              value={formData.customOfferText}
              onChange={e => setFormData({ ...formData, customOfferText: e.target.value })}
            />
          ) : (
            <input
              required
              type="number"
              min="1"
              placeholder={formData.offerType === 'percentage' ? '30' : '5'}
              className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-4 text-indigo-600 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all font-black text-lg"
              value={formData.discountValue}
              onChange={e => setFormData({ ...formData, discountValue: e.target.value })}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Pricing</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="relative">
                <AppIcon name="tag" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Original price"
                  className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                  value={formData.originalPrice}
                  onChange={e => setFormData({ ...formData, originalPrice: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="relative">
                <AppIcon name="deal" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Deal price"
                  className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                  value={formData.currentPrice}
                  onChange={e => setFormData({ ...formData, currentPrice: e.target.value })}
                />
              </div>
            </div>
          </div>
          <p className="px-1 text-xs leading-5 text-slate-400">
            Add both prices to auto-calculate the discount percentage for the card badge.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Deal Description</label>
          <textarea
            required
            placeholder={formData.businessMode === 'online' ? 'Describe the online drop, what the buyer gets, and why it matters.' : 'Tell customers why they should claim this...'}
            className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all min-h-[100px]"
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Quantity</label>
            <div className="relative">
              <AppIcon name="users" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                required
                type="number"
                min="1"
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                value={formData.quantity}
                onChange={e => setFormData({ ...formData, quantity: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Current Claims</label>
            <div className="relative">
              <AppIcon name="trending" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                type="number"
                min="0"
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                value={formData.currentClaims}
                onChange={e => setFormData({ ...formData, currentClaims: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {formData.businessMode === 'local' ? (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Radius</label>
              <select
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                value={formData.radiusMiles}
                onChange={e => setFormData({ ...formData, radiusMiles: e.target.value })}
              >
                <option value="0">Nearby Only</option>
                <option value="1">1 mile</option>
                <option value="3">3 miles</option>
                <option value="5">5 miles</option>
                <option value="10">10 miles</option>
              </select>
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
            {formData.businessMode === 'online' ? 'Optional Timer' : 'Duration'}
          </label>
          <div className={`grid gap-2 ${formData.businessMode === 'online' ? 'grid-cols-5' : 'grid-cols-4'}`}>
            {[
              { id: '15', label: '15 min' },
              { id: '30', label: '30 min' },
              { id: '60', label: '1 hour' },
              ...(formData.businessMode === 'online' ? [{ id: 'none', label: 'No timer' }] : []),
              { id: 'custom', label: 'Custom' },
            ].map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFormData({ ...formData, durationPreset: option.id as typeof formData.durationPreset })}
                className={`py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  formData.durationPreset === option.id
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'
                    : 'bg-slate-50 text-slate-500'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {formData.durationPreset === 'custom' ? (
            <div className="relative">
              <AppIcon name="clock" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                required
                type="number"
                min="1"
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                value={formData.customDuration}
                onChange={e => setFormData({ ...formData, customDuration: e.target.value })}
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Category</label>
          <select
            required
            className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
            value={normalizedCategory}
            onChange={e => setFormData({ ...formData, category: e.target.value, subcategory: '' })}
          >
            <option value="">Select category</option>
            {availableCategoryOptions.map(option => (
              <option key={option} value={option}>
                {getCategoryLabel(option)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Deal Status Tags</label>
          <div className="flex flex-wrap gap-2">
            {DEAL_STATUS_TAG_OPTIONS.map((option) => {
              const isActive = normalizedStatusTags.includes(option.id as DealStatusTag);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    const nextTag = option.id as DealStatusTag;
                    setFormData((previous) => {
                      const currentTags = sanitizeDealStatusTags(previous.statusTags);
                      const hasTag = currentTags.includes(nextTag);
                      return {
                        ...previous,
                        statusTags: hasTag
                          ? currentTags.filter((value) => value !== nextTag)
                          : [...currentTags, nextTag],
                      };
                    });
                  }}
                  className={`inline-flex h-10 items-center rounded-xl border px-3 text-[10px] font-black uppercase tracking-[0.11em] transition-all ${
                    isActive
                      ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                  }`}
                >
                  {getDealStatusFilterLabel(option.id)}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400">
            Choose one or more tags. These power the universal filters: New Deals, Popular, Best Deals, Leaving Soon.
          </p>
        </div>

        <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Boost Deal</p>
            <p className="text-xs text-slate-500 mt-1">Reserved for future monetization</p>
          </div>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, boostDeal: !formData.boostDeal })}
            className={`h-8 w-14 rounded-full transition-all ${formData.boostDeal ? 'bg-indigo-600' : 'bg-slate-200'}`}
          >
            <span className={`block h-6 w-6 rounded-full bg-white transition-transform ${formData.boostDeal ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </label>
      </div>

      {submitError ? (
        <p className="text-sm font-semibold text-rose-500">{submitError}</p>
      ) : null}

      {showActions ? (
        <div className="sticky bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-20 rounded-[1.5rem] border border-slate-200 bg-white/95 p-2 shadow-xl shadow-slate-200/70 backdrop-blur">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={isSavingDraft || isPublishing}
              className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingDraft ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              type="submit"
              disabled={isSavingDraft || isPublishing}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-indigo-600 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPublishing ? 'Publishing…' : 'Publish Deal'}
            </button>
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={isSavingDraft || isPublishing}
              className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </form>
  );
};
