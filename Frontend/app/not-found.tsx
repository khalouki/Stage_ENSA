"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/components/i18n";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-white dark:bg-zinc-950 px-4 text-center transition-colors duration-300">
      <div className="flex flex-col items-center space-y-8">
        
        {/* Illustration Container */}
        <div className="w-64 h-64 md:w-80 md:h-80 relative">
          <Image 
            src="/404.svg" 
            alt={t("notFoundAlt")}
            fill
            className="object-contain dark:invert" // The invert filter helps adapt light-themed SVGs to dark mode
            priority
          />
        </div>

        {/* Text Content */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-white">{t("notFoundTitle")}</h1>
          <p className="max-w-sm text-zinc-500 dark:text-zinc-400">
            {t("notFoundDescription")}
          </p>
        </div>

        <Link 
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-medium hover:scale-105 transition-transform shadow-lg"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("notFoundBackHome")}
        </Link>
      </div>
    </div>
  );
}
