"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth/AuthProvider";
import AppLayout from "@/components/layout/AppLayout";
import { useTranslation } from "@/components/i18n";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";

type Machine = {
  id: number;
  name: string;
  machine_type_name: string;
  status: "available" | "busy" | "offline" | "maintenance";
};

type Reservation = {
  id: number;
  user_id: number;
  machine_id: number;
  date: string;
  start_time: string;
  end_time: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  note?: string | null;
  created_at: string;
};

type Slot = {
  date: string;
  slot_start: string;
  slot_end: string;
  available: boolean;
};

function ReservationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, user, loading } = useAuth();
  const { t } = useTranslation();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [machineId, setMachineId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedMachine = useMemo(
    () => machines.find((item) => item.id === machineId) ?? null,
    [machines, machineId]
  );

  const loadData = async () => {
    if (!token) return;
    const [machinesData, reservationsData] = await Promise.all([
      apiRequest<Machine[]>("/lab/machines", { token }),
      apiRequest<Reservation[]>("/reservations/my", { token }),
    ]);
    setMachines(machinesData);
    setReservations(reservationsData);

    const machineFromQuery = Number(searchParams.get("machineId"));
    if (machineFromQuery && machinesData.some((item) => item.id === machineFromQuery)) {
      setMachineId(machineFromQuery);
    } else if (machinesData.length > 0 && machineId === null) {
      setMachineId(machinesData[0].id);
    }
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, loading, user]);

  useEffect(() => {
    const loadSlots = async () => {
      if (!token || !machineId || !date) return;
      const availability = await apiRequest<Slot[]>(
        `/reservations/availability?machine_id=${machineId}&date=${date}`,
        { token }
      );
      setSlots(availability);
      setSelectedSlot(null);
    };
    void loadSlots();
  }, [token, machineId, date]);

  const submitReservation = async () => {
    if (!token || !machineId || !selectedSlot) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest<Reservation>("/reservations", {
        method: "POST",
        token,
        body: JSON.stringify({
          machine_id: machineId,
          date,
          start_time: selectedSlot.slot_start,
          end_time: selectedSlot.slot_end,
          note: note.trim() || null,
        }),
      });
      setNote("");
      setDate("");
      setSlots([]);
      setSelectedSlot(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reservationsCreateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const cancelReservation = async (id: number) => {
    if (!token) return;
    setError(null);
    try {
      await apiRequest<void>(`/reservations/${id}`, { method: "DELETE", token });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reservationsCancelFailed"));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold mb-6">{t("reservationsTitle")}</h1>

      <div className="grid lg:grid-cols-3 gap-5 mb-6">
        <div className="lg:col-span-2 border border-border rounded-xl p-4 bg-card space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">{t("reservationsMachineInstance")}</label>
              <select
                className="mt-1 w-full border border-border rounded-lg px-3 py-2 bg-background"
                value={machineId ?? ""}
                onChange={(event) => setMachineId(Number(event.target.value))}
                required
              >
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.name} ({machine.machine_type_name})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t("reservationsDate")}</label>
              <input
                className="mt-1 w-full border border-border rounded-lg px-3 py-2 bg-background"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
          </div>

          {date && (
            <div>
              <p className="text-sm font-medium mb-2">{t("reservationsAvailableSlots")}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {slots.map((slot) => {
                  const selected =
                    selectedSlot?.slot_start === slot.slot_start && selectedSlot?.slot_end === slot.slot_end;
                  return (
                    <button
                      key={`${slot.slot_start}-${slot.slot_end}`}
                      disabled={!slot.available}
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-lg border px-2 py-2 text-sm transition ${
                        !slot.available
                          ? "border-border bg-muted text-muted-foreground cursor-not-allowed"
                          : selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:border-primary"
                      }`}
                    >
                      {slot.slot_start.slice(0, 5)} - {slot.slot_end.slice(0, 5)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <textarea
            className="w-full border border-border rounded-lg px-3 py-2 bg-background"
            placeholder={t("reservationsOptionalNote")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <button
            className="bg-primary text-primary-foreground rounded-lg px-4 py-2 font-medium disabled:opacity-60"
            disabled={saving || !selectedSlot || !machineId || !date}
            onClick={() => void submitReservation()}
          >
            {saving ? t("reservationsSaving") : t("reservationsSubmit")}
          </button>
        </div>

        <div className="border border-border rounded-xl p-4 bg-card">
          <p className="text-sm text-muted-foreground">{t("reservationsSelectedMachine")}</p>
          <p className="text-lg font-semibold mt-1">{selectedMachine?.name ?? "--"}</p>
          <p className="text-xs text-muted-foreground">{selectedMachine?.machine_type_name ?? ""}</p>
          <p className="text-sm mt-4">
            {t("reservationsSlot")}:{" "}
            {selectedSlot ? `${selectedSlot.slot_start.slice(0, 5)} - ${selectedSlot.slot_end.slice(0, 5)}` : "--"}
          </p>
          <p className="text-sm mt-1">{t("commonDate")}: {date || "--"}</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-3">{t("commonMachine")}</th>
              <th className="text-left px-4 py-3">{t("commonDate")}</th>
              <th className="text-left px-4 py-3">{t("commonTime")}</th>
              <th className="text-left px-4 py-3">{t("commonStatus")}</th>
              <th className="text-left px-4 py-3">{t("commonAction")}</th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((reservation) => {
              const machine = machines.find((item) => item.id === reservation.machine_id);
              return (
                <tr key={reservation.id} className="border-t border-border">
                  <td className="px-4 py-3">{machine?.name ?? `#${reservation.machine_id}`}</td>
                  <td className="px-4 py-3">{reservation.date}</td>
                  <td className="px-4 py-3">
                    {reservation.start_time.slice(0, 5)} - {reservation.end_time.slice(0, 5)}
                  </td>
                  <td className="px-4 py-3">{t(`status${reservation.status.charAt(0).toUpperCase()}${reservation.status.slice(1)}` as never)}</td>
                  <td className="px-4 py-3">
                    {reservation.status === "pending" ? (
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => void cancelReservation(reservation.id)}
                      >
                        {t("reservationsCancel")}
                      </Button>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ReservationsPage() {
  return (
    <AppLayout>
      <ReservationsContent />
    </AppLayout>
  );
}
