import React, { useState } from 'react';
import { Deal, UserLocation } from '../types';
import { Plus, Clock, Users, MapPin, Tag, Info, Navigation } from 'lucide-react';

interface CreateDealFormProps {
  onSubmit: (deal: Omit<Deal, 'id' | 'createdAt' | 'currentClaims'>) => void;
  onCancel: () => void;
  userLocation: UserLocation;
}

export const CreateDealForm: React.FC<CreateDealFormProps> = ({ onSubmit, onCancel, userLocation }) => {
  const [formData, setFormData] = useState({
    businessName: '',
    title: '',
    description: '',
    offerText: '',
    durationMinutes: 30,
    maxClaims: 20,
    distance: '0.1 miles',
    lat: userLocation.lat,
    lng: userLocation.lng,
    category: 'Food & Drink'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      createdAt: Date.now(),
      expiresAt: Date.now() + formData.durationMinutes * 60 * 1000
    });
  };

  const setDemoLocation = (lat: number, lng: number, label: string) => {
    setFormData({ ...formData, lat, lng, distance: label });
  };

  const useCurrentLocation = () => {
    setFormData({ ...formData, lat: userLocation.lat, lng: userLocation.lng, distance: 'Current Location' });
  };

  const setOffsetLocation = (miles: number) => {
    // Rough approximation for demo
    const latOffset = (miles / 69) * (Math.random() > 0.5 ? 1 : -1);
    const lngOffset = (miles / (69 * Math.cos(userLocation.lat * Math.PI / 180))) * (Math.random() > 0.5 ? 1 : -1);
    
    setFormData({ 
      ...formData, 
      lat: userLocation.lat + latOffset, 
      lng: userLocation.lng + lngOffset, 
      distance: `${miles} miles away` 
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-2xl font-black">Drop a Deal</h2>
        <button type="button" onClick={onCancel} className="text-zinc-500 text-sm font-bold uppercase">Cancel</button>
      </div>

      <div className="space-y-4">
        {/* ... existing fields ... */}
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
          <input
            required
            type="text"
            placeholder="e.g. 50% OFF ALL PIZZAS"
            className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-4 text-indigo-600 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all font-black text-lg"
            value={formData.offerText}
            onChange={e => setFormData({ ...formData, offerText: e.target.value })}
          />
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
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Duration (Mins)</label>
            <div className="relative">
              <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                required
                type="number"
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                value={formData.durationMinutes}
                onChange={e => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Max Claims</label>
            <div className="relative">
              <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                required
                type="number"
                className="w-full bg-white border border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-slate-900 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all"
                value={formData.maxClaims}
                onChange={e => setFormData({ ...formData, maxClaims: parseInt(e.target.value) })}
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Location Coordinates</label>
          <div className="grid grid-cols-2 gap-4">
            <input
              required
              type="number"
              step="any"
              placeholder="Lat"
              className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-4 text-slate-900 focus:border-indigo-500 outline-none transition-all"
              value={formData.lat}
              onChange={e => setFormData({ ...formData, lat: parseFloat(e.target.value) })}
            />
            <input
              required
              type="number"
              step="any"
              placeholder="Lng"
              className="w-full bg-white border border-slate-200 rounded-2xl py-4 px-4 text-slate-900 focus:border-indigo-500 outline-none transition-all"
              value={formData.lng}
              onChange={e => setFormData({ ...formData, lng: parseFloat(e.target.value) })}
            />
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <button 
              type="button" 
              onClick={useCurrentLocation}
              className="flex items-center gap-1 text-[10px] bg-indigo-50 px-2 py-1 rounded-full font-bold text-indigo-600 border border-indigo-100"
            >
              <Navigation size={10} />
              Use My Location
            </button>
            <button 
              type="button" 
              onClick={() => setOffsetLocation(0.5)}
              className="text-[10px] bg-slate-100 px-2 py-1 rounded-full font-bold text-slate-500"
            >
              +0.5 mi
            </button>
            <button 
              type="button" 
              onClick={() => setOffsetLocation(2)}
              className="text-[10px] bg-slate-100 px-2 py-1 rounded-full font-bold text-slate-500"
            >
              +2 mi
            </button>
            <button 
              type="button" 
              onClick={() => setOffsetLocation(10)}
              className="text-[10px] bg-slate-100 px-2 py-1 rounded-full font-bold text-slate-500"
            >
              +10 mi
            </button>
          </div>
        </div>
      </div>

      <button
        type="submit"
        className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2"
      >
        <Plus size={24} />
        DROP DEAL NOW
      </button>
    </form>
  );
};
