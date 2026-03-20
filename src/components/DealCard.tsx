import React, { useState } from 'react';
import { Deal } from '../types';
import { Timer } from './Timer';
import { MapPin, Users } from 'lucide-react';
import { isUrgent } from '../utils/time';

interface DealCardProps {
  deal: Deal;
  onClaim: (deal: Deal) => void;
  isClaimed?: boolean;
  computedDistance?: string;
}

export const DealCard: React.FC<DealCardProps> = ({ deal, onClaim, isClaimed = false, computedDistance }) => {
  const [isExpired, setIsExpired] = useState(deal.expiresAt <= Date.now());
  
  const isSoldOut = deal.currentClaims >= deal.maxClaims;
  const canClaim = !isExpired && !isSoldOut && !isClaimed;

  // Handle expiration in real-time
  const handleExpire = () => {
    setIsExpired(true);
  };

  return (
    <div className={`bg-white border ${isUrgent(deal.expiresAt) && !isExpired ? 'border-rose-200 ring-1 ring-rose-100' : 'border-slate-100'} rounded-3xl p-6 mb-4 shadow-sm hover:shadow-md transition-all active:scale-[0.98]`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">{deal.businessName}</h3>
          <h2 className="text-slate-900 text-xl font-black leading-tight">{deal.title}</h2>
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
          {isSoldOut ? 'Sold Out' : `${deal.maxClaims - deal.currentClaims} left`}
        </div>
      </div>

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
    </div>
  );
};
