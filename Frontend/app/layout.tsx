import type { Metadata } from "next";
import "./globals.css";
import { PageTransition, StartupSplash, ThemeProvider } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { TranslationProvider } from "@/components/i18n";
import { ToastProvider } from "@/components/toast/ToastProvider";

export const metadata: Metadata = {
  title: "FabLab ENSA — Industrie 4.0",
  icons: {
    icon: "/icone.png",          // app/icon.png
    apple: "/icone.png",   // app/apple-icon.png (for iOS)
  },
  description: "Plateforme de FabLab virtuel intelligent — Jumeau numérique, IIoT et maintenance prédictive par IA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <TranslationProvider>
            <ToastProvider>
              <AuthProvider>
                <StartupSplash />
                <PageTransition />
                {children}
              </AuthProvider>
            </ToastProvider>
          </TranslationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
