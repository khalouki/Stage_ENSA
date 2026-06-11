"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import { usePageTransition } from "@/components/app-shell";
import { useTranslation } from "@/components/i18n";
import { useToast } from "@/components/toast/ToastProvider";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const loadingSpinner = usePageTransition();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    showToast({
      type: "info",
      message: t("forgotPasswordUnavailable"),
      duration: 6000,
    });
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 sm:px-6">
      <div className="absolute inset-0 grid-pattern opacity-70 dark:opacity-30" />
      <div className="absolute -left-32 top-12 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="absolute -right-32 bottom-12 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />

      <section className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card/95 p-6 shadow-2xl backdrop-blur sm:p-8">
        <Link
          href="/"
          onClick={loadingSpinner}
          className="mb-7 inline-flex rounded-2xl border border-border bg-white shadow-md transition-transform hover:scale-105 active:scale-95"
          aria-label={t("forgotPasswordHome")}
        >
          <Image
            src="/logo.png"
            alt="FabLab Logo"
            width={92}
            height={92}
            className="object-contain"
          />
        </Link>

        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Mail className="h-6 w-6" aria-hidden="true" />
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-card-foreground">
          {t("forgotPasswordTitle")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t("forgotPasswordDescription")}
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="forgot-password-email" className="mb-1.5 block text-sm font-medium">
              {t("commonEmail")}
            </label>
            <input
              id="forgot-password-email"
              type="email"
              placeholder="name@gmail.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 shadow-input outline-none transition-all placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20"
              autoComplete="email"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-primary py-2.5 font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
          >
            {t("forgotPasswordSubmit")}
          </button>
        </form>

        <Link
          href="/login"
          onClick={loadingSpinner}
          className="mt-7 flex items-center justify-center gap-2 text-sm font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("forgotPasswordBackToLogin")}
        </Link>
      </section>
    </main>
  );
}
