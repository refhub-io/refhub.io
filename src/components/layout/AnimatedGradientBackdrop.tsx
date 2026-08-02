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
 * renders as a smooth analytic falloff. The gradient uses several color
 * stops with a long, low-opacity tail (rather than just two stops fading to
 * transparent by 70%) so it reads as a diffuse haze instead of a solid disc
 * with a soft edge; a modest `blur()` on top softens it further without the
 * graininess a much larger blur radius produced.
 *
 * Sized with `clamp(..., vw, ...)` rather than fixed px/rem breakpoints —
 * a blob whose width can exceed a narrower viewport at some breakpoint is
 * what caused the horizontal scroll/overflow bug; clamp keeps it a bounded
 * fraction of the viewport at every width instead of jumping between fixed
 * sizes.
 */
export function AnimatedGradientBackdrop({ lively = false }: AnimatedGradientBackdropProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className={cn(
          "absolute -top-1/4 left-0 right-0 mx-auto h-[clamp(21rem,69vw,57rem)] w-[clamp(21rem,69vw,57rem)] rounded-full blur-3xl",
          "bg-[radial-gradient(circle,_hsl(var(--electric-purple)/0.65)_0%,_hsl(var(--electric-purple)/0.4)_20%,_hsl(var(--electric-purple)/0.18)_45%,_hsl(var(--electric-purple)/0.06)_70%,_transparent_100%)]",
          lively ? "animate-blob-drift-a" : "animate-blob-drift-a-subtle"
        )}
      />
      <div
        className={cn(
          "absolute -bottom-1/4 -right-[17vw] h-[clamp(18rem,57vw,50rem)] w-[clamp(18rem,57vw,50rem)] rounded-full blur-3xl",
          "bg-[radial-gradient(circle,_hsl(var(--neon-green)/0.55)_0%,_hsl(var(--neon-green)/0.32)_20%,_hsl(var(--neon-green)/0.14)_45%,_hsl(var(--neon-green)/0.05)_70%,_transparent_100%)]",
          lively ? "animate-blob-drift-b" : "animate-blob-drift-b-subtle"
        )}
      />
      <div className="absolute inset-0 bg-noise" />
    </div>
  );
}
