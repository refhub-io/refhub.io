import { cn } from "@/lib/utils";

interface AnimatedGradientBackdropProps {
  /** Faster, larger-amplitude blob movement — used on the marketing/about page. */
  lively?: boolean;
}

/**
 * Ambient background blobs shared by the landing/about page and the legal
 * document layout: fixed-size soft-edged circles floating over the solid
 * `bg-background` of their `relative` ancestor, not a full-bleed gradient.
 * Because the base color already covers the whole page, the blobs can drift
 * freely without ever exposing a hard edge or falling short at the bottom of
 * long pages — both of which happened with the earlier edge-to-edge gradient.
 *
 * The soft edge comes from an analytic `radial-gradient`, not a `blur()`
 * filter — a `filter: blur()` this large gets rasterized and reads as
 * visibly grainy/dithered on a dark background, whereas a radial-gradient
 * renders as a smooth analytic falloff.
 */
export function AnimatedGradientBackdrop({ lively = false }: AnimatedGradientBackdropProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className={cn(
          "absolute -top-56 left-0 right-0 mx-auto h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle,_hsl(var(--electric-purple)/0.55),_transparent_70%)] sm:h-[36rem] sm:w-[36rem] lg:h-[640px] lg:w-[640px]",
          lively ? "animate-blob-drift-a" : "animate-blob-drift-a-subtle"
        )}
      />
      <div
        className={cn(
          "absolute -bottom-40 -right-40 h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,_hsl(var(--neon-green)/0.45),_transparent_70%)] sm:h-[32rem] sm:w-[32rem] lg:h-[560px] lg:w-[560px]",
          lively ? "animate-blob-drift-b" : "animate-blob-drift-b-subtle"
        )}
      />
      <div className="absolute inset-0 bg-noise" />
    </div>
  );
}
