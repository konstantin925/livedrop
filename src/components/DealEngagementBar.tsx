import React from 'react';
import { Deal } from '../types';
import { AppIcon } from './AppIcon';

export type DealEngagementAction = 'like' | 'dislike' | 'share';

interface DealEngagementBarProps {
  deal: Deal;
  pendingAction?: DealEngagementAction | null;
  compact?: boolean;
  onLike: (deal: Deal) => void;
  onDislike: (deal: Deal) => void;
  onShare: (deal: Deal) => void;
}

const countFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 0,
});

const formatCount = (value?: number) => countFormatter.format(Math.max(0, value ?? 0));

export const DealEngagementBar: React.FC<DealEngagementBarProps> = ({
  deal,
  pendingAction = null,
  compact = false,
  onLike,
  onDislike,
  onShare,
}) => {
  const actions: Array<{
    id: DealEngagementAction;
    label: string;
    icon: 'like' | 'dislike' | 'share';
    count: number;
    onClick: () => void;
    tone: string;
  }> = [
    {
      id: 'like',
      label: 'Like',
      icon: 'like',
      count: deal.likeCount ?? 0,
      onClick: () => onLike(deal),
      tone: 'hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600',
    },
    {
      id: 'dislike',
      label: 'Dislike',
      icon: 'dislike',
      count: deal.dislikeCount ?? 0,
      onClick: () => onDislike(deal),
      tone: 'hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500',
    },
    {
      id: 'share',
      label: 'Share',
      icon: 'share',
      count: deal.shareCount ?? 0,
      onClick: () => onShare(deal),
      tone: 'hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600',
    },
  ];

  const buttonHeight = compact ? 'h-8' : 'h-[2.2rem]';
  const buttonText = compact ? 'text-[9px]' : 'text-[10px]';
  const padding = compact ? 'px-2' : 'px-2.5';

  return (
    <div className={`grid grid-cols-3 gap-1.5 ${compact ? 'mt-2' : 'mt-2.5'}`}>
      {actions.map((action) => {
        const isPending = pendingAction === action.id;
        return (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            disabled={isPending}
            aria-label={`${action.label} deal`}
            className={`inline-flex ${buttonHeight} items-center justify-center gap-1.5 rounded-[0.95rem] border border-slate-200 bg-slate-50/80 ${padding} ${buttonText} font-black uppercase tracking-[0.08em] text-slate-500 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${action.tone} ${isPending ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : ''}`}
          >
            <AppIcon name={action.icon} size={11} />
            {!compact ? <span className="hidden min-[360px]:inline">{action.label}</span> : null}
            <span className="text-slate-400 tabular-nums">{formatCount(action.count)}</span>
          </button>
        );
      })}
    </div>
  );
};
