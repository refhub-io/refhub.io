import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

interface AnimatedGradientBackdropProps {
  /** Adds a slow, continuous drift to the blobs on top of the scroll parallax. */
  lively?: boolean;
}

/**
 * Background gradient blobs shared by the landing/about page and the legal
 * document layout. Rendered inside a `relative` ancestor so `inset-0` tracks
 * the full scrollable height of that ancestor instead of just the initial
 * viewport.
 */
export function AnimatedGradientBackdrop({ lively = false }: AnimatedGradientBackdropProps) {
  const purpleLayerRef = useRef<HTMLDivElement>(null);
  const greenLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (purpleLayerRef.current) {
          purpleLayerRef.current.style.transform = `translate3d(0, ${y * 0.08}px, 0)`;
        }
        if (greenLayerRef.current) {
          greenLayerRef.current.style.transform = `translate3d(0, ${y * -0.06}px, 0)`;
        }
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div ref={purpleLayerRef} className="pointer-events-none absolute inset-0 will-change-transform">
        <div
          className={cn(
            "absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--electric-purple)/0.16),_transparent_42%)]",
            lively && "animate-blob-drift-a"
          )}
        />
      </div>
      <div ref={greenLayerRef} className="pointer-events-none absolute inset-0 will-change-transform">
        <div
          className={cn(
            "absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_hsl(var(--neon-green)/0.12),_transparent_36%)]",
            lively && "animate-blob-drift-b"
          )}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-noise" />
    </>
  );
}
