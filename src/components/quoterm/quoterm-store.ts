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
  open: boolean;
  role: "status" | "alert";
  onOpenChange?: (open: boolean) => void;
}

export type QuotermInput = Omit<QuotermMessage, "id" | "variant" | "sourceRect" | "open" | "role"> & {
  variant?: QuotermVariant;
  role?: QuotermMessage["role"];
  source?: QuotermSource;
  sourceRect?: DOMRect | null;
};

interface QuotermState {
  messages: QuotermMessage[];
}

const MESSAGE_LIMIT = 1;

let count = 0;
let memoryState: QuotermState = { messages: [] };
const listeners = new Set<() => void>();

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

function emit(nextState: QuotermState) {
  memoryState = nextState;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return memoryState;
}

function removeMessage(messageId?: string) {
  emit({
    messages: messageId
      ? memoryState.messages.filter((message) => message.id !== messageId)
      : [],
  });
}

function addMessage(message: QuotermMessage) {
  emit({ messages: [message, ...memoryState.messages].slice(0, MESSAGE_LIMIT) });
}

function updateMessage(messageId: string, patch: Partial<Omit<QuotermMessage, "id">>) {
  emit({ messages: memoryState.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)) });
}

function dismissMessage(messageId?: string) {
  memoryState.messages
    .filter((message) => messageId === undefined || message.id === messageId)
    .forEach((message) => message.onOpenChange?.(false));

  removeMessage(messageId);
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

  addMessage({
    ...props,
    id,
    sourceRect,
    variant,
    role,
    open: true,
    onOpenChange: (open) => {
      props.onOpenChange?.(open);
      if (!open) removeMessage(id);
    },
  });

  return { id, dismiss, update };
}

export function __resetQuotermForTests() {
  memoryState = { messages: [] };
  listeners.forEach((listener) => listener());
}

export function useQuoterm() {
  const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    ...state,
    quoterm,
    dismiss: dismissMessage,
  };
}
