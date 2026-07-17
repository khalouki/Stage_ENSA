"use client";

import { useTranslation } from "@/components/i18n/useTranslation";

import { COPILOT_SUGGESTION_KEYS } from "./constants";

type AiCopilotSuggestionsProps = {
  disabled: boolean;
  onSelect: (question: string) => void;
};

export default function AiCopilotSuggestions({ disabled, onSelect }: AiCopilotSuggestionsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-3" aria-label={t("copilotSuggestionsLabel")}>
      {COPILOT_SUGGESTION_KEYS.map((suggestionKey) => {
        const suggestion = t(suggestionKey);
        return (
        <button
          key={suggestionKey}
          type="button"
          onClick={() => onSelect(suggestion)}
          disabled={disabled}
          className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
        >
          {suggestion}
        </button>
        );
      })}
    </div>
  );
}
