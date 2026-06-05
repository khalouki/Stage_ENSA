"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, ToggleLeft, ToggleRight } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import AppLayout from "@/components/layout/AppLayout";
import { useTranslation } from "@/components/i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/api";

type User = {
  id: number;
  full_name: string;
  email: string;
  role: "student" | "admin";
  is_active: boolean;
  created_at: string;
};

type UserList = {
  total: number;
  page: number;
  page_size: number;
  items: User[];
};

function UsersContent() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const { t } = useTranslation();
  const [rows, setRows] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | "student" | "admin">("");
  const [status, setStatus] = useState<"" | "true" | "false">("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pendingAction, setPendingAction] = useState<{ type: "role" | "status"; user: User } | null>(null);
  const [isApplyingAction, setIsApplyingAction] = useState(false);
  const pageSize = 10;

  const loadRows = useCallback(async (targetPage = page) => {
    if (!token) return;
    setIsLoadingRows(true);
    setError(null);
    const query = new URLSearchParams({
      page: String(targetPage),
      page_size: String(pageSize),
    });
    if (search.trim()) query.set("search", search.trim());
    if (role) query.set("role", role);
    if (status) query.set("is_active", status);
    try {
      const data = await apiRequest<UserList>(`/admin/users?${query.toString()}`, { token });
      setRows(data.items);
      setTotal(data.total);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : t("usersLoadFailed"));
    } finally {
      setIsLoadingRows(false);
    }
  }, [page, role, search, status, t, token]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    if (user.role !== "admin") {
      router.push("/");
      return;
    }
    if (!token) return;
    void loadRows();
  }, [loadRows, loading, page, role, router, status, token, user]);

  const toggleUser = async (current: User) => {
    if (!token) return;
    setError(null);
    try {
      await apiRequest<User>(`/admin/users/${current.id}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ is_active: !current.is_active }),
      });
      await loadRows(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("usersUpdateFailed"));
    }
  };

  const switchRole = async (current: User) => {
    if (!token) return;
    const nextRole = current.role === "admin" ? "student" : "admin";
    setError(null);
    try {
      await apiRequest<User>(`/admin/users/${current.id}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ role: nextRole }),
      });
      await loadRows(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("usersRoleUpdateFailed"));
    }
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    setIsApplyingAction(true);
    try {
      if (pendingAction.type === "role") {
        await switchRole(pendingAction.user);
      } else {
        await toggleUser(pendingAction.user);
      }
      setPendingAction(null);
    } finally {
      setIsApplyingAction(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mb-9">
      <h1 className="text-2xl font-bold mb-6">{t("usersTitle")}</h1>
      <div className="grid md:grid-cols-4 gap-3 mb-4">
        <input
          className="border border-border rounded-lg px-3 py-2 bg-background"
          placeholder={t("usersSearchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select className="border border-border rounded-lg px-3 py-2 bg-background" value={role} onChange={(event) => setRole(event.target.value as "" | "student" | "admin")}>
          <option value="">{t("usersAllRoles")}</option>
          <option value="student">{t("roleStudent")}</option>
          <option value="admin">{t("roleAdmin")}</option>
        </select>
        <select className="border border-border rounded-lg px-3 py-2 bg-background" value={status} onChange={(event) => setStatus(event.target.value as "" | "true" | "false")}>
          <option value="">{t("usersAllStatus")}</option>
          <option value="true">{t("usersActive")}</option>
          <option value="false">{t("usersInactive")}</option>
        </select>
        <button className="bg-primary text-primary-foreground rounded-lg px-3 py-2" onClick={() => { setPage(1); void loadRows(1); }}>
          {t("usersSearch")}
        </button>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-3">{t("usersName")}</th>
              <th className="text-left px-4 py-3">{t("usersEmail")}</th>
              <th className="text-left px-4 py-3">{t("usersRole")}</th>
              <th className="text-left px-4 py-3">{t("commonStatus")}</th>
              <th className="text-left px-4 py-3">{t("usersCreated")}</th>
              <th className="text-left px-4 py-3">{t("commonActions")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoadingRows ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("usersLoading")}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("usersNone")}
                </td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-3">{row.full_name}</td>
                <td className="px-4 py-3">{row.email}</td>
                <td className="px-4 py-3">{row.role === "admin" ? t("roleAdmin") : t("roleStudent")}</td>
                <td className="px-4 py-3">{row.is_active ? t("usersActive") : t("usersInactive")}</td>
                <td className="px-4 py-3">{new Date(row.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                      onClick={() => setPendingAction({ type: "role", user: row })}
                      title={row.role === "admin" ? t("usersSwitchStudent") : t("usersSwitchAdmin")}
                    >
                      <Shield className="h-3.5 w-3.5" />
                      {row.role === "admin" ? t("usersMakeStudent") : t("usersMakeAdmin")}
                    </button>
                    <button
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        row.is_active
                          ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white"
                          : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white"
                      }`}
                      onClick={() => setPendingAction({ type: "status", user: row })}
                      title={row.is_active ? t("usersDisableUser") : t("usersEnableUser")}
                    >
                      {row.is_active ? <ToggleLeft className="h-3.5 w-3.5" /> : <ToggleRight className="h-3.5 w-3.5" />}
                      {row.is_active ? t("usersDisable") : t("usersEnable")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 text-sm">
        <button className="border border-border rounded px-3 py-1 disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>
          {t("usersPrev")}
        </button>
        <span>
          {t("usersPage")} {page} / {totalPages}
        </span>
        <button className="border border-border rounded px-3 py-1 disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)}>
          {t("usersNext")}
        </button>
      </div>

      <AlertDialog open={pendingAction !== null} onOpenChange={(open) => !open && !isApplyingAction && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.type === "role"
                ? t("usersChangeRoleTitle")
                : pendingAction?.user.is_active
                ? t("usersDisableTitle")
                : t("usersEnableTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.type === "role"
                ? t("usersChangeRoleDescription", {
                    name: pendingAction.user.full_name,
                    role: pendingAction.user.role === "admin" ? t("roleStudent") : t("roleAdmin"),
                  })
                : pendingAction?.user.is_active
                ? t("usersDisableDescription", { name: pendingAction.user.full_name })
                : t("usersEnableDescription", { name: pendingAction?.user.full_name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApplyingAction}>{t("commonCancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isApplyingAction}
              onClick={(event) => {
                event.preventDefault();
                void confirmPendingAction();
              }}
            >
              {isApplyingAction ? t("usersApplying") : t("commonConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function UsersPage() {
  return (
    <AppLayout>
      <UsersContent />
    </AppLayout>
  );
}
