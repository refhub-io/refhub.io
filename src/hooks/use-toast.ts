import * as React from "react";

import {
  dismissQuoterm,
  quoterm,
  useQuoterm,
  type QuotermInput,
  type QuotermVariant,
} from "quoterm";

export type FeedbackSeverity = QuotermVariant;
export type ToastActionElement = React.ReactElement;
export type ToastProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  variant?: "default" | "destructive";
  duration?: number;
};

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
  sourceRect?: DOMRect | null;
  feedbackSeverity?: FeedbackSeverity;
};

type Toast = Omit<ToasterToast, "id">;

type ToastInput = Toast & {
  source?: QuotermInput["source"];
};

function nodeToPlainText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToPlainText).join(" ");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return nodeToPlainText(node.props.children);
  return "";
}

function inferFeedbackSeverity(props: Toast): FeedbackSeverity {
  if (props.feedbackSeverity) return props.feedbackSeverity;
  if (props.variant === "destructive") return "error";

  const text = `${nodeToPlainText(props.title)} ${nodeToPlainText(props.description)}`.toLowerCase();
  if (text.includes("duplicate") || text.includes("warning") || text.includes("already") || text.includes("no semantic scholar")) {
    return "warning";
  }

  return "success";
}

function humanizeFeedbackTitle(title: React.ReactNode): React.ReactNode {
  if (typeof title !== "string") return title;
  const withoutEmoji = title
    .replace(/✨/gu, "")
    .replace(/🍴/gu, "")
    .replace(/🗑️/gu, "")
    .trim();
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)+!?$/i.test(withoutEmoji)) return title;

  const emojiSuffix = title.slice(title.indexOf(withoutEmoji) + withoutEmoji.length);
  const words = withoutEmoji.replace(/_/g, " ");
  const humanized = words.charAt(0).toUpperCase() + words.slice(1);
  return `${humanized}${emojiSuffix}`;
}

/**
 * When `source` is omitted, quoterm falls back to `document.activeElement` — a useful
 * free anchor right after a click (the clicked control is usually still focused), but
 * when nothing is focused `document.activeElement` is `document.body` itself, and
 * quoterm's inline render mode inserts the toast as a DOM sibling of `<body>` inside
 * `<html>`. Treat that specific case as "no anchor" so it renders through quoterm's
 * centered fallback instead of corrupting page structure. Explicit `source` values
 * (including an explicit `null` for "no anchor") pass through unchanged.
 */
function resolveImplicitSource(source: ToastInput["source"]): ToastInput["source"] {
  if (source !== undefined) return source;
  if (typeof document === "undefined") return null;
  const active = document.activeElement;
  return active && active !== document.body ? active : null;
}

function toast({ source, feedbackSeverity, variant, action, ...props }: ToastInput) {
  const normalizedProps = { ...props, title: props.title ? humanizeFeedbackTitle(props.title) : props.title };
  const severity = inferFeedbackSeverity({ ...normalizedProps, feedbackSeverity, variant, action });

  const handle = quoterm({
    ...normalizedProps,
    source: resolveImplicitSource(source),
    variant: severity,
    role: severity === "error" || severity === "warning" ? "alert" : "status",
  });

  return {
    id: handle.id,
    dismiss: handle.dismiss,
    update: ({ id: _id, feedbackSeverity: nextFeedbackSeverity, variant: nextVariant, action: _action, ...nextProps }: ToasterToast) => {
      const nextSeverity = inferFeedbackSeverity({ ...nextProps, feedbackSeverity: nextFeedbackSeverity, variant: nextVariant, action: _action });
      handle.update({
        ...nextProps,
        title: nextProps.title ? humanizeFeedbackTitle(nextProps.title) : nextProps.title,
        variant: nextSeverity,
        role: nextSeverity === "error" || nextSeverity === "warning" ? "alert" : "status",
      });
    },
  };
}

function useToast() {
  const { items } = useQuoterm();

  return {
    toasts: items.map((item) => ({
      ...item,
      feedbackSeverity: item.variant,
      variant: item.variant === "error" ? "destructive" : "default",
    })),
    toast,
    dismiss: dismissQuoterm,
  };
}

export { useToast, toast };
