import React, { useMemo, useState } from 'react';
import { Deal, UserLocation } from '../types';
import { CATEGORY_OPTIONS, ONLINE_CATEGORY_OPTIONS } from '../constants';
import { getCategoryIconName, getCategoryLabel } from '../utils/categories';
import { DealCard } from './DealCard';
import { AppIcon } from './AppIcon';

interface CreateDealFormProps {
  onSubmit: (deal: Omit<Deal, 'id' | 'createdAt' | 'currentClaims'>) => void;
  onCancel: () => void;
  userLocation: UserLocation;
}

const BUSINESS_DEFAULTS_KEY = 'livedrop_business_defaults';

type OfferType = 'percentage' | 'fixed' | 'custom';
type BusinessMode = 'local' | 'online';

function readBusinessDefaults() {
  try {
    const raw = localStorage.getItem(BUSINESS_DEFAULTS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { businessName?: string; category?: string; businessMode?: BusinessMode } | null;
  } catch {
    return null;
  }
}

export const CreateDealForm: React.FC<CreateDealFormProps> = ({ onSubmit, onCancel, userLocation }) => {
  const savedDefaults = readBusinessDefaults();
  const [formData, setFormData] = useState({
    businessMode: savedDefaults?.businessMode ?? 'local' as BusinessMode,
    businessName: savedDefaults?.businessName ?? '',
    websiteUrl: '',
    productUrl: '',
    title: '',
    description: '',
    category: savedDefaults?.category ?? 'Fast Food',
    offerType: 'percentage' as OfferType,
    discountValue: '30',
    customOfferText: '',
    quantity: 20,
    durationPreset: '30' as '15' | '30' | '60' | 'custom' | 'none',
    customDuration: '45',
    radiusMiles: '1',
    boostDeal: false,
    imageUrl: '',
  });
  const [submitError, setSubmitError] = useState<string>('');

  const durationMinutes = formData.durationPreset === 'custom'
    ? Number(formData.customDuration || 0)
    : formData.durationPreset === 'none'
      ? 7 * 24 * 60
      : Number(formData.durationPreset);

  const radiusMiles = Number(formData.radiusMiles || 0);

  const offerText = useMemo(() => {
    if (formData.offerType === 'percentage') return `${formData.discountValue}% OFF`;
    if (formData.offerType === 'fixed') return `$${formData.discountValue} OFF`;
    return formData.customOfferText.trim();
  }, [formData.offerType, formData.discountValue, formData.customOfferText]);

  const previewDeal: Deal = useMemo(() => {
    const safeRadius = Number.isFinite(radiusMiles) && radiusMiles > 0 ? radiusMiles : 1;
    const latOffset = safeRadius / 69;
    const isOnline = formData.businessMode === 'online';

    return {
      id: 'preview',
      businessType: formData.businessMode,
      businessName: formData.businessName || (isOnline ? 'Your Online Store' : 'Your Business'),
      title: formData.title || (isOnline ? 'Your online drop title' : 'Your Deal Title'),
      description: formData.description || 'Your deal description will appear here in the preview.',
      offerText: offerText || 'SPECIAL OFFER',
      distance: isOnline ? 'Online' : `${safeRadius.toFixed(safeRadius >= 10 ? 0 : 1)} mi`,
      lat: isOnline ? 0 : userLocation.lat + latOffset / 4,
      lng: isOnline ? 0 : userLocation.lng,
      imageUrl: formData.imageUrl || undefined,
      websiteUrl: formData.websiteUrl.trim() || undefined,
      productUrl: formData.productUrl.trim() || undefined,
      hasTimer: formData.durationPreset !== 'none',
      createdAt: Date.now(),
      expiresAt: Date.now() + Math.max(durationMinutes, 1) * 60 * 1000,
      maxClaims: Math.max(Number(formData.quantity || 0), 0),
      currentClaims: 0,
      claimCount: 0,
      category: formData.category,
    };
  }, [
    durationMinutes,
    formData.businessMode,
    formData.businessName,
    formData.category,
    formData.description,
    formData.durationPreset,
    formData.imageUrl,
    formData.productUrl,
    formData.quantity,
    formData.title,
    formData.websiteUrl,
    offerText,
    radiusMiles,
    userLocation.lat,
    userLocation.lng,
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!formData.businessName.trim() || !formData.title.trim() || !formData.description.trim()) {
      setSubmitError('Please complete all required fields.');
      return;
    }

    if (!offerText) {
      setSubmitError('Please enter a valid offer.');
      return;
    }

    if ((formData.offerType === 'percentage' || formData.offerType === 'fixed') && Number(formData.discountValue) <= 0) {
      setSubmitError('Discount value must be greater than 0.');
      return;
    }

    if (formData.businessMode === 'online') {
      if (!formData.websiteUrl.trim() || !formData.productUrl.trim()) {
        setSubmitError('Website URL and product link are required for online drops.');
        return;
      }
      if (!formData.imageUrl.trim()) {
        setSubmitError('Please upload a product image for online drops.');
        return;
      }
    }

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      setSubmitError('Please enter a valid duration.');
      return;
    }

    if (!Number.isFinite(Number(formData.quantity)) || Number(formData.quantity) <= 0) {
      setSubmitError('Quantity must be at least 1.');
      return;
    }

    const safeRadius = Number.isFinite(radiusMiles) && radiusMiles >= 0 ? radiusMiles : 0;
    const latOffset = safeRadius / 69;
    const isOnline = formData.businessMode === 'online';

    onSubmit({
      businessType: formData.businessMode,
      businessName: formData.businessName.trim(),
      title: formData.title.trim(),
      description: formData.description.trim(),
      offerText,
      imageUrl: formData.imageUrl.trim() || undefined,
      websiteUrl: formData.websiteUrl.trim() || undefined,
      productUrl: formData.productUrl.trim() || undefined,
      hasTimer: formData.durationPreset !== 'none',
      distance: isOnline ? 'Online' : safeRadius > 0 ? `${safeRadius.toFixed(safeRadius >= 10 ? 0 : 1)} mi` : 'Nearby',
      lat: isOnline ? 0 : userLocation.lat + latOffset / 4,
      lng: isOnline ? 0 : userLocation.lng,
      expiresAt: Date.now() + durationMinutes * 60 * 1000,
      maxClaims: Number(formData.quantity),
      claimCount: 0,
      category: formData.category,
      logoUrl: undefined,
    });

    localStorage.setItem(BUSINESS_DEFAULTS_KEY, JSON.stringify({
      businessName: formData.businessName.trim(),
      category: formData.category,
      businessMode: formData.businessMode,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h2 className="text-2xl font-black">Drop a Deal</h2>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-[0.18em] mt-1">Post in under 30 seconds</p>
        </div>
        <button type="button" onClick={onCancel} className="text-zinc-500 text-sm font-bold uppercase">Cancel</button>
      </div>

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
                  category: option.id === 'online' ? 'Tech' : 'Fast Food',
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
              {previewDeal.imageUrl ? (
                <img src={previewDeal.imageUrl} alt={previewDeal.title} className="h-full w-full object-cover" />
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
                  required
                  type="url"
                  placeholder="https://yourstore.com"
                  className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                  value={formData.websiteUrl}
                  onChange={e => setFormData({ ...formData, websiteUrl: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Product Link</label>
              <div className="relative">
                <AppIcon name="link" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  required
                  type="url"
                  placeholder="https://yourstore.com/product"
                  className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                  value={formData.productUrl}
                  onChange={e => setFormData({ ...formData, productUrl: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Upload Image</label>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50 px-4 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-indigo-500 shadow-sm">
                  <AppIcon name="image" size={18} />
                </div>
                <div>
                  <p className="text-sm font-black text-indigo-700">Choose product image</p>
                  <p className="text-xs text-indigo-400 mt-1">{formData.imageUrl ? 'Image ready for this online drop' : 'PNG, JPG, or WEBP'}</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        setFormData(prev => ({ ...prev, imageUrl: reader.result }));
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
          </>
        ) : null}

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
          ) : (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Category</label>
              <select
                required
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
              >
                {ONLINE_CATEGORY_OPTIONS.filter(option => option !== 'All').map(option => (
                  <option key={option} value={option}>
                    {getCategoryLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          )}
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

        {formData.businessMode === 'local' ? (
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Category</label>
            <select
              required
              className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
              value={formData.category}
              onChange={e => setFormData({ ...formData, category: e.target.value })}
            >
              {CATEGORY_OPTIONS.filter(option => option !== 'All').map(option => (
                <option key={option} value={option}>
                  {getCategoryLabel(option)}
                </option>
              ))}
            </select>
          </div>
        ) : null}

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

      <button
        type="submit"
        className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2"
      >
        <AppIcon name="plus" size={24} />
        Drop Deal
      </button>
    </form>
  );
};
