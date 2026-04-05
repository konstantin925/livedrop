import React from 'react';
import brandBoltLogo3d from '../assets/bolt-3d.png';

type DealEmptyStateProps = {
  variant: 'loading' | 'empty';
  title: string;
  subtitle: string;
};

export const DealEmptyState = ({ variant, title, subtitle }: DealEmptyStateProps) => {
  const isLoading = variant === 'loading';

  return (
    <div className="mx-auto w-full max-w-[620px] rounded-[1.8rem] border border-sky-100/70 bg-white px-6 py-10 text-center shadow-sm shadow-slate-200/30 min-h-[260px]">
      <div className="relative mx-auto mb-4 h-16 w-16">
        <div className="absolute inset-0 rounded-full bg-sky-200/35 blur-2xl" />
        <div className="absolute -inset-2 rounded-full border border-sky-200/60 animate-[spin_6s_linear_infinite]" />
        <div className="absolute -inset-1 rounded-full border border-sky-200/80" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-white via-sky-50 to-white shadow-[0_16px_30px_rgba(56,189,248,0.25)]">
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.85),rgba(255,255,255,0)_60%)]" />
          <div className="absolute inset-0 rounded-full border border-sky-200/70" />
          <img
            src={brandBoltLogo3d}
            alt="LiveDrop"
            className={`relative z-10 h-12 w-12 object-contain drop-shadow-[0_12px_26px_rgba(56,189,248,0.55)] ${
              isLoading ? 'animate-[pulse_2.4s_ease-in-out_infinite]' : ''
            }`}
          />
        </div>
      </div>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-600">
        {title}
      </p>
      <p className="mt-2 text-sm text-slate-500">
        {subtitle}
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        {[0, 1, 2].map((index) => (
          <span
            key={`deal-empty-dot-${index}`}
            className={`h-2 w-2 rounded-full ${
              isLoading ? 'bg-sky-400/70 animate-bounce' : 'bg-sky-200'
            }`}
            style={isLoading ? { animationDelay: `${index * 120}ms` } : undefined}
          />
        ))}
      </div>
    </div>
  );
};
