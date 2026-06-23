import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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

function getPosition(sourceRect?: DOMRect | null) {
  if (!sourceRect) {
    return {
      top: Math.max(16, window.innerHeight - 160),
      left: Math.max(16, window.innerWidth - 392),
      transform: "none",
    };
  }

  const width = Math.min(360, window.innerWidth - 32);
  const belowTop = sourceRect.bottom + 10;
  const aboveTop = sourceRect.top - 10;
  const top = belowTop + 96 < window.innerHeight ? belowTop : Math.max(16, aboveTop - 96);
  const centeredLeft = sourceRect.left + sourceRect.width / 2 - width / 2;
  const left = Math.min(Math.max(16, centeredLeft), window.innerWidth - width - 16);

  return { top, left, transform: "none" };
}

export function InlineFeedbackHost() {
  const { toasts, dismiss } = useToast();
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) => {
      const duration = typeof toast.duration === "number" ? toast.duration : 6500;
      if (duration <= 0) return null;
      return window.setTimeout(() => dismiss(toast.id), duration);
    });

    return () => {
      timers.forEach((timer) => {
        if (timer) window.clearTimeout(timer);
      });
    };
  }, [dismiss, toasts]);

  React.useEffect(() => {
    if (toasts.length === 0) return;
    const update = () => setTick((value) => value + 1);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [toasts.length]);

  if (typeof document === "undefined" || toasts.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100]" aria-live="polite" aria-atomic="false" data-feedback-tick={tick}>
      {toasts.map((toast) => {
        const severity = toast.feedbackSeverity ?? (toast.variant === "destructive" ? "error" : "success");
        const config = variantConfig[severity];
        const Icon = config.icon;
        const position = getPosition(toast.sourceRect);
        const role = severity === "error" || severity === "warning" ? "alert" : "status";

        return (
          <section
            key={toast.id}
            role={role}
            className={cn(
              "pointer-events-auto fixed w-[min(360px,calc(100vw-2rem))] rounded-md border px-3 py-2 font-mono text-xs shadow-2xl backdrop-blur-md",
              "before:absolute before:-top-1 before:left-6 before:h-2 before:w-2 before:rotate-45 before:border-l before:border-t before:bg-inherit",
              config.className,
              toast.className,
            )}
            style={{ top: position.top, left: position.left, transform: position.transform }}
          >
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className={cn("text-[10px] uppercase tracking-[0.24em]", config.promptClassName)}>
                  <span aria-hidden="true">$ refhub feedback --{config.label}</span>
                  <span className="sr-only">{config.label}: </span>
                </div>
                {toast.title && <div className="mt-1 break-words font-semibold leading-snug">{toast.title}</div>}
                {toast.description && (
                  <div className="mt-1 break-words leading-relaxed opacity-90">{toast.description}</div>
                )}
              </div>
              <button
                type="button"
                className="-mr-1 rounded p-1 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current"
                onClick={() => dismiss(toast.id)}
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
