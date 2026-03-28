import { cn } from '@/lib/utils';

interface BrandMarkProps {
  className?: string;
  imageClassName?: string;
  alt?: string;
  variant?: 'square' | 'circle';
}

const logoSources = {
  square: '/logo_sq.svg',
  circle: '/logo_c.svg',
} as const;

export function BrandMark({
  className,
  imageClassName,
  alt = 'RefHub logo',
  variant = 'square',
}: BrandMarkProps) {
  return (
    <div className={cn('overflow-hidden', className)}>
      <img
        src={logoSources[variant]}
        alt={alt}
        className={cn('h-full w-full object-contain', imageClassName)}
      />
    </div>
  );
}
