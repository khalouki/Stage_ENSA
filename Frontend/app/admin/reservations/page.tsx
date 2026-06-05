"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTranslation } from "@/components/i18n";
import { useToast } from "@/components/toast/ToastProvider";
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
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";

type AdminReservation = {
  id: number;
  user_id: number;
  machine_id: number;
  user_name: string;
  user_email: string;
  machine_name: string;
  date: string;
  start_time: string;
  end_time: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  note?: string | null;
};

function AdminReservationsContent() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [rows, setRows] = useState<AdminReservation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reservationToDelete, setReservationToDelete] = useState<AdminReservation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadRows = async () => {
    if (!token) return;
    const data = await apiRequest<AdminReservation[]>("/admin/reservations", { token });
    setRows(data);
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }
    if (!loading && user?.role !== "admin") {
      router.push("/");
      return;
    }
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, token]);

  const decide = async (reservationId: number, action: "approve" | "reject") => {
    if (!token) return;
    setError(null);
    try {
      await apiRequest(`/admin/reservations/${reservationId}/${action}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ note: null }),
      });
      if (action === "approve") {
        showToast({ type: "success", message: t("adminReservationsApproved") });
      } else {
        showToast({ type: "warning", message: t("adminReservationsRejected") });
      }
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminReservationsActionFailed"));
      showToast({ type: "error", message: t("adminReservationsUpdateFailed") });
    }
  };

  const deleteReservation = async () => {
    if (!token || !reservationToDelete) return;
    setError(null);
    setIsDeleting(true);
    try {
      await apiRequest<void>(`/admin/reservations/${reservationToDelete.id}`, {
        method: "DELETE",
        token,
      });
      showToast({ type: "success", message: t("adminReservationsDeleted") });
      setReservationToDelete(null);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminReservationsDeleteFailed"));
      showToast({ type: "error", message: t("adminReservationsDeleteFailed") });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mb-9">
      <h1 className="text-2xl font-bold mb-6">{t("adminReservationsTitle")}</h1>
      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm ">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-3">{t("adminReservationsStudent")}</th>
              <th className="text-left px-4 py-3">{t("commonMachine")}</th>
              <th className="text-left px-4 py-3">{t("commonDate")}</th>
              <th className="text-left px-4 py-3">{t("commonTime")}</th>
              <th className="text-left px-4 py-3">{t("commonStatus")}</th>
              <th className="text-left px-4 py-3">{t("commonActions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div>{row.user_name}</div>
                  <div className="text-xs text-muted-foreground">{row.user_email}</div>
                </td>
                <td className="px-4 py-3">{row.machine_name}</td>
                <td className="px-4 py-3">{row.date}</td>
                <td className="px-4 py-3">
                  {row.start_time.slice(0, 5)} - {row.end_time.slice(0, 5)}
                </td>
                <td className="px-4 py-3">
                  {t(`status${row.status.charAt(0).toUpperCase()}${row.status.slice(1)}` as never)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {row.status === "pending" && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void decide(row.id, "approve")}
                        >
                          {t("adminReservationsApprove")}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => void decide(row.id, "reject")}
                        >
                          {t("adminReservationsReject")}
                        </Button>
                      </>
                    )}
                    {row.status !== "pending" && (
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50 hover:text-red-700"
                        title={t("adminReservationsDelete")}
                        aria-label={t("adminReservationsDelete")}
                        onClick={() => setReservationToDelete(row)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog
        open={reservationToDelete !== null}
        onOpenChange={(open) => !open && !isDeleting && setReservationToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("adminReservationsDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("adminReservationsDeleteDescription", {
                student: reservationToDelete?.user_name ?? t("adminReservationsThisReservation"),
                machine: reservationToDelete?.machine_name ?? "",
              })}
              {` ${t("adminReservationsCannotUndo")}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("commonCancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void deleteReservation();
              }}
            >
              {isDeleting ? t("adminReservationsDeleting") : t("adminReservationsDeleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AdminReservationsPage() {
  return (
    <AppLayout>
      <AdminReservationsContent />
    </AppLayout>
  );
}
