import React, { useMemo, useState } from 'react';
import { Deal, UserLocation } from '../types';
import { Plus, Clock, Users, Tag, Info, Sparkles } from 'lucide-react';
import { CATEGORY_OPTIONS } from '../constants';
import { getCategoryLabel } from '../utils/categories';
import { DealCard } from './DealCard';

interface CreateDealFormProps {
  onSubmit: (deal: Omit<Deal, 'id' | 'createdAt' | 'currentClaims'>) => void;
  onCancel: () => void;
  userLocation: UserLocation;
}

const BUSINESS_DEFAULTS_KEY = 'livedrop_business_defaults';

type OfferType = 'percentage' | 'fixed' | 'custom';

function readBusinessDefaults() {
  try {
    const raw = localStorage.getItem(BUSINESS_DEFAULTS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { businessName?: string; category?: string } | null;
  } catch {
    return null;
  }
}

export const CreateDealForm: React.FC<CreateDealFormProps> = ({ onSubmit, onCancel, userLocation }) => {
  const savedDefaults = readBusinessDefaults();
  const [formData, setFormData] = useState({
    businessName: savedDefaults?.businessName ?? '',
    title: '',
    description: '',
    category: savedDefaults?.category ?? 'Fast Food',
    offerType: 'percentage' as OfferType,
    discountValue: '30',
    customOfferText: '',
    quantity: 20,
    durationPreset: '30' as '15' | '30' | '60' | 'custom',
    customDuration: '45',
    radiusMiles: '1',
    boostDeal: false,
  });
  const [submitError, setSubmitError] = useState<string>('');

  const durationMinutes = formData.durationPreset === 'custom'
    ? Number(formData.customDuration || 0)
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

    return {
      id: 'preview',
      businessName: formData.businessName || 'Your Business',
      title: formData.title || 'Your Deal Title',
      description: formData.description || 'Your deal description will appear here in the live feed preview.',
      offerText: offerText || 'SPECIAL OFFER',
      distance: `${safeRadius.toFixed(safeRadius >= 10 ? 0 : 1)} mi`,
      lat: userLocation.lat + latOffset / 4,
      lng: userLocation.lng,
      createdAt: Date.now(),
      expiresAt: Date.now() + Math.max(durationMinutes, 1) * 60 * 1000,
      maxClaims: Math.max(Number(formData.quantity || 0), 0),
      currentClaims: 0,
      claimCount: 0,
      category: formData.category,
    };
  }, [durationMinutes, formData.businessName, formData.category, formData.description, formData.quantity, formData.title, offerText, radiusMiles, userLocation.lat, userLocation.lng]);

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

    onSubmit({
      businessName: formData.businessName.trim(),
      title: formData.title.trim(),
      description: formData.description.trim(),
      offerText,
      distance: safeRadius > 0 ? `${safeRadius.toFixed(safeRadius >= 10 ? 0 : 1)} mi` : 'Nearby',
      lat: userLocation.lat + latOffset / 4,
      lng: userLocation.lng,
      expiresAt: Date.now() + durationMinutes * 60 * 1000,
      maxClaims: Number(formData.quantity),
      claimCount: 0,
      category: formData.category,
      logoUrl: undefined,
    });

    localStorage.setItem(BUSINESS_DEFAULTS_KEY, JSON.stringify({
      businessName: formData.businessName.trim(),
      category: formData.category,
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
          <Sparkles size={16} className="text-indigo-500" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500">Live Preview</p>
        </div>
        <DealCard deal={previewDeal} onClaim={() => {}} computedDistance={previewDeal.distance} />
      </div>

      <div className="space-y-4 bg-white border border-slate-100 rounded-[2rem] p-5 shadow-sm">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Business Name</label>
          <div className="relative">
            <Tag className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input
              required
              type="text"
              placeholder="e.g. Pizza Palace"
              className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
              value={formData.businessName}
              onChange={e => setFormData({ ...formData, businessName: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Deal Title</label>
          <div className="relative">
            <Info className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
            <input
              required
              type="text"
              placeholder="e.g. Lunch Special"
              className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Offer Text (Big & Bold)</label>
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
              placeholder="e.g. $2 LATTES"
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
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Description</label>
          <textarea
            required
            placeholder="Tell customers why they should claim this..."
            className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all min-h-[100px]"
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Quantity</label>
            <div className="relative">
              <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
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
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Duration</label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { id: '15', label: '15 min' },
              { id: '30', label: '30 min' },
              { id: '60', label: '1 hour' },
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
              <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
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
        <Plus size={24} />
        Drop Deal
      </button>
    </form>
  );
};
