# Quoterm

Quoterm is RefHub's copy-friendly React feedback component: a local, quoted-terminal alternative to global toast stacks.

It renders short feedback next to the UI element that triggered it, keeps a CLI prompt aesthetic, and falls back to a viewport corner when no source element is available.

## Install locally

Copy/import `src/components/quoterm/quoterm.tsx` plus your local `cn` utility. It expects React, React DOM, lucide-react, and Tailwind-style classes.

## Add the host

Mount one host near the root of your app:

```tsx
import { QuotermHost } from "@/components/quoterm";

export function App() {
  return (
    <>
      <Routes />
      <QuotermHost commandName="myapp feedback" fallback="bottom-right" />
    </>
  );
}
```

`commandName` controls the prompt text: `$ myapp feedback --success`. The host handles duration, dismissal, scroll/resize repositioning, ARIA live-region announcements, and fallback placement.

## Fire feedback near a button

```tsx
import * as React from "react";
import { quoterm } from "@/components/quoterm";

export function SaveButton() {
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  return (
    <button
      ref={buttonRef}
      onClick={() =>
        quoterm({
          title: "Saved",
          description: "Your changes are stored.",
          variant: "success",
          source: buttonRef,
          duration: 5000,
        })
      }
    >
      Save
    </button>
  );
}
```

`source` can be an element, event target, or React ref. If omitted, Quoterm tries `document.activeElement`; if that is unavailable, it uses the configured fallback corner.

## Variants

```tsx
quoterm({ title: "Saved", variant: "success", source: saveButtonRef });
quoterm({ title: "Already exists", description: "Review the duplicate before continuing.", variant: "warning", source: importButtonRef });
quoterm({ title: "Could not sync", description: error.message, variant: "error", source: syncButtonRef });
quoterm({ title: "Metadata found", description: "Review the proposed updates.", variant: "info", source: lookupButtonRef });
```

Errors and warnings use `role="alert"`; info and success use `role="status"`. Every message includes a dismiss button and auto-dismisses unless `duration <= 0`.
