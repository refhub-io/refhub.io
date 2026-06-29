import {
  dismissQuoterm,
  useQuoterm,
  type QuotermHostProps,
  type QuotermState,
  type QuotermVariant,
} from "quoterm";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "quoterm/style.css";
import "./inline-feedback.css";

export type InlineFeedbackHostProps = QuotermHostProps & {
  /** Compatibility with RefHub's previous local Quoterm host API. */
  commandName?: string;
};

const defaultIcons: Record<QuotermVariant, string> = {
  success: "✓",
  warning: "!",
  error: "!",
  info: "i",
};

function getRole(item: QuotermState) {
  return item.role ?? (item.variant === "error" || item.variant === "warning" ? "alert" : "status");
}

function getAriaLive(item: QuotermState) {
  return item.ariaLive ?? (item.variant === "error" || item.variant === "warning" ? "assertive" : "polite");
}

function getPrimaryMessage(item: QuotermState) {
  return item.title ?? item.message ?? item.description ?? "";
}

function getDetailMessages(item: QuotermState) {
  const details = [];
  if (item.title) {
    if (item.message) details.push(item.message);
    if (item.description) details.push(item.description);
  } else if (item.message && item.description) {
    details.push(item.description);
  }
  return details;
}

function InlineFeedbackItem({
  item,
  maxWidth,
  renderIcon,
}: {
  item: QuotermState;
  maxWidth?: number;
  renderIcon?: InlineFeedbackHostProps["renderIcon"];
}) {
  const icon = renderIcon?.(item.variant) ?? defaultIcons[item.variant];
  const primary = getPrimaryMessage(item);
  const details = getDetailMessages(item);

  return (
    <section
      role={getRole(item)}
      aria-live={getAriaLive(item)}
      aria-atomic="true"
      data-quoterm="item"
      data-variant={item.variant}
      data-theme={item.theme ?? "auto"}
      className={["quoterm", `quoterm--${item.variant}`, item.className].filter(Boolean).join(" ")}
      style={{ ...item.style, maxWidth }}
    >
      <div className="quoterm__row">
        <span className="quoterm__icon" aria-hidden="true">
          {icon}
        </span>
        <div className="quoterm__body">
          <div className="quoterm__quote">{primary}</div>
          {details.map((detail, index) => (
            <div className="quoterm__detail" key={index}>
              {detail}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="quoterm__dismiss"
          onClick={() => dismissQuoterm(item.id)}
          aria-label={item.dismissLabel ?? "Dismiss feedback"}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </section>
  );
}

function useInlineSlots(items: QuotermState[]) {
  const slotsRef = useRef(new Map<string, { element: HTMLDivElement; source: Element }>());
  const itemsRef = useRef(items);
  const [version, setVersion] = useState(0);
  itemsRef.current = items;

  const slotKey = items
    .map((item) => `${item.id}:${item.sourceElement ? "connected" : "missing"}:${item.placement ?? "before"}`)
    .join("|");

  useLayoutEffect(() => {
    const currentItems = itemsRef.current;
    const activeIds = new Set<string>();
    let changed = false;

    currentItems.forEach((item) => {
      const source = item.sourceElement;
      if (!source?.isConnected) return;

      activeIds.add(item.id);
      const existing = slotsRef.current.get(item.id);
      const placement = item.placement === "after" || item.placement === "bottom" || item.placement === "below" ? "after" : "before";

      if (existing && existing.source !== source) {
        existing.element.remove();
        slotsRef.current.delete(item.id);
        changed = true;
      }

      let slot = slotsRef.current.get(item.id)?.element;
      if (!slot) {
        slot = document.createElement("div");
        slot.className = "quoterm-inline-root quoterm-inline-slot";
        slot.dataset.quoterm = "inline-slot";
        slotsRef.current.set(item.id, { element: slot, source });
        changed = true;
      }

      slot.dataset.quotermPlacement = placement;
      if (placement === "after") {
        source.insertAdjacentElement("afterend", slot);
      } else {
        source.insertAdjacentElement("beforebegin", slot);
      }
    });

    slotsRef.current.forEach(({ element }, id) => {
      if (!activeIds.has(id)) {
        element.remove();
        slotsRef.current.delete(id);
        changed = true;
      }
    });

    if (changed) setVersion((current) => current + 1);
  }, [slotKey]);

  useLayoutEffect(() => {
    const slots = slotsRef.current;
    return () => {
      slots.forEach(({ element }) => element.remove());
      slots.clear();
    };
  }, []);

  return { slots: slotsRef.current, version };
}

export function InlineFeedbackHost({
  className,
  commandName: _commandName,
  formatCommand: _formatCommand,
  maxItems = 3,
  maxWidth = 360,
  portalTarget,
  renderIcon,
  zIndex = 60,
}: InlineFeedbackHostProps) {
  const { items } = useQuoterm();
  const visibleItems = items.slice(-maxItems);
  const inlineItems = visibleItems.filter((item) => item.sourceElement?.isConnected);
  const fallbackItems = visibleItems.filter((item) => !item.sourceElement?.isConnected);
  const { slots } = useInlineSlots(inlineItems);
  const target = portalTarget ?? (typeof document === "undefined" ? null : document.body);

  if (!target) return null;

  return (
    <>
      {inlineItems.map((item) => {
        const slot = slots.get(item.id)?.element;
        if (!slot) return null;
        return createPortal(
          <InlineFeedbackItem item={item} maxWidth={maxWidth} renderIcon={renderIcon} />,
          slot,
          item.id,
        );
      })}
      {fallbackItems.length > 0
        ? createPortal(
            <div className={["quoterm-fallback-root", className].filter(Boolean).join(" ")} data-quoterm="fallback-slot" style={{ zIndex }}>
              {fallbackItems.map((item) => (
                <InlineFeedbackItem item={item} maxWidth={maxWidth} renderIcon={renderIcon} key={item.id} />
              ))}
            </div>,
            target,
          )
        : null}
    </>
  );
}

export type { QuotermHostProps as InlineFeedbackPackageHostProps } from "quoterm";
