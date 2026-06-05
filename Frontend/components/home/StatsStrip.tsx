import { ScrollReveal } from "@/components/animation";

import type { HomeStat } from "./types";

type StatsStripProps = {
  stats: HomeStat[];
};

export function StatsStrip({ stats }: StatsStripProps) {
  return (
    <section className="border-y border-border bg-card/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map(({ value, label, icon: Icon }, index) => (
            <ScrollReveal key={label} animation="fadeInUp" delay={`${index * 0.1}s`}>
              <div className="text-center">
                <div className="flex justify-center mb-2">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                </div>
                <p className="text-3xl font-bold">{value}</p>
                <p className="text-sm text-muted-foreground mt-1">{label}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
