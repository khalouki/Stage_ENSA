"use client";

import { AlertTriangle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/components/i18n";

type SimulationNoticeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dark: boolean;
};

export function SimulationNoticeModal({ open, onOpenChange, dark }: SimulationNoticeModalProps) {
  const { t } = useTranslation();
  const rules = [
    {
      text: t("simulationNoticeRule1"),
      details: [t("simulationNoticeRule1Cnc"), t("simulationNoticeRule1Printer")],
    },
    { text: t("simulationNoticeRule2") },
    { text: t("simulationNoticeRule3") },
    { text: t("simulationNoticeRule4") },
    { text: t("simulationNoticeRule5") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto border p-0 shadow-2xl sm:rounded-xl ${
          dark
            ? "border-amber-500/20 bg-gray-950 text-gray-100"
            : "border-amber-200 bg-white text-gray-950"
        } data-[state=open]:zoom-in-25 data-[state=open]:fade-in-0 data-[state=open]:duration-1000 data-[state=closed]:zoom-out-90 data-[state=closed]:fade-out-0 data-[state=closed]:duration-250`}
      >
        <div className={`border-b px-5 py-5 sm:px-6 ${dark ? "border-gray-800" : "border-gray-200"}`}>
          <DialogHeader className="space-y-3 text-left">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                dark
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                  : "border-amber-200 bg-amber-50 text-amber-600"
              }`}
            >
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-xl font-bold tracking-normal">{t("simulationNoticeTitle")}</DialogTitle>
              <DialogDescription className={`text-sm leading-6 ${dark ? "text-gray-300" : "text-gray-600"}`}>
                {t("simulationNoticeDescription")}
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <ol className="space-y-4">
            {rules.map((rule, index) => (
              <li key={rule.text} className="flex gap-3">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    dark ? "bg-amber-400/10 text-amber-300" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-2">
                  <p className={`text-sm leading-6 ${dark ? "text-gray-200" : "text-gray-800"}`}>{rule.text}</p>
                  {rule.details && (
                    <ul className={`space-y-1 text-sm leading-6 ${dark ? "text-gray-400" : "text-gray-600"}`}>
                      {rule.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <DialogFooter className={`border-t px-5 py-4 sm:px-6 ${dark ? "border-gray-800" : "border-gray-200"}`}>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto"
          >
            {t("simulationUnderstand")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
