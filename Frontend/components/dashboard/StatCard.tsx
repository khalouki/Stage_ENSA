import { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  value: string;
  label: string;
  color?: string;
  trend?: string;
  trendUp?: boolean;
}

export default function StatCard({ icon: Icon, value, label, color = "text-primary", trend, trendUp }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3 hover:shadow-lg hover:border-primary/30 transition-all group">
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        {trend && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${trendUp ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"}`}>
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}
