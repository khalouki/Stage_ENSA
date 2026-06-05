"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ScrollReveal } from "@/components/animation";
import { useTranslation } from "@/components/i18n";
import { Badge } from "@/components/ui/badge";

import type { HomeFeature } from "./types";

type FeaturesSectionProps = {
  description: string;
  features: HomeFeature[];
};

export function FeaturesSection({ description, features }: FeaturesSectionProps) {
  const { t } = useTranslation();

  return (
    <section className="py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal animation="fadeInUp">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 border-primary/30 text-primary">
              {t("homeFeaturesBadge")}
            </Badge>
            <h2 className="text-3xl font-bold mb-4">{t("homeFeaturesTitle")}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">{description}</p>
          </div>
        </ScrollReveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, titleKey, descriptionKey, color, bg, href }, index) => {
            const title = t(titleKey);
            const featureDescription = t(descriptionKey);

            return (
              <ScrollReveal key={title} animation="fadeInUp" delay={`${index * 0.08}s`}>
                <Link href={href}>
                  <div className="group bg-card border border-border rounded-xl p-6 hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer h-full">
                    <div
                      className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                    >
                      <Icon className={`w-6 h-6 ${color}`} />
                    </div>
                    <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors">{title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{featureDescription}</p>
                    <div className="flex items-center gap-1 mt-4 text-primary text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      {t("homeDiscover")} <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </Link>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
