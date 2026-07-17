"use client";

import { BotMessageSquare } from "lucide-react";

import { useTranslation } from "@/components/i18n/useTranslation";

import { COPILOT_LAUNCHER_POSITION_CLASS } from "./constants";

type AiCopilotLauncherProps = {
  isOpen: boolean;
  onClick: () => void;
};

export default function AiCopilotLauncher({ isOpen, onClick }: AiCopilotLauncherProps) {
  const { t } = useTranslation();

  return (
    <div className={`group ${COPILOT_LAUNCHER_POSITION_CLASS}`}>
      <div className="pointer-events-none absolute bottom-full right-0 mb-3 whitespace-nowrap rounded-md border border-border bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {t("copilotTooltip")}
      </div>
      <button
        type="button"
        aria-label={isOpen ? t("copilotCloseLabel") : t("copilotOpenLabel")}
        aria-expanded={isOpen}
        aria-controls="ai-maintenance-copilot-panel"
        onClick={onClick}
        className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition duration-200 hover:-translate-y-0.5 hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <BotMessageSquare className="h-6 w-6" aria-hidden="true" />
      </button>
    </div>
  );
}
