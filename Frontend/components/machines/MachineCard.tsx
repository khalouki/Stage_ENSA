import Link from "next/link";
import { Activity, Thermometer, Zap } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "@/components/i18n";

interface Machine {
  id: string;
  name: string;
  type: string;
  status: "running" | "idle" | "error" | "maintenance";
  health: number;
  temperature: number;
  speed: number;
  icon: string;
}

const statusConfig = {
  running: { labelKey: "statusRunning", color: "bg-green-500", textColor: "text-green-600 dark:text-green-400", badge: "default" as const },
  idle: { labelKey: "statusIdle", color: "bg-yellow-500", textColor: "text-yellow-600 dark:text-yellow-400", badge: "secondary" as const },
  error: { labelKey: "statusError", color: "bg-red-500", textColor: "text-red-600 dark:text-red-400", badge: "destructive" as const },
  maintenance: { labelKey: "statusMaintenance", color: "bg-blue-500", textColor: "text-blue-600 dark:text-blue-400", badge: "outline" as const },
};

export default function MachineCard({ machine }: { machine: Machine }) {
  const { t } = useTranslation();
  const status = statusConfig[machine.status];
  return (
    <Link href={`/machines/${machine.id}`}>
      <div className="bg-card border border-border rounded-xl p-5 hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer group">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="text-3xl">{machine.icon}</div>
            <div>
              <h3 className="font-semibold group-hover:text-primary transition-colors">{machine.name}</h3>
              <p className="text-xs text-muted-foreground">{machine.type}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`relative w-2 h-2 rounded-full ${status.color}`}>
              {machine.status === "running" && (
                <span className={`absolute inset-0 rounded-full ${status.color} animate-ping opacity-75`}></span>
              )}
            </div>
            <span className={`text-xs font-medium ${status.textColor}`}>{t(status.labelKey as never)}</span>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground flex items-center gap-1"><Activity className="w-3 h-3" /> {t("dashboardHealth")}</span>
              <span className={`font-semibold ${machine.health >= 80 ? "text-green-600 dark:text-green-400" : machine.health >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>{machine.health}%</span>
            </div>
            <Progress value={machine.health} className="h-1.5" />
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Thermometer className="w-3.5 h-3.5 text-orange-500" />
              <span>{machine.temperature}°C</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="w-3.5 h-3.5 text-yellow-500" />
              <span>{machine.speed} RPM</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
