"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Box, Play, UserPlus } from "lucide-react";

import { ScrollReveal } from "@/components/animation";
import { useTranslation } from "@/components/i18n";
import { Button } from "@/components/ui/button";

type HomeCtaProps = {
  description: string;
  isAdmin: boolean;
  isStudent: boolean;
  title: string;
};

export function HomeCta({ description, isAdmin, isStudent, title }: HomeCtaProps) {
  const { t } = useTranslation();

  return (
    <section className="py-20 bg-primary/5 border-y border-primary/10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <ScrollReveal animation="fadeInUp">
          <h2 className="text-3xl font-bold mb-4">{title}</h2>
          <p className="text-muted-foreground mb-8">{description}</p>
          <div className="flex flex-wrap gap-3 justify-center">
            {isAdmin ? (
              <>
                <Link href="/dashboard">
                  <Button size="lg" className="gap-2">
                    <BarChart3 className="w-4 h-4" />
                    {t("homeViewDashboard")}
                  </Button>
                </Link>
                <Link href="/lab">
                  <Button size="lg" variant="outline" className="gap-2">
                    <Box className="w-4 h-4" />
                    {t("homeExploreLab")}
                  </Button>
                </Link>
              </>
            ) : isStudent ? (
              <>
                <Link href="/reservations">
                  <Button size="lg" className="gap-2">
                    {t("homeReserveMachine")} <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href="/simulation">
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
                    {t("homeStartNow")} <ArrowRight className="w-4 h-4" />
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
        </ScrollReveal>
      </div>
    </section>
  );
}
