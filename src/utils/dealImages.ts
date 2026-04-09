const SUPABASE_PUBLIC_PATH = '/storage/v1/object/public/';
const SUPABASE_RENDER_PATH = '/storage/v1/render/image/public/';
const DEFAULT_DEAL_IMAGE_WIDTH = 640;
const MIN_DEAL_IMAGE_WIDTH = 240;
const MAX_DEAL_IMAGE_WIDTH = 800;
const DEFAULT_DEAL_IMAGE_QUALITY = 60;
const RETINA_SCALE = 1.35;

type DealImageFit = 'contain' | 'cover';

type DealImageOptions = {
  width?: number;
  quality?: number;
  fit?: DealImageFit;
};

const clampInteger = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(value)));

const resolveWidth = (width?: number) => {
  if (!Number.isFinite(width)) {
    return DEFAULT_DEAL_IMAGE_WIDTH;
  }
  return clampInteger(width as number, MIN_DEAL_IMAGE_WIDTH, MAX_DEAL_IMAGE_WIDTH);
};

const resolveQuality = (quality?: number) => {
  if (!Number.isFinite(quality)) {
    return DEFAULT_DEAL_IMAGE_QUALITY;
  }
  return clampInteger(quality as number, 40, 80);
};

export const getOptimizedDealImageUrl = (src?: string | null, options?: DealImageOptions) => {
  const normalizedSrc = typeof src === 'string' ? src.trim() : '';
  if (!normalizedSrc) return '';

  const width = resolveWidth(options?.width);
  const quality = resolveQuality(options?.quality);
  const fit: DealImageFit = options?.fit === 'cover' ? 'cover' : 'contain';

  if (normalizedSrc.includes(SUPABASE_RENDER_PATH)) {
    const separator = normalizedSrc.includes('?') ? '&' : '?';
    return `${normalizedSrc}${separator}width=${width}&quality=${quality}&format=webp&resize=${fit}`;
  }

  if (normalizedSrc.includes(SUPABASE_PUBLIC_PATH)) {
    const transformed = normalizedSrc.replace(SUPABASE_PUBLIC_PATH, SUPABASE_RENDER_PATH);
    const separator = transformed.includes('?') ? '&' : '?';
    return `${transformed}${separator}width=${width}&quality=${quality}&format=webp&resize=${fit}`;
  }

  if (normalizedSrc.includes('images.unsplash.com')) {
    try {
      const url = new URL(normalizedSrc);
      url.searchParams.set('w', String(width));
      url.searchParams.set('q', String(quality));
      url.searchParams.set('auto', 'format,compress');
      url.searchParams.set('fit', fit === 'cover' ? 'crop' : 'max');
      return url.toString();
    } catch {
      return normalizedSrc;
    }
  }

  return normalizedSrc;
};

export const getOptimizedDealImageSrcSet = (src?: string | null, options?: DealImageOptions) => {
  const normalizedSrc = typeof src === 'string' ? src.trim() : '';
  if (!normalizedSrc) return undefined;

  const width = resolveWidth(options?.width);
  const quality = resolveQuality(options?.quality);
  const fit: DealImageFit = options?.fit === 'cover' ? 'cover' : 'contain';
  const base = getOptimizedDealImageUrl(normalizedSrc, { width, quality, fit });
  if (!base) return undefined;

  const highWidth = clampInteger(width * RETINA_SCALE, MIN_DEAL_IMAGE_WIDTH, MAX_DEAL_IMAGE_WIDTH);
  if (highWidth <= width) return undefined;

  if (base.includes('width=')) {
    return `${base} 1x, ${base.replace(/width=\d+/i, `width=${highWidth}`)} 2x`;
  }
  if (base.includes('w=')) {
    return `${base} 1x, ${base.replace(/w=\d+/i, `w=${highWidth}`)} 2x`;
  }
  return undefined;
};
