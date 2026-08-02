import { cn } from "@/lib/utils";

interface AnimatedGradientBackdropProps {
  /** Faster, larger-amplitude blob movement — used on the marketing/about page. */
  lively?: boolean;
}

/**
 * Ambient background blobs shared by the landing/about page and the legal
 * document layout: fixed-size blurred circles floating over the solid
 * `bg-background` of their `relative` ancestor, not a full-bleed gradient.
 * Because the base color already covers the whole page, the blobs can drift
 * freely without ever exposing a hard edge or falling short at the bottom of
 * long pages — both of which happened with the earlier edge-to-edge gradient.
 */
export function AnimatedGradientBackdrop({ lively = false }: AnimatedGradientBackdropProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className={cn(
          "absolute -top-32 left-0 right-0 mx-auto h-56 w-56 rounded-full bg-[hsl(var(--electric-purple)/0.35)] blur-[100px] sm:h-80 sm:w-80 lg:h-[420px] lg:w-[420px]",
          lively ? "animate-blob-drift-a" : "animate-blob-drift-a-subtle"
        )}
      />
      <div
        className={cn(
          "absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-[hsl(var(--neon-green)/0.28)] blur-[110px] sm:h-72 sm:w-72 lg:h-[380px] lg:w-[380px]",
          lively ? "animate-blob-drift-b" : "animate-blob-drift-b-subtle"
        )}
      />
      <div className="absolute inset-0 bg-noise" />
    </div>
  );
}
