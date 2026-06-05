"use client";

import { Languages } from "lucide-react";

import { useTranslation } from "./useTranslation";
import type { Language } from "@/lib/translations";

const OPTIONS: Array<{ value: Language; label: "FR" | "EN" }> = [
  { value: "fr", label: "FR" },
  { value: "en", label: "EN" },
];

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useTranslation();

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1"
      aria-label={t("languageSwitcher")}
    >
      <Languages className="ml-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setLanguage(option.value)}
          className={`rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
            language === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          aria-pressed={language === option.value}
        >
          {option.value === "fr" ? t("languageFrench") : t("languageEnglish")}
        </button>
      ))}
    </div>
  );
}
