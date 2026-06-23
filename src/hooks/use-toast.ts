import * as React from "react";

export type FeedbackSeverity = "success" | "warning" | "error" | "info";
export type ToastActionElement = React.ReactElement;
export type ToastProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  variant?: "default" | "destructive";
  duration?: number;
};

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1000000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
  sourceRect?: DOMRect | null;
  feedbackSeverity?: FeedbackSeverity;
};

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const;

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type ActionType = typeof actionTypes;

type Action =
  | {
      type: ActionType["ADD_TOAST"];
      toast: ToasterToast;
    }
  | {
      type: ActionType["UPDATE_TOAST"];
      toast: Partial<ToasterToast>;
    }
  | {
      type: ActionType["DISMISS_TOAST"];
      toastId?: ToasterToast["id"];
    }
  | {
      type: ActionType["REMOVE_TOAST"];
      toastId?: ToasterToast["id"];
    };

interface State {
  toasts: ToasterToast[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)),
      };

    case "DISMISS_TOAST": {
      const { toastId } = action;

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t,
        ),
      };
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

const listeners: Array<(state: State) => void> = [];

let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

type Toast = Omit<ToasterToast, "id">;

type ToastInput = Toast & {
  source?: EventTarget | Element | React.RefObject<Element | null> | null;
};

function getSourceRect(source?: ToastInput["source"]): DOMRect | null {
  const candidate = source ?? document.activeElement;
  if (!candidate) return null;
  if (candidate instanceof Element) return candidate.getBoundingClientRect();
  if ("current" in candidate && candidate.current instanceof Element) {
    return candidate.current.getBoundingClientRect();
  }
  if (candidate instanceof EventTarget && candidate instanceof Element) return candidate.getBoundingClientRect();
  return null;
}

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
  const id = genId();
  // Explicit `source` refs keep feedback local. `document.activeElement` remains a
  // compatibility fallback for older call sites that cannot easily pass a trigger.
  const sourceRect = props.sourceRect ?? getSourceRect(source);
  const feedbackSeverity = inferFeedbackSeverity(props);
  const normalizedProps = { ...props, title: props.title ? humanizeFeedbackTitle(props.title) : props.title };

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    });
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...normalizedProps,
      sourceRect,
      feedbackSeverity,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return {
    id: id,
    dismiss,
    update,
  };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  };
}

export { useToast, toast };
