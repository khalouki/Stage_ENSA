"use client";

import { FormEvent, KeyboardEvent } from "react";
import { Send } from "lucide-react";

import { useTranslation } from "@/components/i18n/useTranslation";

type AiCopilotInputProps = {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export default function AiCopilotInput({ value, loading, onChange, onSubmit }: AiCopilotInputProps) {
  const { t } = useTranslation();

  const submit = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!loading && value.trim()) {
      onSubmit();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2 border-t border-border p-4">
      <label className="sr-only" htmlFor="ai-copilot-message">
        {t("copilotInputLabel")}
      </label>
      <textarea
        id="ai-copilot-message"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        maxLength={500}
        rows={2}
        placeholder={t("copilotInputPlaceholder")}
        className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        aria-label={t("copilotSendLabel")}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}
