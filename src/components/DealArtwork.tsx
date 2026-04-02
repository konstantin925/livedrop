import React, { useEffect, useMemo, useState } from 'react';
import { AppIcon } from './AppIcon';

interface DealArtworkProps {
  src?: string | null;
  alt: string;
  fit?: 'contain' | 'cover';
  iconSize?: number;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
}

const failedImageSrcCache = new Set<string>();

export const DealArtwork: React.FC<DealArtworkProps> = ({
  src,
  alt,
  fit = 'contain',
  iconSize = 28,
  className = '',
  imageClassName = '',
  fallbackClassName = '',
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const normalizedSrc = useMemo(
    () => (typeof src === 'string' ? src.trim() : ''),
    [src],
  );
  const optimizedSrc = useMemo(() => {
    if (!normalizedSrc) return '';
    const supabasePublicPath = '/storage/v1/object/public/';
    const supabaseRenderPath = '/storage/v1/render/image/public/';
    if (normalizedSrc.includes(supabaseRenderPath)) return normalizedSrc;
    if (normalizedSrc.includes(supabasePublicPath)) {
      const transformed = normalizedSrc.replace(supabasePublicPath, supabaseRenderPath);
      const separator = transformed.includes('?') ? '&' : '?';
      return `${transformed}${separator}width=900&quality=75&resize=contain`;
    }
    return normalizedSrc;
  }, [normalizedSrc]);
  const showImage = Boolean(normalizedSrc) && !imageFailed;

  useEffect(() => {
    setImageFailed(Boolean(normalizedSrc) && failedImageSrcCache.has(normalizedSrc));
  }, [normalizedSrc]);

  return (
    <div className={`h-full w-full ${className}`}>
      {showImage ? (
        <img
          src={optimizedSrc || normalizedSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => {
            if (normalizedSrc) {
              failedImageSrcCache.add(normalizedSrc);
            }
            setImageFailed(true);
          }}
          className={`h-full w-full ${fit === 'contain' ? 'bg-white object-contain' : 'object-cover'} ${imageClassName}`}
        />
      ) : (
        <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 text-slate-300 ${fallbackClassName}`}>
          <AppIcon name="deal" size={iconSize} />
        </div>
      )}
    </div>
  );
};
