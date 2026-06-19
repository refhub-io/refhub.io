import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface OnboardingSpotlightProps {
  selectors: readonly string[];
  label: string;
  heading?: string;
  enabled: boolean;
}

const SPOTLIGHT_PADDING = 8;
const MIN_DESKTOP_WIDTH = 768;

function getTarget(selectors: readonly string[]): HTMLElement | null {
  if (typeof document === "undefined") return null;

  let fallback: HTMLElement | null = null;

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) {
      fallback ??= element;
      if (isElementVisible(element)) {
        return element;
      }
    }
  }

  return fallback;
}

function isElementVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

function getSpotlightRect(element: HTMLElement): SpotlightRect {
  const rect = element.getBoundingClientRect();

  return {
    top: Math.max(8, rect.top - SPOTLIGHT_PADDING),
    left: Math.max(8, rect.left - SPOTLIGHT_PADDING),
    width: rect.width + SPOTLIGHT_PADDING * 2,
    height: rect.height + SPOTLIGHT_PADDING * 2,
  };
}

function getTooltipStyle(rect: SpotlightRect): React.CSSProperties {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const tooltipWidth = 220;
  const gap = 14;

  const preferRight =
    rect.left + rect.width + tooltipWidth + gap < viewportWidth;
  const preferLeft = rect.left - tooltipWidth - gap > 0;
  const left = preferRight
    ? rect.left + rect.width + gap
    : preferLeft
      ? rect.left - tooltipWidth - gap
      : Math.min(Math.max(12, rect.left), viewportWidth - tooltipWidth - 12);

  const top = Math.min(
    Math.max(12, rect.top + rect.height / 2 - 34),
    viewportHeight - 80,
  );

  return { left, top, width: tooltipWidth };
}

export function OnboardingSpotlight({
  selectors,
  label,
  heading = '// highlighted_area',
  enabled,
}: OnboardingSpotlightProps) {
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth >= MIN_DESKTOP_WIDTH;
  });
  const selectorKey = useMemo(() => selectors.join(","), [selectors]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleResize = () =>
      setIsDesktop(window.innerWidth >= MIN_DESKTOP_WIDTH);
    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!enabled || !isDesktop) {
      setRect(null);
      return undefined;
    }

    let animationFrame = 0;
    const target = getTarget(selectors);

    if (!target || !isElementVisible(target)) {
      setRect(null);
      return undefined;
    }

    target.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });

    const updateRect = () => {
      const nextTarget = getTarget(selectors);
      if (!nextTarget || !isElementVisible(nextTarget)) {
        setRect(null);
        return;
      }

      setRect(getSpotlightRect(nextTarget));
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(updateRect);
    };

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(target);
    updateRect();

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [enabled, isDesktop, selectorKey, selectors]);

  if (!enabled || !isDesktop || !rect || typeof document === "undefined") {
    return null;
  }

  const tooltipStyle = getTooltipStyle(rect);

  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60] hidden md:block"
    >
      <div
        className={cn(
          "fixed rounded-2xl border-2 border-primary bg-primary/5",
          "shadow-[0_0_0_9999px_rgba(0,0,0,0.28),0_0_28px_hsl(var(--primary)/0.45)]",
          "transition-all duration-200 ease-out",
        )}
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
      />
      <div
        className="fixed rounded-xl border border-primary/40 bg-card/95 px-3 py-2 font-mono text-[11px] text-foreground shadow-2xl shadow-primary/20 backdrop-blur-xl"
        style={tooltipStyle}
      >
        <div className="mb-1 text-primary">{heading}</div>
        <div>{label}</div>
      </div>
    </div>,
    document.body,
  );
}
