import React from 'react';

interface DealCardSkeletonProps {
  compact?: boolean;
}

export const DealCardSkeleton: React.FC<DealCardSkeletonProps> = ({ compact = false }) => {
  if (compact) {
    return (
      <div className="overflow-hidden rounded-[1.3rem] border border-slate-100 bg-white p-2.5 shadow-sm shadow-slate-200/30">
        <div className="animate-pulse space-y-2">
          <div className="flex items-start gap-2.5">
            <div className="h-9 w-9 rounded-full bg-slate-200/80" />
            <div className="flex-1 space-y-2">
              <div className="h-2 w-1/3 rounded-full bg-slate-200/80" />
              <div className="h-3.5 w-3/4 rounded-full bg-slate-200/80" />
              <div className="h-3 w-2/3 rounded-full bg-slate-200/70" />
            </div>
          </div>
          <div className="h-8 w-full rounded-full bg-slate-200/80" />
          <div className="flex gap-2">
            <div className="h-7 flex-1 rounded-full bg-slate-200/80" />
            <div className="h-7 flex-1 rounded-full bg-slate-200/80" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white p-3 shadow-[0_12px_28px_rgba(148,163,184,0.14)] max-[640px]:shadow-[0_8px_16px_rgba(148,163,184,0.1)]">
      <div className="animate-pulse space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-slate-200/80" />
          <div className="flex-1 space-y-2">
            <div className="h-2.5 w-1/3 rounded-full bg-slate-200/80" />
            <div className="h-4 w-4/5 rounded-full bg-slate-200/80" />
            <div className="h-3 w-1/2 rounded-full bg-slate-200/70" />
          </div>
          <div className="h-6 w-12 rounded-full bg-slate-200/70" />
        </div>
        <div className="h-24 w-full rounded-[1rem] bg-slate-200/70" />
        <div className="space-y-2">
          <div className="h-3 w-full rounded-full bg-slate-200/70" />
          <div className="h-3 w-4/5 rounded-full bg-slate-200/70" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="h-8 rounded-full bg-slate-200/80" />
          <div className="h-8 rounded-full bg-slate-200/80" />
        </div>
        <div className="space-y-2">
          <div className="h-10 w-full rounded-[1rem] bg-slate-200/80" />
          <div className="h-10 w-full rounded-[1rem] bg-slate-200/70" />
        </div>
      </div>
    </div>
  );
};
