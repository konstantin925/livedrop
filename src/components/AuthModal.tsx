import React from 'react';
import { X, Chrome, ShieldCheck, Mail } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueWithGoogle: () => void;
  onEmailAuth: (payload: { mode: 'signin' | 'signup'; email: string; password: string; fullName?: string }) => void;
  loading?: boolean;
  error?: string;
  info?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onContinueWithGoogle,
  onEmailAuth,
  loading = false,
  error,
  info,
}) => {
  const [mode, setMode] = React.useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-[2rem] border border-slate-100 bg-white p-8 shadow-2xl shadow-slate-300">
        <button onClick={onClose} className="absolute top-5 right-5 text-slate-300 hover:text-slate-600">
          <X size={22} />
        </button>

        <div className="mb-6">
          <div className="w-14 h-14 rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-5">
            <ShieldCheck size={26} />
          </div>
          <h2 className="text-2xl font-black text-slate-900">Sign in to LiveDrop</h2>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Save your claims, catalog coupons, notifications, and preferences across sessions and devices.
          </p>
        </div>

        <button
          onClick={onContinueWithGoogle}
          disabled={loading}
          className="w-full py-4 rounded-2xl bg-white border border-slate-200 text-slate-900 font-black text-sm flex items-center justify-center gap-3 hover:border-indigo-200 hover:bg-indigo-50 transition-all"
        >
          <Chrome size={18} />
          {loading ? 'Connecting...' : 'Continue with Google'}
        </button>

        <div className="flex items-center gap-3 my-5">
          <div className="h-px flex-1 bg-slate-100" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">or use email</span>
          <div className="h-px flex-1 bg-slate-100" />
        </div>

        <div className="flex rounded-2xl bg-slate-100 p-1 mb-4">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`flex-1 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider transition-colors ${
              mode === 'signin' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`flex-1 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider transition-colors ${
              mode === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'
            }`}
          >
            Sign Up
          </button>
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            onEmailAuth({
              mode,
              email,
              password,
              fullName: mode === 'signup' ? fullName : undefined,
            });
          }}
        >
          {mode === 'signup' ? (
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Full name"
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-300"
            />
          ) : null}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email address"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-300"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-300"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-slate-950 text-white font-black text-sm flex items-center justify-center gap-3 hover:bg-slate-800 transition-all disabled:opacity-60"
          >
            <Mail size={18} />
            {loading ? 'Saving...' : mode === 'signin' ? 'Continue with Email' : 'Create Account'}
          </button>
        </form>

        {info ? <p className="text-sm text-emerald-600 mt-4">{info}</p> : null}
        {error ? <p className="text-sm text-rose-500 mt-3">{error}</p> : null}
      </div>
    </div>
  );
};
