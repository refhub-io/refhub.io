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
  placement?: QuotermInput["placement"];
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

function toast({ source, feedbackSeverity, variant, action, ...props }: ToastInput) {
  const normalizedProps = { ...props, title: props.title ? humanizeFeedbackTitle(props.title) : props.title };
  const severity = inferFeedbackSeverity({ ...normalizedProps, feedbackSeverity, variant, action });

  const handle = quoterm({
    ...normalizedProps,
    source,
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
