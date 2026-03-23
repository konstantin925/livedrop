import React, { useEffect, useMemo, useState } from 'react';
import { AppIcon } from './AppIcon';

interface CompanyLogoProps {
  businessName?: string;
  logoUrl?: string;
  size?: number;
  category?: string;
}

const CATEGORY_PALETTES: Record<string, {
  bg: string;
  ring: string;
  border: string;
  overlay: string;
  text: string;
  icon: string;
  shadow: string;
}> = {
  Coffee: {
    bg: 'from-violet-100 via-fuchsia-100 to-purple-200',
    ring: 'ring-purple-100/80',
    border: 'border-white/70',
    overlay: 'to-purple-200/25',
    text: 'text-slate-950',
    icon: 'text-purple-700',
    shadow: 'shadow-[0_10px_24px_rgba(124,58,237,0.16)]',
  },
  'Fast Food': {
    bg: 'from-orange-100 via-amber-100 to-orange-200',
    ring: 'ring-orange-100/80',
    border: 'border-white/70',
    overlay: 'to-orange-200/25',
    text: 'text-slate-950',
    icon: 'text-orange-700',
    shadow: 'shadow-[0_10px_24px_rgba(249,115,22,0.16)]',
  },
  Fitness: {
    bg: 'from-sky-100 via-blue-100 to-indigo-200',
    ring: 'ring-blue-100/80',
    border: 'border-white/70',
    overlay: 'to-blue-200/25',
    text: 'text-slate-950',
    icon: 'text-blue-700',
    shadow: 'shadow-[0_10px_24px_rgba(59,130,246,0.16)]',
  },
  Pet: {
    bg: 'from-emerald-100 via-green-100 to-lime-200',
    ring: 'ring-emerald-100/80',
    border: 'border-white/70',
    overlay: 'to-emerald-200/25',
    text: 'text-slate-950',
    icon: 'text-emerald-700',
    shadow: 'shadow-[0_10px_24px_rgba(16,185,129,0.16)]',
  },
  Home: {
    bg: 'from-slate-100 via-zinc-100 to-violet-100',
    ring: 'ring-slate-200/80',
    border: 'border-white/70',
    overlay: 'to-violet-200/20',
    text: 'text-slate-950',
    icon: 'text-slate-700',
    shadow: 'shadow-[0_10px_24px_rgba(100,116,139,0.14)]',
  },
  Beauty: {
    bg: 'from-rose-100 via-pink-100 to-fuchsia-200',
    ring: 'ring-pink-100/80',
    border: 'border-white/70',
    overlay: 'to-pink-200/25',
    text: 'text-slate-950',
    icon: 'text-pink-700',
    shadow: 'shadow-[0_10px_24px_rgba(236,72,153,0.16)]',
  },
};

function getInitials(name?: string): string {
  const parts = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return '';
  return parts.map(part => part.charAt(0).toUpperCase()).join('');
}

export const CompanyLogo: React.FC<CompanyLogoProps> = ({ businessName, logoUrl, size = 44, category }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = useMemo(() => getInitials(businessName), [businessName]);
  const normalizedLogoUrl = useMemo(
    () => (typeof logoUrl === 'string' ? logoUrl.trim() : ''),
    [logoUrl],
  );
  const showImage = Boolean(normalizedLogoUrl) && !imageFailed;
  const label = businessName?.trim() || 'Business';
  const palette = useMemo(() => {
    return CATEGORY_PALETTES[category ?? ''] ?? {
      bg: 'from-indigo-100 via-violet-100 to-indigo-200',
      ring: 'ring-indigo-100/70',
      border: 'border-white/70',
      overlay: 'to-indigo-200/25',
      text: 'text-slate-950',
      icon: 'text-slate-700',
      shadow: 'shadow-[0_10px_24px_rgba(79,70,229,0.16)]',
    };
  }, [category]);

  useEffect(() => {
    setImageFailed(false);
  }, [normalizedLogoUrl]);

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[1rem] border ${palette.border} bg-gradient-to-br ${palette.bg} flex items-center justify-center ${palette.shadow} ring-1 ${palette.ring}`}
      style={{ width: size, height: size }}
      aria-label={`${label} logo`}
    >
      {showImage ? (
        <img
          src={normalizedLogoUrl}
          alt={`${label} logo`}
          className="h-full w-full bg-white/90 object-contain p-[12%]"
          onError={() => setImageFailed(true)}
        />
      ) : initials ? (
        <>
          <div className={`absolute inset-[1px] rounded-[0.88rem] bg-gradient-to-br from-white/35 via-transparent ${palette.overlay} pointer-events-none`} />
          <div className="absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] pointer-events-none" />
          <span
            className={`relative ${palette.text} font-black tracking-[-0.06em]`}
            style={{ fontSize: Math.max(14, Math.floor(size * 0.34)) }}
          >
            {initials}
          </span>
        </>
      ) : (
        <>
          <div className={`absolute inset-[1px] rounded-[0.88rem] bg-gradient-to-br from-white/35 via-transparent ${palette.overlay} pointer-events-none`} />
          <div className="absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] pointer-events-none" />
          <AppIcon name="store" size={Math.floor(size * 0.38)} className={`relative ${palette.icon}`} />
        </>
      )}
    </div>
  );
};
