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

export function InlineFeedbackHost({ commandName, formatCommand, ...props }: InlineFeedbackHostProps) {
  return (
    <QuotermHost
      {...props}
      formatCommand={(variant: QuotermVariant, item: QuotermState) => {
        if (formatCommand) return formatCommand(variant, item);
        return item.command ?? (commandName ? `${commandName} --${item.variant}` : "");
      }}
    />
  );
}

export type { QuotermHostProps as InlineFeedbackPackageHostProps } from "quoterm";
