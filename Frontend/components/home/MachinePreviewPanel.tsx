"use client";

import Link from "next/link";
import { Activity, Box } from "lucide-react";

import { useTranslation } from "@/components/i18n";
import type { HomeStat, MachinePreview } from "./types";
import { statusKey } from "./utils";
import type { TranslationKey } from "@/lib/translations";

type MachinePreviewPanelProps = {
  isAdmin: boolean;
  isStudent: boolean;
  machinePreview: MachinePreview[];
  panelCardDescription: string;
  panelCardTitle: string;
  panelTitle: string;
  stats: HomeStat[];
};

function MachineRow({ isAdmin, isStudent, item }: { isAdmin: boolean; isStudent: boolean; item: MachinePreview }) {
  const { t } = useTranslation();
  const statusTone =
    item.machineStatus === "available"
      ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300"
      : item.machineStatus === "busy"
      ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300"
      : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";

  return (
    <div className="flex items-center justify-between gap-3 bg-background/50 rounded-lg px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <div
          className={`h-2 w-2 shrink-0 rounded-full ${
            item.status === "running" ? "bg-green-500" : item.status === "warning" ? "bg-yellow-500" : "bg-red-500"
          }`}
        />
        <span className="truncate text-xs font-medium">{item.machine}</span>
      </div>

      {isAdmin ? (
        <div className="flex shrink-0 items-center gap-2">
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                item.health >= 80 ? "bg-green-500" : item.health >= 60 ? "bg-yellow-500" : "bg-red-500"
              }`}
              style={{ width: `${item.health}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{item.health}%</span>
        </div>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-md border px-2 py-1 text-[11px] font-medium ${statusTone}`}>
            {t(statusKey(item.machineStatus) as TranslationKey)}
          </span>
          <Link
            href={isStudent ? `/reservations?machineId=${item.id}` : "/login"}
            className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-primary transition hover:border-primary/50 hover:bg-primary/5"
          >
            {isStudent ? t("homeReserve") : t("homeSignInToReserve")}
          </Link>
        </div>
      )}
    </div>
  );
}

export function MachinePreviewPanel({
  isAdmin,
  isStudent,
  machinePreview,
  panelCardDescription,
  panelCardTitle,
  panelTitle,
  stats,
}: MachinePreviewPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="animate__animated animate__fadeInRight">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/5 rounded-3xl blur-3xl" />
        <div className="relative bg-card border border-border rounded-2xl p-6 glow-border">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-muted-foreground">{panelTitle}</span>
            <div className="flex items-center gap-1.5">
              <span className="relative w-2 h-2 rounded-full bg-green-500">
                <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75" />
              </span>
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">{t("homeLive")}</span>
            </div>
          </div>

          {!isAdmin && (
            <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  {isStudent ? <Activity className="h-4 w-4" /> : <Box className="h-4 w-4" />}
                </div>
                <div>
                  <p className="text-sm font-semibold">{panelCardTitle}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{panelCardDescription}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 mb-4">
            {stats.map(({ value, label, icon: Icon }) => (
              <div key={label} className="bg-background/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="text-xl font-bold">{value}</span>
                </div>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {machinePreview.length === 0 && (
              <div className="bg-background/50 rounded-lg px-3 py-3 text-xs text-muted-foreground">
                {t("homeWaitingMachineData")}
              </div>
            )}
            {machinePreview.map((item) => (
              <MachineRow key={item.id} isAdmin={isAdmin} isStudent={isStudent} item={item} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
