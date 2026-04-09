import React, { useEffect, useMemo, useState } from 'react';
import { AppIcon } from './AppIcon';
import { getOptimizedDealImageSrcSet, getOptimizedDealImageUrl } from '../utils/dealImages';

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
    return getOptimizedDealImageUrl(normalizedSrc, { width: preferredWidth, fit });
  }, [fit, normalizedSrc, preferredWidth]);
  const optimizedSrcSet = useMemo(() => {
    return getOptimizedDealImageSrcSet(normalizedSrc, { width: preferredWidth, fit });
  }, [fit, normalizedSrc, preferredWidth]);
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
            loading="lazy"
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
