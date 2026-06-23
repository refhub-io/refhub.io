import * as React from "react";

import { quoterm, useQuoterm, type QuotermInput, type QuotermVariant } from "@/components/quoterm/quoterm-store";

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

function inferFeedbackSeverity(props: Toast): FeedbackSeverity {
  if (props.feedbackSeverity) return props.feedbackSeverity;
  if (props.variant === "destructive") return "error";

  const text = `${String(props.title ?? "")} ${String(props.description ?? "")}`.toLowerCase();
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

  const suffix = title.slice(withoutEmoji.length);
  const words = withoutEmoji.replace(/_/g, " ");
  const humanized = words.charAt(0).toUpperCase() + words.slice(1);
  return `${humanized}${suffix}`;
}

function toast({ source, ...props }: ToastInput) {
  const feedbackSeverity = inferFeedbackSeverity(props);
  const normalizedProps = { ...props, title: props.title ? humanizeFeedbackTitle(props.title) : props.title };

  const handle = quoterm({
    ...normalizedProps,
    source,
    variant: feedbackSeverity,
  });

  return {
    id: handle.id,
    dismiss: handle.dismiss,
    update: (nextProps: ToasterToast) =>
      handle.update({
        ...nextProps,
        variant: inferFeedbackSeverity(nextProps),
      }),
  };
}

function useToast() {
  const { messages, dismiss } = useQuoterm();

  return {
    toasts: messages.map((message) => ({
      ...message,
      feedbackSeverity: message.variant,
      variant: message.variant === "error" ? "destructive" : "default",
    })),
    toast,
    dismiss,
  };
}

export { useToast, toast };
