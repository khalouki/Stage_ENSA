import { Activity, Box, Brain, Cpu, Play } from "lucide-react";

import type { HomeFeature } from "./types";

export const homeFeatures: HomeFeature[] = [
  {
    icon: Box,
    titleKey: "featureImmersionTitle",
    descriptionKey: "featureImmersionDescription",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    href: "/lab",
  },
  {
    icon: Cpu,
    titleKey: "featureMachineTitle",
    descriptionKey: "featureMachineDescription",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    href: "/lab",
  },
  {
    icon: Play,
    titleKey: "featureSimulationTitle",
    descriptionKey: "featureSimulationDescription",
    color: "text-green-500",
    bg: "bg-green-500/10",
    href: "/simulation",
  },
  {
    icon: Activity,
    titleKey: "featureMonitoringTitle",
    descriptionKey: "featureMonitoringDescription",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    href: "/dashboard",
  },
  {
    icon: Brain,
    titleKey: "featureMaintenanceTitle",
    descriptionKey: "featureMaintenanceDescription",
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    href: "/dashboard",
  },
];
