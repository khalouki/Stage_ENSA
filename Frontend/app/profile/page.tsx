"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { User, ShieldCheck, Mail, Lock } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import AppLayout from "@/components/layout/AppLayout";
import { useTranslation } from "@/components/i18n";
import { PasswordForm, ProfileForm } from "@/components/profile";

export default function ProfilePage() {
  const { user, token, loading, setCurrentUser } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  if (loading || !user) return null;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex flex-col md:flex-row gap-8">
          
          {/* Left Column: User Card */}
          <aside className="w-full md:w-80 space-y-6">
            <div className="bg-card border rounded-3xl p-8 text-center shadow-sm">
              <div className="mx-auto w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-4">
                <User size={48} />
              </div>
              <h2 className="text-xl font-bold">{user.full_name}</h2>
              <p className="text-muted-foreground text-sm">{user.email}</p>
              <div className="mt-6 pt-6 border-t space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("profileStatus")}</span>
                  <span className="font-medium text-green-600">{t("usersActive")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("usersRole")}</span>
                  <span className="font-medium">{user.role === "admin" ? t("roleAdmin") : t("roleStudent")}</span>
                </div>
              </div>
            </div>
          </aside>

          {/* Right Column: Settings */}
          <div className="flex-1 space-y-8">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Mail className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">{t("profilePersonalInfo")}</h3>
              </div>
              <ProfileForm user={user} token={token!} onUpdate={setCurrentUser} />
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Lock className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">{t("profileSecurity")}</h3>
              </div>
              <PasswordForm token={token!} />
              
              <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl flex gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  {t("profilePasswordAdvice")}
                </p>
              </div>
            </section>
          </div>
          
        </div>
      </div>
    </AppLayout>
  );
}
