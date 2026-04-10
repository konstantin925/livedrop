import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from './AppIcon';
import type { IconName } from './AppIcon';
import { getOptimizedDealImageSrcSet, getOptimizedDealImageUrl } from '../utils/dealImages';
import { buildDealIconCandidatePaths, buildDealIconPngPath, normalizeDealIconName } from '../utils/dealIcons';

interface DealArtworkProps {
  src?: string | null;
  alt: string;
  fit?: 'contain' | 'cover';
  iconSize?: number;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  iconName?: string | null;
  fallbackIconName?: IconName;
  dealId?: string | null;
  preferredWidth?: number;
  sizes?: string;
  fetchPriority?: 'high' | 'low' | 'auto';
}

const getCandidateIndex = (candidates: string[], startIndex = 0) =>
  startIndex >= 0 && startIndex < candidates.length ? startIndex : -1;

export const DealArtwork = React.memo(({
  src,
  alt,
  fit = 'contain',
  iconSize = 28,
  className = '',
  imageClassName = '',
  fallbackClassName = '',
  iconName,
  fallbackIconName = 'deal',
  dealId,
  preferredWidth,
  sizes,
  fetchPriority = 'low',
}: DealArtworkProps) => {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageCandidateIndex, setImageCandidateIndex] = useState(0);
  const normalizedSrc = useMemo(
    () => (typeof src === 'string' ? src.trim() : ''),
    [src],
  );
  const normalizedIconName = useMemo(
    () => normalizeDealIconName(iconName),
    [iconName],
  );
  const customIconSrc = useMemo(
    () => buildDealIconPngPath(normalizedIconName),
    [normalizedIconName],
  );
  const imageCandidates = useMemo(() => {
    const candidates: string[] = [];
    if (normalizedIconName) {
      candidates.push(...buildDealIconCandidatePaths(normalizedIconName));
    }

    if (normalizedSrc) {
      candidates.push(normalizedSrc);
      const iconSrcMatch = normalizedSrc.match(/\/category-icons\/(.+)\.(png|jpg|jpeg|webp|svg)$/i);
      if (iconSrcMatch?.[1]) {
        try {
          candidates.push(...buildDealIconCandidatePaths(decodeURIComponent(iconSrcMatch[1])));
        } catch {
          candidates.push(...buildDealIconCandidatePaths(iconSrcMatch[1]));
        }
      }
    }

    if (customIconSrc) {
      candidates.unshift(customIconSrc);
    }

    return Array.from(new Set(candidates.filter(Boolean)));
  }, [customIconSrc, normalizedIconName, normalizedSrc]);
  const effectiveSrc = imageCandidates[imageCandidateIndex] || '';
  const optimizedSrc = useMemo(() => {
    return getOptimizedDealImageUrl(effectiveSrc, { width: preferredWidth, fit });
  }, [effectiveSrc, fit, preferredWidth]);
  const optimizedSrcSet = useMemo(() => {
    return getOptimizedDealImageSrcSet(effectiveSrc, { width: preferredWidth, fit });
  }, [effectiveSrc, fit, preferredWidth]);
  const showImage = Boolean(effectiveSrc) && !imageFailed;
  const debugSignatureRef = useRef('');

  useEffect(() => {
    const nextIndex = getCandidateIndex(imageCandidates, 0);
    if (nextIndex >= 0) {
      setImageCandidateIndex(nextIndex);
      setImageFailed(false);
      setImageLoaded(false);
      return;
    }

    setImageCandidateIndex(0);
    setImageFailed(imageCandidates.length > 0);
    setImageLoaded(false);
  }, [imageCandidates]);

  useEffect(() => {
    if (!effectiveSrc) {
      setImageFailed(false);
      setImageLoaded(false);
      return;
    }

    setImageFailed(false);
    setImageLoaded(false);
  }, [effectiveSrc, imageCandidateIndex, imageCandidates]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!effectiveSrc && !normalizedIconName) return;

    const signature = `${dealId ?? 'unknown'}|${normalizedIconName}|${effectiveSrc}|${imageFailed}`;
    if (debugSignatureRef.current === signature) return;
    debugSignatureRef.current = signature;

    console.info('[LiveDrop] DealArtwork icon resolution', {
      dealId: dealId ?? null,
      iconName: normalizedIconName || null,
      resolvedPath: effectiveSrc || null,
      candidatePaths: imageCandidates,
      imageFailed,
    });
  }, [dealId, effectiveSrc, imageCandidates, imageFailed, normalizedIconName]);

  return (
    <div className={`h-full w-full ${className}`}>
      {showImage ? (
        <div className={`relative h-full w-full ${imageLoaded ? '' : 'overflow-hidden'}`}>
          {!imageLoaded ? (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 via-white to-indigo-50" />
          ) : null}
          <img
            src={optimizedSrc || effectiveSrc}
            srcSet={optimizedSrcSet}
            sizes={sizes}
            alt={alt}
            loading="lazy"
            decoding="async"
            fetchPriority={fetchPriority}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              const nextCandidateIndex = getCandidateIndex(imageCandidates, imageCandidateIndex + 1);
              if (nextCandidateIndex >= 0) {
                setImageCandidateIndex(nextCandidateIndex);
                setImageLoaded(false);
                setImageFailed(false);
                return;
              }
              setImageFailed(true);
            }}
            className={`h-full w-full transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'} ${fit === 'contain' ? 'bg-white object-contain' : 'object-cover'} ${imageClassName}`}
          />
        </div>
      ) : (
        <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-50 to-slate-100 text-slate-300 ${fallbackClassName}`}>
          <AppIcon name={fallbackIconName} size={iconSize} />
        </div>
      )}
    </div>
  );
});

DealArtwork.displayName = 'DealArtwork';
