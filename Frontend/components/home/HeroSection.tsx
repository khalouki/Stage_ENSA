"use client";

import Link from "next/link";
import { Activity, ArrowRight, BarChart3, Box, LogIn, Play, UserPlus, Wifi } from "lucide-react";

import { usePageTransition } from "@/components/app-shell";
import { useTranslation } from "@/components/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { MachinePreviewPanel } from "./MachinePreviewPanel";
import type { HomeStat, MachinePreview } from "./types";

type HeroSectionProps = {
  heroDescription: string;
  isAdmin: boolean;
  isStudent: boolean;
  machinePreview: MachinePreview[];
  panelCardDescription: string;
  panelCardTitle: string;
  panelTitle: string;
  stats: HomeStat[];
};

export function HeroSection({
  heroDescription,
  isAdmin,
  isStudent,
  machinePreview,
  panelCardDescription,
  panelCardTitle,
  panelTitle,
  stats,
}: HeroSectionProps) {
  const { t } = useTranslation();
  const startLoading = usePageTransition();

  return (
    <section className="relative min-h-[90vh] flex items-center overflow-hidden hero-glow grid-pattern">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 w-full">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="animate__animated animate__fadeInLeft">
              <Badge variant="outline" className="mb-6 border-primary/30 text-primary">
                <Wifi className="w-3 h-3 mr-1.5" />
                {t("homeBadge")}
              </Badge>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
                {t("homeTitle")} <span className="text-primary">{t("homeTitleAccent")}</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-lg">{heroDescription}</p>
              <div className="flex flex-wrap gap-3">
                {isAdmin ? (
                  <>
                    <Link href="/lab">
                      <Button size="lg" className="gap-2">
                        <Box className="w-4 h-4" />
                        {t("homeExploreLab")}
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link href="/dashboard">
                      <Button size="lg" variant="outline" className="gap-2">
                        <BarChart3 className="w-4 h-4" />
                        {t("homeViewDashboard")}
                      </Button>
                    </Link>
                  </>
                ) : isStudent ? (
                  <>
                    <Link href="/reservations" onClick={startLoading}>
                      <Button size="lg" className="gap-2">
                        <Activity className="w-4 h-4" />
                        {t("homeReserveMachine")}
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link href="/lab" onClick={startLoading}>
                      <Button size="lg" variant="outline" className="gap-2">
                        <Box className="w-4 h-4" />
                        {t("homeExploreLab")}
                      </Button>
                    </Link>
                    <Link href="/simulation" onClick={startLoading}>
                      <Button size="lg" variant="outline" className="gap-2">
                        <Play className="w-4 h-4" />
                        {t("homeOpenSimulation")}
                      </Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="/login">
                      <Button size="lg" className="gap-2">
                        <LogIn className="w-4 h-4" />
                        {t("homeStartNow")}
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Link href="/register">
                      <Button size="lg" variant="outline" className="gap-2">
                        <UserPlus className="w-4 h-4" />
                        {t("homeCreateAccount")}
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>

          <MachinePreviewPanel
            isAdmin={isAdmin}
            isStudent={isStudent}
            machinePreview={machinePreview}
            panelCardDescription={panelCardDescription}
            panelCardTitle={panelCardTitle}
            panelTitle={panelTitle}
            stats={stats}
          />
        </div>
      </div>
    </section>
  );
}
