"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { usePageTransition } from "@/components/app-shell";
import Image from "next/image"; // Import Image
import { ScrollReveal } from "@/components/animation";
import { useTranslation } from "@/components/i18n";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const { t } = useTranslation();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingSpinner = usePageTransition();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register({ full_name: fullName, email, password });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("registerFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* LEFT SIDE: ILLUSTRATION & INFO */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12 relative overflow-hidden">
        <div className="relative z-10 text-white max-w-sm">
          <div className="mb-8">
            {/* LOGO REPLACEMENT: Now a Link to / */}
            <Link 
              href="/" 
              onClick={loadingSpinner}
              className="inline-block transition-transform hover:scale-105 active:scale-95"
            >
              <div className=" bg-white rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-primary-foreground/10 overflow-hidden border border-white/20">
                <Image 
                  src="/logo.png" // Replace with your actual logo path (e.g., /logo.svg)
                  alt="FabLab Logo"
                  width={164}
                  height={164}
                  className="object-contain p-2"
                />
              </div>
            </Link>
            
            <h2 className="text-4xl font-bold mb-4">{t("registerHeroTitle")}</h2>
            <p className="text-primary-foreground/80 text-lg">
              {t("registerHeroDescription")}
            </p>
          </div>
          
          <ul className="space-y-4">
            {[
              t("registerBenefitModeling"),
              t("registerBenefitCollaborate"),
              t("registerBenefitTrack")
            ].map((text, i) => (
              <li key={i} className="flex items-center gap-3">
                <div className="shrink-0 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
                  ✓
                </div>
                <ScrollReveal  animation="fadeInUp">
                <span className="text-sm font-medium">{text}</span>
                </ScrollReveal>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-96 h-96 border-4 border-white rounded-full" />
          <div className="absolute bottom-[20%] right-[-5%] w-64 h-64 border-2 border-white rounded-full" />
        </div>
      </div>

      {/* RIGHT SIDE: REGISTRATION FORM */}
      <div className="flex flex-col justify-center w-full lg:w-1/2 px-8 md:px-16 lg:px-24">
        <div className="max-w-md w-full mx-auto">
          <h1 className="text-3xl font-bold mb-2">{t("registerTitle")}</h1>
          <p className="text-sm text-muted-foreground mb-8">
            {t("registerSubtitle")}
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t("registerFullName")}</label>
              <input
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="w-full border border-border rounded-lg px-4 py-2.5 bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">{t("commonEmail")}</label>
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border border-border rounded-lg px-4 py-2.5 bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">{t("loginPassword")}</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full border border-border rounded-lg px-4 py-2.5 bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all pr-12"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors p-1"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 p-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 font-semibold hover:opacity-90 transition-all shadow-sm active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? t("registerSubmitting") : t("registerSubmit")}
            </button>
          </form>

          <p className="text-sm text-muted-foreground mt-8 text-center">
            {t("registerAlready")}{" "}
            <Link 
              href="/login" 
              onClick={loadingSpinner}
              className="text-primary font-semibold hover:underline"
            >
              {t("registerSignIn")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
