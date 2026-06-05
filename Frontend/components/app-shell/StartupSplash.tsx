"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslation } from "@/components/i18n";

export default function StartupSplash() {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 35;
      });
    }, 150);

    const timeout = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => setVisible(false), 800);
    }, 2400);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-9999 flex items-center justify-center transition-all duration-700 ease-in-out 
        ${isExiting ? "opacity-0 scale-[1.1] blur-xl" : "opacity-100 scale-100"}
        bg-white dark:bg-[#0f172a]`}
    >
      {/* Dynamic Glow Accents - Only visible/prominent in dark mode */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-400/10 dark:bg-blue-600/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-400/10 dark:bg-indigo-600/20 rounded-full blur-[120px] animate-pulse" />

      <div className="relative w-full max-w-md px-10">
        <div className="flex flex-col items-center">
          {/* Professional Tech Icon Container */}
          <div className="mb-8 relative group">
            <div className="absolute -inset-1 rounded-2xl blur opacity-25 dark:opacity-75 group-hover:opacity-100 transition duration-1000 animate-tilt bg-blue-500"></div>
            <div className="relative h-20 w-40 rounded-2xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center border border-slate-200 dark:border-slate-700/50 shadow-xl dark:shadow-2xl">
              <Image
                src="/logo.png"
                alt="Logo"
                width={120}
                height={40}
                className="object-contain dark:brightness-110"
              />
            </div>
          </div>

          {/* Branding */}
          <h1 className="text-3xl font-light tracking-tight text-slate-900 dark:text-white mb-1">
            {t("startupTitle")}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-[10px] font-bold tracking-[0.4em] uppercase mb-12">
            {t("startupInitializing")}
          </p>

          {/* Progress Section */}
          <div className="w-full max-w-[280px] space-y-4">
            <div className="relative h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300 ease-out shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-black text-blue-600/80 dark:text-blue-500/70 uppercase tracking-[0.2em]">
                {progress < 100 ? t("startupLoading") : t("startupOnline")}
              </span>
              <span className="text-xs font-mono font-bold text-slate-700 dark:text-white">
                {Math.round(progress)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
