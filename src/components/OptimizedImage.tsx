import React, { useState, useCallback } from 'react';
import { cn } from '@/src/lib/utils';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  /** Cloudinary/external URL — auto-generates a tiny blur placeholder */
  placeholderWidth?: number;
  /** Max rendered width (px). Cloudinary delivers a right-sized, modern image. */
  maxWidth?: number;
}

function isCloudinary(src: string): boolean {
  return src.includes('res.cloudinary.com') && src.includes('/upload/');
}

function buildPlaceholderUrl(src: string, width: number): string | null {
  // Cloudinary: inject w_<n>,e_blur:800,q_10 transform
  if (isCloudinary(src)) {
    return src.replace('/upload/', `/upload/w_${width},e_blur:800,q_10,f_auto/`);
  }
  return null;
}

// Right-size + modern-format the main image so phones don't download the full
// multi-MB upload. f_auto → WebP/AVIF, q_auto → smart compression, c_limit →
// never upscales beyond the original.
function buildOptimizedUrl(src: string, maxWidth: number): string {
  if (isCloudinary(src)) {
    return src.replace('/upload/', `/upload/f_auto,q_auto,c_limit,w_${maxWidth}/`);
  }
  return src;
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  className,
  placeholderWidth = 40,
  maxWidth = 1280,
  style,
  ...rest
}) => {
  const [loaded, setLoaded] = useState(false);
  const blurUrl = buildPlaceholderUrl(src, placeholderWidth);
  const optimizedSrc = buildOptimizedUrl(src, maxWidth);

  const onLoad = useCallback(() => setLoaded(true), []);

  return (
    <div className={cn('relative overflow-hidden', className)} style={style}>
      {/* Blur placeholder — shown until main image loads */}
      {blurUrl && !loaded && (
        <img
          src={blurUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-sm"
        />
      )}

      {/* Neutral background fallback when no Cloudinary placeholder */}
      {!blurUrl && !loaded && (
        <div className="absolute inset-0 bg-primary-navy/5 animate-pulse" />
      )}

      {/* Main image */}
      <img
        src={optimizedSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={onLoad}
        referrerPolicy="no-referrer"
        className={cn(
          'w-full h-full object-cover transition-opacity duration-500',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
        {...rest}
      />
    </div>
  );
};
