"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { passwordSchema, PasswordFormValues } from "@/lib/schemas";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/components/toast/ToastProvider";
import { useTranslation } from "@/components/i18n";

export function PasswordForm({ token }: { token: string }) {
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
  });

  const onSubmit = async (data: PasswordFormValues) => {
    setLoading(true);
    try {
      await apiRequest("/auth/change-password", {
        method: "POST",
        token,
        body: JSON.stringify(data),
      });
      showToast({ type: "success", message: t("profilePasswordUpdated") });
      reset(); // Clear the form fields
    } catch (err) {
      const message = err instanceof Error ? err.message : t("profilePasswordFailed");
      showToast({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 bg-card p-6 rounded-2xl border">
      <div className="space-y-4">
        {/* Current Password */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">{t("profileCurrentPassword")}</label>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              {...register("current_password")}
              className="w-full rounded-xl border bg-background px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {errors.current_password && (
            <p className="text-red-500 text-xs mt-1">{errors.current_password.message}</p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* New Password */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("profileNewPassword")}</label>
            <input
              type="password"
              {...register("new_password")}
              className="w-full rounded-xl border bg-background px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
              placeholder={t("profilePasswordHint")}
            />
            {errors.new_password && (
              <p className="text-red-500 text-xs mt-1">{errors.new_password.message}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t("profileConfirmPassword")}</label>
            <input
              type="password"
              {...register("confirm_new_password")}
              className="w-full rounded-xl border bg-background px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
              placeholder={t("profileRepeatPassword")}
            />
            {errors.confirm_new_password && (
              <p className="text-red-500 text-xs mt-1">{errors.confirm_new_password.message}</p>
            )}
          </div>
        </div>
      </div>

      <Button type="submit" disabled={loading} className="gap-2 w-full sm:w-auto">
        <KeyRound size={16} />
        {loading ? t("profileUpdating") : t("profileUpdatePassword")}
      </Button>
    </form>
  );
}
