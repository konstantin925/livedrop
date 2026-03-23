import React, { useEffect, useState } from 'react';
import { Deal, Claim } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { copyTextToClipboard, ClipboardCopyResult } from '../utils/clipboard';
import { AppIcon } from './AppIcon';

interface ClaimModalProps {
  deal: Deal | null;
  onClose: () => void;
  onConfirm: (deal: Deal) => Claim;
  onViewClaims: () => void;
}

export const ClaimModal: React.FC<ClaimModalProps> = ({ deal, onClose, onConfirm, onViewClaims }) => {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [copyStatus, setCopyStatus] = useState<ClipboardCopyResult | null>(null);
  const [claimError, setClaimError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setClaim(null);
    setCopyStatus(null);
    setClaimError('');
    setIsSubmitting(false);
  }, [deal]);

  if (!deal) return null;

  const handleCopyCode = async (claimCode: string) => {
    const result = await copyTextToClipboard(claimCode);
    setCopyStatus(result);
  };

  const handleConfirm = () => {
    if (isSubmitting) {
      return;
    }

    setClaimError('');
    setIsSubmitting(true);

    try {
      const newClaim = onConfirm(deal);
      setClaim(newClaim);
      void handleCopyCode(newClaim.claimCode);
    } catch (error) {
      setClaimError(error instanceof Error ? error.message : 'Could not claim this deal right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const expiresInMinutes = Math.max(
    0,
    Math.floor(((Number.isFinite(deal.expiresAt) ? deal.expiresAt : Date.now()) - Date.now()) / 60000),
  );

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
          className="relative max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-t-[2.5rem] border border-slate-100 bg-white p-8 shadow-2xl sm:rounded-[2.5rem]"
        >
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 text-slate-300 hover:text-slate-600 transition-colors"
          >
            <AppIcon name="close" size={24} />
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
                  {expiresInMinutes} minutes
                </p>
              </div>

              {claimError ? (
                <div className="mb-5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-700">{claimError}</p>
                </div>
              ) : null}

              <button
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'CLAIMING...' : 'YES, CLAIM IT!'}
              </button>
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="flex justify-center mb-6">
                <div className="bg-emerald-50 p-6 rounded-full">
                  <AppIcon name="check" size={56} className="text-emerald-500" strokeWidth={2.2} />
                </div>
              </div>
              <h2 className="text-2xl font-black mb-2 text-emerald-600">Success!</h2>
              <p className="text-slate-500 text-sm mb-6">
                Your deal is claimed.
              </p>
              
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col items-center justify-center gap-2 mb-8">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Your Claim Code</p>
                <p className="text-3xl font-mono font-black tracking-[0.4em] text-indigo-600">
                  {claim.claimCode}
                </p>
                {copyStatus === 'success' ? (
                  <>
                    <p className="text-sm font-semibold text-emerald-600 text-center">Claim code copied</p>
                    <p className="text-xs text-slate-500 text-center">
                      Your claim code has been copied to your clipboard.
                      Show this code at the business to redeem your deal.
                    </p>
                  </>
                ) : (
                  <>
                    {copyStatus === 'error' && (
                      <p className="text-xs font-semibold text-amber-600 text-center">Could not copy automatically. Tap to copy.</p>
                    )}
                    <p className="text-xs text-slate-500 text-center">Show this code at the business to redeem your deal.</p>
                  </>
                )}
                <button
                  onClick={() => void handleCopyCode(claim.claimCode)}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-600 transition-colors hover:bg-indigo-100"
                >
                  <AppIcon name="deal" size={16} />
                  Copy Code
                </button>
              </div>

              <div className="space-y-3">
                <button
                  onClick={onViewClaims}
                  className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2"
                >
                  <AppIcon name="claims" size={18} />
                  VIEW MY CLAIMS
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-4 bg-slate-100 text-slate-700 rounded-2xl font-black text-sm hover:bg-slate-200 transition-all"
                >
                  CLOSE
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
