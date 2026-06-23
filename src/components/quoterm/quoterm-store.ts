import * as React from "react";

export type QuotermVariant = "success" | "warning" | "error" | "info";
export type QuotermSource = EventTarget | Element | React.RefObject<Element | null> | null;

export interface QuotermMessage {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant: QuotermVariant;
  duration?: number;
  sourceRect?: DOMRect | null;
  className?: string;
  open?: boolean;
  role?: "status" | "alert";
  onOpenChange?: (open: boolean) => void;
}

export type QuotermInput = Omit<QuotermMessage, "id" | "variant" | "sourceRect" | "open"> & {
  variant?: QuotermVariant;
  source?: QuotermSource;
  sourceRect?: DOMRect | null;
};

interface QuotermState {
  messages: QuotermMessage[];
}

const REMOVE_DELAY = 1000000;

let count = 0;
let memoryState: QuotermState = { messages: [] };
const listeners: Array<(state: QuotermState) => void> = [];
const removeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

function emit(nextState: QuotermState) {
  memoryState = nextState;
  listeners.forEach((listener) => listener(memoryState));
}

function queueRemoval(messageId: string) {
  if (removeTimeouts.has(messageId)) return;

  const timeout = setTimeout(() => {
    removeTimeouts.delete(messageId);
    emit({ messages: memoryState.messages.filter((message) => message.id !== messageId) });
  }, REMOVE_DELAY);

  removeTimeouts.set(messageId, timeout);
}

function addMessage(message: QuotermMessage) {
  emit({ messages: [message, ...memoryState.messages].slice(0, 1) });
}

function updateMessage(messageId: string, patch: Partial<QuotermMessage>) {
  emit({ messages: memoryState.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)) });
}

function dismissMessage(messageId?: string) {
  if (messageId) {
    queueRemoval(messageId);
  } else {
    memoryState.messages.forEach((message) => queueRemoval(message.id));
  }

  emit({
    messages: memoryState.messages.map((message) =>
      message.id === messageId || messageId === undefined ? { ...message, open: false } : message,
    ),
  });
}

export function getQuotermSourceRect(source?: QuotermSource): DOMRect | null {
  const activeElement = typeof document === "undefined" ? null : document.activeElement;
  const candidate = source ?? activeElement;
  if (!candidate) return null;
  if (candidate instanceof Element) return candidate.getBoundingClientRect();
  if ("current" in candidate && candidate.current instanceof Element) {
    return candidate.current.getBoundingClientRect();
  }
  return null;
}

export function quoterm({ source, variant = "success", ...props }: QuotermInput) {
  const id = genId();
  const sourceRect = props.sourceRect ?? getQuotermSourceRect(source);
  const role = props.role ?? (variant === "error" || variant === "warning" ? "alert" : "status");

  const dismiss = () => dismissMessage(id);
  const update = (patch: Partial<Omit<QuotermMessage, "id">>) => updateMessage(id, patch);

  addMessage(
    {
      ...props,
      id,
      sourceRect,
      variant,
      role,
      open: true,
      onOpenChange: (open) => {
        props.onOpenChange?.(open);
        if (!open) dismiss();
      },
    },
  );

  return { id, dismiss, update };
}

export function useQuoterm() {
  const [state, setState] = React.useState<QuotermState>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);

  return {
    ...state,
    quoterm,
    dismiss: dismissMessage,
  };
}
