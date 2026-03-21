import React from 'react';
import { AppIcon } from './AppIcon';

interface BusinessPaywallProps {
  isAuthenticated: boolean;
  loading?: boolean;
  message?: string;
  onSubscribe: () => void;
  onSignIn: () => void;
}

export const BusinessPaywall: React.FC<BusinessPaywallProps> = ({
  isAuthenticated,
  loading = false,
  message,
  onSubscribe,
  onSignIn,
}) => {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-100 rounded-[2.5rem] p-8 shadow-sm">
        <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 text-white flex items-center justify-center shadow-xl shadow-indigo-100 mb-6">
          <AppIcon name="portal" size={28} />
        </div>
        <h2 className="text-2xl font-black text-slate-950">Start Business Access</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          Drop live deals, attract nearby customers, and manage offers in real time.
        </p>

        <div className="mt-6 rounded-[2rem] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-violet-50 to-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-500">Business Monthly</p>
              <h3 className="mt-2 text-xl font-black text-slate-950">Full Business Portal Access</h3>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black tracking-[-0.04em] text-slate-950">$29</p>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-[0.18em]">per month</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <AppIcon name="check" size={16} className="text-indigo-500 shrink-0" />
              Create and manage live local deals
            </div>
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <AppIcon name="check" size={16} className="text-indigo-500 shrink-0" />
              Reach nearby customers instantly
            </div>
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <AppIcon name="check" size={16} className="text-indigo-500 shrink-0" />
              Ready for more plans and upgrades later
            </div>
          </div>
        </div>

        {message ? (
          <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-700">{message}</p>
          </div>
        ) : null}

        {isAuthenticated ? (
          <button
            onClick={onSubscribe}
            disabled={loading}
            className="mt-6 w-full py-5 rounded-[2rem] bg-slate-950 text-white font-black text-base shadow-2xl shadow-slate-200 hover:bg-slate-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Opening Checkout...' : 'Subscribe Now'}
          </button>
        ) : (
          <button
            onClick={onSignIn}
            className="mt-6 w-full py-5 rounded-[2rem] bg-slate-950 text-white font-black text-base shadow-2xl shadow-slate-200 hover:bg-slate-800 transition-all"
          >
            Continue with Google
          </button>
        )}

        <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-slate-400 uppercase tracking-[0.18em]">
          <AppIcon name="spark" size={14} className="text-indigo-400" />
          Clean setup, one app, business tools unlocked after subscription
        </div>
      </div>
    </div>
  );
};
