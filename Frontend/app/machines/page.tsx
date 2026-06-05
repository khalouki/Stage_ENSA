"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Move3D, Pencil, RotateCw, Scaling, Trash2 } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import AppLayout from "@/components/layout/AppLayout";
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
import { apiRequest } from "@/lib/api";

type MachineType = {
  id: number;
  code: string;
  name: string;
  model_path: string;
  default_scale: number;
};

type Machine = {
  id: number;
  name: string;
  machine_type_id: number;
  machine_type_code: string;
  machine_type_name: string;
  model_path: string;
  status: "available" | "busy" | "offline" | "maintenance";
  notes?: string | null;
  position_x: number;
  position_y: number;
  position_z: number;
  rotation_x: number;
  rotation_y: number;
  rotation_z: number;
  scale_x: number;
  scale_y: number;
  scale_z: number;
};

const STATUS_OPTIONS = ["available", "busy", "offline", "maintenance"] as const;

type PendingStatusChange = {
  machine: Machine;
  status: Machine["status"];
};

function MachinesContent() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [rows, setRows] = useState<Machine[]>([]);
  const [types, setTypes] = useState<MachineType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    machine_type_id: 0,
    status: "available" as Machine["status"],
    notes: "",
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [machineToDelete, setMachineToDelete] = useState<Machine | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<number | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<PendingStatusChange | null>(null);
  const [pendingPlacementSave, setPendingPlacementSave] = useState(false);
  const [isPlacementSaving, setIsPlacementSaving] = useState(false);
  const [placementForm, setPlacementForm] = useState({
    position_x: 0,
    position_y: 0,
    position_z: 0,
    rotation_x: 0,
    rotation_y: 0,
    rotation_z: 0,
    scale_x: 1,
    scale_y: 1,
    scale_z: 1,
  });

  const loadRows = async () => {
    if (!token) return;
    const [machinesData, typesData] = await Promise.all([
      apiRequest<Machine[]>("/machines", { token }),
      apiRequest<MachineType[]>("/machine-types", { token }),
    ]);
    setRows(machinesData);
    setTypes(typesData);
    setForm((prev) => ({ ...prev, machine_type_id: prev.machine_type_id || typesData[0]?.id || 0 }));
  };

  useEffect(() => {
    if (loading) return;
    if (!loading && !user) {
      router.push("/login");
      return;
    }
    if (!loading && user?.role !== "admin") {
      return;
    }
    void loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, token]);

  const createMachine = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    setError(null);
    try {
      await apiRequest<Machine>("/machines", {
        method: "POST",
        token,
        body: JSON.stringify({ ...form, notes: form.notes.trim() || null }),
      });
      showToast({ type: "success", message: t("machinesAdded") });
      setForm((prev) => ({ ...prev, name: "", notes: "" }));
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("machinesCreateFailed"));
      showToast({ type: "error", message: t("machinesAddFailed") });
    }
  };

  const deleteMachine = async () => {
    if (!machineToDelete) return;
    if (!token) return;
    setError(null);
    setIsDeleting(true);
    try {
      await apiRequest<void>(`/machines/${machineToDelete.id}`, { method: "DELETE", token });
      showToast({ type: "success", message: t("machinesDeleted") });
      setMachineToDelete(null);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("machinesDeleteFailed"));
      showToast({ type: "error", message: t("machinesDeleteFailed") });
    } finally {
      setIsDeleting(false);
    }
  };

  const startEditPlacement = (row: Machine) => {
    setEditingId(row.id);
    setPlacementForm({
      position_x: row.position_x,
      position_y: row.position_y,
      position_z: row.position_z,
      rotation_x: row.rotation_x,
      rotation_y: row.rotation_y,
      rotation_z: row.rotation_z,
      scale_x: row.scale_x,
      scale_y: row.scale_y,
      scale_z: row.scale_z,
    });
  };

  const confirmPlacementSave = async () => {
    if (!token || editingId === null) return;
    setError(null);
    setIsPlacementSaving(true);
    try {
      await apiRequest<Machine>(`/machines/${editingId}`, {
        method: "PUT",
        token,
        body: JSON.stringify(placementForm),
      });
      showToast({ type: "success", message: t("machinesPositionUpdated") });
      setPendingPlacementSave(false);
      setEditingId(null);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("machinesPlacementUpdateFailed"));
      showToast({ type: "error", message: t("machinesPositionUpdateFailed") });
    } finally {
      setIsPlacementSaving(false);
    }
  };

  const requestStatusChange = (machine: Machine, status: Machine["status"]) => {
    if (status === machine.status) return;
    setPendingStatusChange({ machine, status });
  };

  const confirmStatusChange = async () => {
    if (!token || !pendingStatusChange) return;

    const { machine, status } = pendingStatusChange;
    setError(null);
    setStatusSavingId(machine.id);
    try {
      const updatedMachine = await apiRequest<Machine>(`/machines/${machine.id}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ status }),
      });
      setRows((prev) => prev.map((row) => (row.id === machine.id ? updatedMachine : row)));
      setPendingStatusChange(null);
      showToast({ type: "success", message: t("machinesStatusChanged", { name: machine.name, status }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("machinesStatusUpdateFailed"));
      showToast({ type: "error", message: t("machinesStatusUpdateFailed") });
    } finally {
      setStatusSavingId(null);
    }
  };

  const editingMachine = rows.find((row) => row.id === editingId) ?? null;

  if (loading) return null;
  if (!user) return null;

  if (user?.role !== "admin") {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-2xl place-content-center px-4 py-16 text-center">
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <p className="text-sm font-semibold text-red-600">403</p>
          <h1 className="mt-2 text-2xl font-bold">{t("machinesForbiddenTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("machinesForbiddenDescription")}</p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            {t("machinesBackToDashboard")}
          </button>
        </div>
      </div>
    );
  }

  const placementFields = {
    position: [
      ["position_x", "X"],
      ["position_y", "Y"],
      ["position_z", "Z"],
    ],
    rotation: [
      ["rotation_x", "X"],
      ["rotation_y", "Y"],
      ["rotation_z", "Z"],
    ],
    scale: [
      ["scale_x", "X"],
      ["scale_y", "Y"],
      ["scale_z", "Z"],
    ],
  } as const;

  const renderPlacementInput = (field: keyof typeof placementForm, label: string) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase text-muted-foreground">{label}</span>
      <input
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-primary/20"
        type="number"
        step="0.1"
        value={placementForm[field]}
        onChange={(event) =>
          setPlacementForm((prev) => ({
            ...prev,
            [field]: Number(event.target.value),
          }))
        }
      />
    </label>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mb-9">
      <h1 className="text-2xl font-bold mb-6">{t("machinesTitle")}</h1>
      <form onSubmit={createMachine} className="grid md:grid-cols-4 gap-3 bg-card border border-border rounded-xl p-4 mb-6">
        <input
          className="border border-border rounded-lg px-3 py-2 bg-background"
          placeholder={t("machinesInstanceNamePlaceholder")}
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
        <select
          className="border border-border rounded-lg px-3 py-2 bg-background"
          value={form.machine_type_id}
          onChange={(event) => setForm((prev) => ({ ...prev, machine_type_id: Number(event.target.value) }))}
          required
        >
          {types.map((machineType) => (
            <option key={machineType.id} value={machineType.id}>
              {machineType.code} - {machineType.name}
            </option>
          ))}
        </select>
        <select
          className="border border-border rounded-lg px-3 py-2 bg-background"
          value={form.status}
          onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as Machine["status"] }))}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {t(`status${status.charAt(0).toUpperCase()}${status.slice(1)}` as never)}
            </option>
          ))}
        </select>
        <button className="bg-primary text-primary-foreground rounded-lg px-3 cursor-pointer  py-2 font-medium">{t("machinesAddInstance")}</button>

        <input className="md:col-span-4 border border-border rounded-lg px-3 py-2 bg-background" placeholder={t("machinesNotes")} value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
        <p className="md:col-span-4 text-xs text-muted-foreground">
          {t("machinesPlacementGenerated")}
        </p>
      </form>

      {editingId !== null && (
        <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">{t("machinesPlacementEditor")}</p>
              <h2 className="text-lg font-semibold">{editingMachine?.name ?? t("commonMachine")}</h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-muted"
                onClick={() => setEditingId(null)}
              >
                {t("machinesCancel")}
              </button>
              <button
                type="button"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                onClick={() => setPendingPlacementSave(true)}
              >
                {t("machinesSavePlacement")}
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-border/70 bg-background/50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Move3D className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">{t("machinesPosition")}</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {placementFields.position.map(([field, label]) => renderPlacementInput(field, label))}
              </div>
            </section>

            <section className="rounded-xl border border-border/70 bg-background/50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <RotateCw className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">{t("machinesRotation")}</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {placementFields.rotation.map(([field, label]) => renderPlacementInput(field, label))}
              </div>
            </section>

            <section className="rounded-xl border border-border/70 bg-background/50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Scaling className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">{t("machinesScale")}</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {placementFields.scale.map(([field, label]) => renderPlacementInput(field, label))}
              </div>
            </section>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-3">{t("machinesName")}</th>
              <th className="text-left px-4 py-3">{t("machinesType")}</th>
              <th className="text-left px-4 py-3">{t("commonStatus")}</th>
              <th className="text-left px-4 py-3">{t("machinesPosition")}</th>
              <th className="text-left px-4 py-3">{t("commonActions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">{row.machine_type_code}</td>
                <td className="px-4 py-3">
                  <select
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm capitalize disabled:cursor-not-allowed disabled:opacity-60"
                    value={row.status}
                    disabled={statusSavingId === row.id}
                    onChange={(event) => requestStatusChange(row, event.target.value as Machine["status"])}
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {t(`status${status.charAt(0).toUpperCase()}${status.slice(1)}` as never)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">{row.position_x}, {row.position_y}, {row.position_z}</td>
                <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button 
                         className="p-2 text-slate-600 hover:bg-slate-100 dark:hover:bg-gray-800 cursor-pointer rounded-lg transition-colors"
                         onClick={() => router.push(`/machines/${row.id}`)}
                         title={t("machinesViewDetails")}>
                          <Eye className="h-[18px] w-[18px]" />
                       </button>
                      <button 
                         className="p-2 text-primary hover:bg-slate-100 dark:hover:bg-gray-800 cursor-pointer  rounded-lg transition-colors"
                         onClick={() => startEditPlacement(row)}
                         title={t("machinesEditPlacement")}>
                          <Pencil className="h-[18px] w-[18px]" />
                       </button>
                      <button 
                       className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-gray-800 cursor-pointer rounded-lg transition-colors"
                       onClick={() => setMachineToDelete(row)}
                       title={t("machinesDelete")}>
                        <Trash2 className="h-[18px] w-[18px]" />
                      </button>
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={machineToDelete !== null} onOpenChange={(open) => !open && !isDeleting && setMachineToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("machinesDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("machinesDeleteDescription", { name: machineToDelete ? `"${machineToDelete.name}"` : t("machinesDeleteThisMachine") })}
              {" "}{t("machinesCannotUndo")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t("commonCancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void deleteMachine();
              }}
            >
              {isDeleting ? t("machinesDeleting") : t("machinesDeleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingStatusChange !== null}
        onOpenChange={(open) => !open && statusSavingId === null && setPendingStatusChange(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("machinesChangeStatusTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("machinesChangeStatusDescription", {
                name: pendingStatusChange ? `"${pendingStatusChange.machine.name}"` : t("machinesDeleteThisMachine"),
                from: pendingStatusChange?.machine.status ?? "",
                to: pendingStatusChange?.status ?? "",
              })}
              {/*
              This will change {pendingStatusChange ? `"${pendingStatusChange.machine.name}"` : "this machine"} from{" "}
              <span className="font-medium capitalize">{pendingStatusChange?.machine.status}</span> to{" "}
              <span className="font-medium capitalize">{pendingStatusChange?.status}</span>.
              */}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusSavingId !== null}>{t("commonCancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={statusSavingId !== null}
              onClick={(event) => {
                event.preventDefault();
                void confirmStatusChange();
              }}
            >
              {statusSavingId !== null ? t("machinesUpdating") : t("commonConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingPlacementSave}
        onOpenChange={(open) => !open && !isPlacementSaving && setPendingPlacementSave(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("machinesSavePlacementTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("machinesSavePlacementDescription", {
                name: editingMachine ? `"${editingMachine.name}"` : t("machinesDeleteThisMachine"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 rounded-xl bg-muted/40 p-4 text-sm sm:grid-cols-3">
            <div>
              <p className="font-medium">{t("machinesPosition")}</p>
              <p className="mt-1 text-muted-foreground">
                X {placementForm.position_x}, Y {placementForm.position_y}, Z {placementForm.position_z}
              </p>
            </div>
            <div>
              <p className="font-medium">{t("machinesRotation")}</p>
              <p className="mt-1 text-muted-foreground">
                X {placementForm.rotation_x}, Y {placementForm.rotation_y}, Z {placementForm.rotation_z}
              </p>
            </div>
            <div>
              <p className="font-medium">{t("machinesScale")}</p>
              <p className="mt-1 text-muted-foreground">
                X {placementForm.scale_x}, Y {placementForm.scale_y}, Z {placementForm.scale_z}
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPlacementSaving}>{t("commonCancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPlacementSaving}
              onClick={(event) => {
                event.preventDefault();
                void confirmPlacementSave();
              }}
            >
              {isPlacementSaving ? t("machinesSaving") : t("commonConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function MachinesPage() {
  return (
    <AppLayout>
      <MachinesContent />
    </AppLayout>
  );
}
