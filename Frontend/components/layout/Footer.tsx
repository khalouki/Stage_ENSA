"use client";

import { MapPin, Mail, Phone, Globe, Github, GraduationCap, Building2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useTranslation } from "@/components/i18n";

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className=" border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto px-6 py-10">
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 pb-4">
          
          {/* Section 1: Branding & Identity */}
          <div className="space-y-4">
            <div className="inline-block p-1.5 bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800">
              <Link href="/" className="cursor-pointer">
                 <Image 
                    src="/logo.png" 
                    className="h-10 w-auto object-contain" 
                    alt="ENSA Logo" 
                    width={400}
                    height={400}
                  />
              </Link>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{t("footerDescription")}</p>
            <div className="flex items-center gap-3 pt-2">
              <a href="https://github.com/khalouki" className="p-2 bg-white dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-800 hover:text-primary transition-all">
                <Github className="w-4 h-4" />
              </a>
              <a href="https://www.linkedin.com/in/abdelkhalk-essaid/" className="p-2 bg-white dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-800 hover:text-primary transition-all">
                <Globe className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Section 2: ENSA Info (Academic Context) */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              {t("footerInstitution")}
            </h4>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-sm text-slate-500 dark:text-slate-400">
                <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>{t("footerAddress")}</span>
              </li>
              <li className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                <GraduationCap className="w-4 h-4 text-primary shrink-0" />
                <span>{t("footerUniversity")}</span>
              </li>
            </ul>
          </div>

          {/* Section 3: Contact Direct */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              {t("footerContact")}
            </h4>
            <div className="space-y-3">
              <a href="mailto:contact@ensa-bm.ac.ma" className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition-colors">
                <Mail className="w-4 h-4" />
                ensabm.contact@usms.ma
              </a>
              <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                <Phone className="w-4 h-4" />
                +212 0XXXXXXXXX
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Bar: Clean & Minimal */}
        <div className="pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400">
            © 2026 <span className="text-slate-900 dark:text-slate-200">FabLab ENSA Béni Mellal</span>
          </p>
          
          <div className="px-3 py-1 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t("footerDevelopedBy")} <span className="font-bold text-primary tracking-tight">ESSAID ABDELKHALEK</span>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
