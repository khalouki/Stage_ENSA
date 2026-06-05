"use client";

import { useMemo } from "react";
import { Activity, Bot, Cpu, Play, Wifi, Zap } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  FeaturesSection,
  HeroSection,
  HomeCta,
  StatsStrip,
  homeFeatures,
  useHomeData,
  type HomeStat,
} from "@/components/home";
import { useTranslation } from "@/components/i18n";
import AppLayout from "@/components/layout/AppLayout";

function HomePageContent() {
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const isAdmin = user?.role === "admin";
  const isStudent = Boolean(user && !isAdmin);
  const { activeUsers, labOverview, machineCount, machinePreview, statsLoaded } = useHomeData({
    user,
    token,
    isAdmin,
  });

  const stats = useMemo<HomeStat[]>(() => {
    if (!isAdmin) {
      return [
        {
          value: statsLoaded ? `${labOverview.availableCount}/${machineCount || 0}` : "--",
          label: t("homeAvailableMachines"),
          icon: Cpu,
        },
        {
          value: statsLoaded ? String(labOverview.connectedMachines || machineCount) : "--",
          label: t("homeLiveMachines"),
          icon: Wifi,
        },
        {
          value: statsLoaded ? `${labOverview.availability}%` : "--",
          label: t("homeLabAvailability"),
          icon: Activity,
        },
        {
          value: "G-code",
          label: t("homeSimulationAccess"),
          icon: Play,
        },
      ];
    }

    return [
      {
        value: statsLoaded ? String(labOverview.connectedMachines || machineCount) : "--",
        label: t("homeConnectedMachines"),
        icon: Cpu,
      },
      {
        value: statsLoaded ? String(labOverview.activeAlerts) : "--",
        label: t("homeActiveAlert"),
        icon: Zap,
      },
      {
        value: statsLoaded ? `${labOverview.availability}%` : "--",
        label: t("homeSystemAvailability"),
        icon: Activity,
      },
      {
        value: activeUsers == null ? "--" : String(activeUsers),
        label: t("homeActiveUsers"),
        icon: Bot,
      },
    ];
  }, [activeUsers, isAdmin, labOverview, machineCount, statsLoaded, t]);

  const heroDescription = isAdmin
    ? t("homeDescription")
    : isStudent
    ? t("homeStudentDescription", { name: user?.full_name.split(" ")[0] ?? "" })
    : t("homeVisitorDescription");

  const panelTitle = isAdmin
    ? t("homeLiveDashboard")
    : isStudent
    ? t("homeStudentWorkspace")
    : t("homePublicLabPreview");

  const panelCardTitle = isStudent ? t("homeStudentHeroCardTitle") : t("homeVisitorHeroCardTitle");
  const panelCardDescription = isStudent
    ? t("homeStudentHeroCardDescription")
    : t("homeVisitorHeroCardDescription");

  const visibleFeatures = useMemo(
    () => (isAdmin ? homeFeatures : homeFeatures.filter((feature) => feature.href !== "/dashboard")),
    [isAdmin],
  );

  const featuresDescription = isAdmin
    ? t("homeFeaturesDescription")
    : isStudent
    ? t("homeStudentFeaturesDescription")
    : t("homeVisitorFeaturesDescription");

  const ctaTitle = isAdmin ? t("homeAdminCtaTitle") : isStudent ? t("homeStudentCtaTitle") : t("homeCtaTitle");
  const ctaDescription = isAdmin
    ? t("homeAdminCtaDescription")
    : isStudent
    ? t("homeStudentCtaDescription")
    : t("homeCtaDescription");

  return (
    <div className="flex flex-col">
      <HeroSection
        heroDescription={heroDescription}
        isAdmin={isAdmin}
        isStudent={isStudent}
        machinePreview={machinePreview}
        panelCardDescription={panelCardDescription}
        panelCardTitle={panelCardTitle}
        panelTitle={panelTitle}
        stats={stats}
      />
      <StatsStrip stats={stats} />
      <FeaturesSection description={featuresDescription} features={visibleFeatures} />
      <HomeCta description={ctaDescription} isAdmin={isAdmin} isStudent={isStudent} title={ctaTitle} />
    </div>
  );
}

export default function HomePage() {
  return (
    <AppLayout>
      <HomePageContent />
    </AppLayout>
  );
}
