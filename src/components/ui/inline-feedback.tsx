import { useEffect, useState } from "react";
import {
  QuotermHost,
  type QuotermHostProps,
  type QuotermState,
  type QuotermVariant,
} from "quoterm";
import "quoterm/style.css";

export type InlineFeedbackHostProps = QuotermHostProps & {
  /** Compatibility with RefHub's previous local Quoterm host API. */
  commandName?: string;
};

// Theme lives as a `dark` class on <html> (see ThemeToggle.tsx / main.tsx), not
// in any shared context, so quoterm needs its own observer to stay in sync.
function useResolvedTheme(): "light" | "dark" {
  const [isDark, setIsDark] = useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const root = document.documentElement;
    setIsDark(root.classList.contains("dark"));
    const observer = new MutationObserver(() => setIsDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark ? "dark" : "light";
}

export function InlineFeedbackHost({ commandName, formatCommand, theme, ...props }: InlineFeedbackHostProps) {
  const resolvedTheme = useResolvedTheme();
  return (
    <QuotermHost
      {...props}
      theme={theme ?? resolvedTheme}
      formatCommand={(variant: QuotermVariant, item: QuotermState) => {
        if (formatCommand) return formatCommand(variant, item);
        return item.command ?? (commandName ? `${commandName} --${item.variant}` : "");
      }}
    />
  );
}

export type { QuotermHostProps as InlineFeedbackPackageHostProps } from "quoterm";
