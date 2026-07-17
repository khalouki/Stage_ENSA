"use client";

import { Minus, Sparkles, X } from "lucide-react";

import { useTranslation } from "@/components/i18n/useTranslation";

type AiCopilotHeaderProps = {
  onMinimize: () => void;
  onClose: () => void;
};

export default function AiCopilotHeader({ onMinimize, onClose }: AiCopilotHeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="ai-maintenance-copilot-title" className="truncate text-sm font-semibold">
              {t("copilotTitle")}
            </h2>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>{t("copilotStatusAvailable")}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t("copilotMinimizeLabel")}
          onClick={onMinimize}
          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={t("copilotCloseLabel")}
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
