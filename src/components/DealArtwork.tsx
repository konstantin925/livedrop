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
  preferredWidth?: number;
  sizes?: string;
  fetchPriority?: 'high' | 'low' | 'auto';
}

const failedImageSrcCache = new Set<string>();

export const DealArtwork = React.memo(({
  src,
  alt,
  fit = 'contain',
  iconSize = 28,
  className = '',
  imageClassName = '',
  fallbackClassName = '',
  preferredWidth,
  sizes,
  fetchPriority = 'low',
}: DealArtworkProps) => {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const normalizedSrc = useMemo(
    () => (typeof src === 'string' ? src.trim() : ''),
    [src],
  );
  const optimizedSrc = useMemo(() => {
    if (!normalizedSrc) return '';
    const width = preferredWidth ?? 900;
    const supabasePublicPath = '/storage/v1/object/public/';
    const supabaseRenderPath = '/storage/v1/render/image/public/';
    if (normalizedSrc.includes(supabaseRenderPath)) {
      const separator = normalizedSrc.includes('?') ? '&' : '?';
      return `${normalizedSrc}${separator}width=${width}&quality=72&resize=contain`;
    }
    if (normalizedSrc.includes(supabasePublicPath)) {
      const transformed = normalizedSrc.replace(supabasePublicPath, supabaseRenderPath);
      const separator = transformed.includes('?') ? '&' : '?';
      return `${transformed}${separator}width=${width}&quality=72&resize=contain`;
    }
    if (normalizedSrc.includes('images.unsplash.com')) {
      try {
        const url = new URL(normalizedSrc);
        url.searchParams.set('w', String(width));
        url.searchParams.set('q', '70');
        url.searchParams.set('auto', 'format');
        url.searchParams.set('fit', 'crop');
        return url.toString();
      } catch {
        return normalizedSrc;
      }
    }
    return normalizedSrc;
  }, [normalizedSrc, preferredWidth]);
  const optimizedSrcSet = useMemo(() => {
    if (!optimizedSrc || !preferredWidth) return undefined;
    const highWidth = Math.round(preferredWidth * 1.6);
    if (optimizedSrc.includes('width=')) {
      return `${optimizedSrc} 1x, ${optimizedSrc.replace(/width=\d+/i, `width=${highWidth}`)} 2x`;
    }
    if (optimizedSrc.includes('w=')) {
      return `${optimizedSrc} 1x, ${optimizedSrc.replace(/w=\d+/i, `w=${highWidth}`)} 2x`;
    }
    return undefined;
  }, [optimizedSrc, preferredWidth]);
  const showImage = Boolean(normalizedSrc) && !imageFailed;

  useEffect(() => {
    setImageFailed(Boolean(normalizedSrc) && failedImageSrcCache.has(normalizedSrc));
    setImageLoaded(false);
  }, [normalizedSrc]);

  return (
    <div className={`h-full w-full ${className}`}>
      {showImage ? (
        <div className={`relative h-full w-full ${imageLoaded ? '' : 'overflow-hidden'}`}>
          {!imageLoaded ? (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-white to-indigo-50" />
          ) : null}
          <img
            src={optimizedSrc || normalizedSrc}
            srcSet={optimizedSrcSet}
            sizes={sizes}
            alt={alt}
            loading={fetchPriority === 'high' ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={fetchPriority}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              if (normalizedSrc) {
                failedImageSrcCache.add(normalizedSrc);
              }
              setImageFailed(true);
            }}
            className={`h-full w-full transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'} ${fit === 'contain' ? 'bg-white object-contain' : 'object-cover'} ${imageClassName}`}
          />
        </div>
      ) : (
        <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 text-slate-300 ${fallbackClassName}`}>
          <AppIcon name="deal" size={iconSize} />
        </div>
      )}
    </div>
  );
});

DealArtwork.displayName = 'DealArtwork';
