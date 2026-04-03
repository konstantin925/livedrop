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
    icon: 'thumbs-up' | 'thumbs-down' | 'share';
    count: number;
    onClick: () => void;
    tone: string;
  }> = [
    {
      id: 'like',
      label: 'Like',
      icon: 'thumbs-up',
      count: deal.likeCount ?? 0,
      onClick: () => onLike(deal),
      tone: 'hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600',
    },
    {
      id: 'dislike',
      label: 'Dislike',
      icon: 'thumbs-down',
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

  const buttonHeight = compact ? 'h-8.5' : 'h-10';
  const buttonText = compact ? 'text-[8px]' : 'text-[9px]';
  const padding = compact ? 'px-2' : 'px-2.5';

  return (
    <div className={`grid grid-cols-3 gap-1.5 max-[359px]:gap-1 ${compact ? 'mt-2' : 'mt-3'}`}>
      {actions.map((action) => {
        const isPending = pendingAction === action.id;
        return (
          <button
            key={action.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              action.onClick();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
            disabled={isPending}
            aria-label={`${action.label} deal`}
            className={`inline-flex ${buttonHeight} min-w-0 w-full items-center justify-center gap-1 rounded-[1rem] border border-slate-200/90 bg-white/92 ${padding} ${buttonText} font-black uppercase tracking-[0.06em] text-slate-500 shadow-sm shadow-slate-200/25 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${action.tone} ${isPending ? 'border-indigo-200 bg-indigo-50 text-indigo-600 shadow-indigo-100/60' : ''}`}
          >
            <AppIcon name={action.icon} size={11} />
            <span className={`shrink-0 tabular-nums ${compact ? 'text-slate-400/90' : 'text-slate-400'}`}>{formatCount(action.count)}</span>
          </button>
        );
      })}
    </div>
  );
};
