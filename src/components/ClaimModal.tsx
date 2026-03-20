import React, { useState } from 'react';
import { Deal, Claim } from '../types';
import { X, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ClaimModalProps {
  deal: Deal | null;
  onClose: () => void;
  onConfirm: (deal: Deal) => Claim;
}

export const ClaimModal: React.FC<ClaimModalProps> = ({ deal, onClose, onConfirm }) => {
  const [claim, setClaim] = useState<Claim | null>(null);

  if (!deal) return null;

  const handleConfirm = () => {
    const newClaim = onConfirm(deal);
    setClaim(newClaim);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />
        
        <motion.div 
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          className="relative w-full max-w-sm bg-white border border-slate-100 rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl"
        >
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 text-slate-300 hover:text-slate-600 transition-colors"
          >
            <X size={24} />
          </button>

          {!claim ? (
            <div className="text-center">
              <h2 className="text-2xl font-black mb-2 text-slate-900">Claim this deal?</h2>
              <p className="text-slate-500 text-sm mb-8">
                You're about to claim <span className="text-indigo-600 font-bold">{deal.offerText}</span> at <span className="text-slate-900 font-bold">{deal.businessName}</span>.
              </p>
              
              <div className="bg-indigo-50 rounded-3xl p-6 mb-8 border border-indigo-100/50">
                <p className="text-[10px] text-indigo-400 uppercase font-black tracking-widest mb-1">Expires in</p>
                <p className="text-indigo-600 font-mono text-2xl font-black">
                  {Math.floor((deal.expiresAt - Date.now()) / 60000)} minutes
                </p>
              </div>

              <button
                onClick={handleConfirm}
                className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200"
              >
                YES, CLAIM IT!
              </button>
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="flex justify-center mb-6">
                <div className="bg-emerald-50 p-6 rounded-full">
                  <CheckCircle2 size={56} className="text-emerald-500" />
                </div>
              </div>
              <h2 className="text-2xl font-black mb-2 text-emerald-600">Success!</h2>
              <p className="text-slate-500 text-sm mb-6">
                Your deal is claimed. Show this code to the business to redeem.
              </p>
              
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col items-center justify-center gap-2 mb-8">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Your Claim Code</p>
                <p className="text-3xl font-mono font-black tracking-[0.4em] text-indigo-600">
                  {claim.claimCode}
                </p>
              </div>

              <button
                onClick={onClose}
                className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
              >
                AWESOME
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
