"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import Image from "next/image";
import { usePageTransition } from "@/components/app-shell";
import { useTranslation } from "@/components/i18n";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useTranslation();
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
      await login({ email, password });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-whitesmoke">
      {/* LEFT SIDE: LOGIN FORM */}
      <div className="flex flex-col justify-center w-full lg:w-1/2 px-8 md:px-16 lg:px-24">
        <div className="max-w-md w-full mx-auto animate-fadeIn">
          
          {/* LOGO ADDED HERE */}
          <Link 
            href="/" 
            onClick={loadingSpinner}
            className="inline-block mb-6 transition-transform hover:scale-105 active:scale-95"
          >
            <div className=" bg-white rounded-2xl flex items-center justify-center shadow-md border border-slate-100 overflow-hidden">
              <Image 
                src="/logo.png" // Ensure this path matches your public folder
                alt="FabLab Logo"
                width={108}
                height={108}
                className="object-contain"
              />
            </div>
          </Link>

          <h1 className="text-3xl font-bold mb-2">{t("loginTitle")}</h1>
          <p className="text-sm text-muted-foreground mb-8">
            {t("loginSubtitle")}
          </p>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full border border-border rounded-lg px-4 py-2.5 bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-input"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">
                {t("loginPassword")}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full border border-border rounded-lg px-4 py-2.5 bg-background focus:ring-2 focus:ring-primary/20 outline-none transition-all shadow-input pr-12"
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
              <p className="text-sm text-red-500 font-medium bg-red-50 p-3 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {loading ? t("loginSubmitting") : t("loginSubmit")}
            </button>
          </form>

          <p className="text-sm text-muted-foreground mt-6 text-center lg:text-left">
            {t("loginNoAccount")}{" "}
            <Link
              href="/register"
              onClick={loadingSpinner}
              className="text-primary font-semibold hover:underline"
            >
              {t("loginRegisterNow")}
            </Link>
          </p>
        </div>
      </div>

      {/* RIGHT SIDE: ILLUSTRATION */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-7 relative overflow-hidden animate-slideInRight">
        <div className="relative z-10 text-center">
          <div className="w-96 h-96 bg-primary/10 rounded-full flex items-center justify-center  mx-auto">
            <Image
              src="/login.svg"
              alt="Illustration"
              width={400}
              height={400}
              className="object-contain"
            />
          </div>

          <h2 className="text-3xl font-bold text-slate-800">{t("loginHeroTitle")}</h2>
          <p className="text-white mt-2 max-w-sm">
            {t("loginHeroDescription")}
          </p>
        </div>

        <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
      </div>
    </div>
  );
}
