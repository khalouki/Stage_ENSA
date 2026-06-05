"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { profileSchema, ProfileFormValues } from "@/lib/schemas";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/components/toast/ToastProvider";
import type { AuthUser } from "@/components/auth/AuthProvider";
import { useTranslation } from "@/components/i18n";

type ProfileFormProps = {
  user: AuthUser;
  token: string;
  onUpdate: (user: AuthUser) => void;
};

export function ProfileForm({ user, token, onUpdate }: ProfileFormProps) {
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: user?.full_name || "",
      email: user?.email || "",
    },
  });

  const onSubmit = async (data: ProfileFormValues) => {
    setLoading(true);
    try {
      const updated = await apiRequest<AuthUser>("/auth/me", {
        method: "PUT",
        token,
        body: JSON.stringify(data),
      });
      onUpdate(updated);
      showToast({ type: "success", message: t("profileUpdated") });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("profileUpdateFailed");
      showToast({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 bg-card p-6 rounded-2xl border">
      <div className="grid gap-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">{t("profileFullName")}</label>
          <input 
            {...register("full_name")} 
            className="w-full rounded-xl border bg-background px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
          />
          {errors.full_name && <p className="text-red-500 text-xs mt-1">{errors.full_name.message}</p>}
        </div>
        <div>
          <label className="text-sm font-medium mb-1.5 block">{t("profileEmailAddress")}</label>
          <input 
            {...register("email")} 
            className="w-full rounded-xl border bg-background px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>
      </div>
      <Button type="submit" disabled={loading || !isDirty} className="gap-2">
        <Save size={16} />
        {loading ? t("commonSaving") : t("profileSaveChanges")}
      </Button>
    </form>
  );
}
