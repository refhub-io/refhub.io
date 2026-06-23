import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { useQuoterm } from "./quoterm-store";

export interface QuotermHostProps {
  commandName?: string;
  fallback?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  defaultDuration?: number;
}

const DEFAULT_DURATION = 6500;

const variantConfig = {
  success: {
    icon: CheckCircle2,
    label: "success",
    className:
      "border-emerald-500/50 bg-emerald-950/90 text-emerald-50 shadow-emerald-950/30 dark:bg-emerald-950/95",
    promptClassName: "text-emerald-300",
  },
  warning: {
    icon: AlertTriangle,
    label: "warning",
    className:
      "border-orange-500/60 bg-orange-950/90 text-orange-50 shadow-orange-950/30 dark:bg-orange-950/95",
    promptClassName: "text-orange-300",
  },
  error: {
    icon: XCircle,
    label: "error",
    className:
      "border-red-500/60 bg-red-950/90 text-red-50 shadow-red-950/30 dark:bg-red-950/95",
    promptClassName: "text-red-300",
  },
  info: {
    icon: Info,
    label: "info",
    className:
      "border-sky-500/50 bg-sky-950/90 text-sky-50 shadow-sky-950/30 dark:bg-sky-950/95",
    promptClassName: "text-sky-300",
  },
} as const;

function getFallbackPosition(fallback: NonNullable<QuotermHostProps["fallback"]>, width: number) {
  const vertical = fallback.startsWith("top") ? 16 : Math.max(16, window.innerHeight - 160);
  const horizontal = fallback.endsWith("left") ? 16 : Math.max(16, window.innerWidth - width - 16);
  return { top: vertical, left: horizontal, transform: "none" };
}

function getPosition(sourceRect: DOMRect | null | undefined, fallback: NonNullable<QuotermHostProps["fallback"]>) {
  const width = Math.min(360, window.innerWidth - 32);
  if (!sourceRect) return getFallbackPosition(fallback, width);

  const belowTop = sourceRect.bottom + 10;
  const aboveTop = sourceRect.top - 10;
  const top = belowTop + 96 < window.innerHeight ? belowTop : Math.max(16, aboveTop - 96);
  const centeredLeft = sourceRect.left + sourceRect.width / 2 - width / 2;
  const left = Math.min(Math.max(16, centeredLeft), window.innerWidth - width - 16);

  return { top, left, transform: "none" };
}

export function QuotermHost({
  commandName = "quoterm",
  fallback = "bottom-right",
  defaultDuration = DEFAULT_DURATION,
}: QuotermHostProps) {
  const { messages, dismiss } = useQuoterm();
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (messages.length === 0) return;
    const timers = messages.map((message) => {
      const duration = typeof message.duration === "number" ? message.duration : defaultDuration;
      if (duration <= 0) return null;
      return window.setTimeout(() => dismiss(message.id), duration);
    });

    return () => {
      timers.forEach((timer) => {
        if (timer) window.clearTimeout(timer);
      });
    };
  }, [defaultDuration, dismiss, messages]);

  React.useEffect(() => {
    if (messages.length === 0) return;
    const update = () => setTick((value) => value + 1);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [messages.length]);

  if (typeof document === "undefined" || messages.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100]" aria-live="polite" aria-atomic="false" data-quoterm-tick={tick}>
      {messages.map((message) => {
        const config = variantConfig[message.variant];
        const Icon = config.icon;
        const position = getPosition(message.sourceRect, fallback);

        return (
          <section
            key={message.id}
            role={message.role}
            className={cn(
              "pointer-events-auto fixed w-[min(360px,calc(100vw-2rem))] rounded-md border px-3 py-2 font-mono text-xs shadow-2xl backdrop-blur-md",
              "before:absolute before:-top-1 before:left-6 before:h-2 before:w-2 before:rotate-45 before:border-l before:border-t before:bg-inherit",
              config.className,
              message.className,
            )}
            style={{ top: position.top, left: position.left, transform: position.transform }}
          >
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className={cn("text-[10px] uppercase tracking-[0.24em]", config.promptClassName)}>
                  <span aria-hidden="true">$ {commandName} --{config.label}</span>
                  <span className="sr-only">{config.label}: </span>
                </div>
                {message.title && <div className="mt-1 break-words font-semibold leading-snug">{message.title}</div>}
                {message.description && (
                  <div className="mt-1 break-words leading-relaxed opacity-90">{message.description}</div>
                )}
              </div>
              <button
                type="button"
                className="-mr-1 rounded p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
                onClick={() => dismiss(message.id)}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Dismiss feedback</span>
              </button>
            </div>
          </section>
        );
      })}
    </div>,
    document.body,
  );
}
