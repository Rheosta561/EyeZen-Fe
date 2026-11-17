"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createRoom, deactivateRoom, fetchRooms, type Room } from "@/lib/api/timetable";
import { hasPermission } from "@/lib/auth/permissions";
import { useCurrentUser } from "@/lib/auth/use-current-user";

type FieldErrors = Record<string, string>;

const NO_ROOMS: Room[] = [];

export function RoomAdmin({ departments, departmentId }: { departments: { id: string; name: string; code: string }[]; departmentId: string }) {
  const current = useCurrentUser();
  const queryClient = useQueryClient();
  const role = current.data?.role;
  const canManage = hasPermission(role, "rooms:manage");
  const [form, setForm] = useState({ roomNumber: "", roomType: "", floor: "" });
  const [errors, setErrors] = useState<FieldErrors>({});

  const roomsQuery = useQuery({
    queryKey: ["timetable", "rooms", departmentId],
    enabled: canManage && Boolean(departmentId),
    queryFn: () => fetchRooms(departmentId),
  });
  const rooms = roomsQuery.data ?? NO_ROOMS;
  const selectedDepartment = departments.find((department) => department.id === departmentId);

  const createMutation = useMutation({
    mutationFn: (input: { roomNumber: string; roomType: string; floor?: string }) => createRoom(departmentId, input),
    onSuccess: async (room) => {
      toast.success(`Room ${room.roomNumber} created`);
      setForm({ roomNumber: "", roomType: "", floor: "" });
      setErrors({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["timetable", "rooms"] }),
        queryClient.invalidateQueries({ queryKey: ["timetable", "occurrences"] }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The room could not be created.");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (roomId: string) => deactivateRoom(departmentId, roomId),
    onSuccess: async (result) => {
      toast.success(`Room ${result.id.slice(0, 8)} deactivated`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["timetable", "rooms"] }),
        queryClient.invalidateQueries({ queryKey: ["timetable", "occurrences"] }),
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The room could not be deactivated.");
    },
  });

  function submitRoom() {
    const roomNumber = form.roomNumber.trim();
    const roomType = form.roomType.trim();
    const floor = form.floor.trim();
    const nextErrors: FieldErrors = {};
    if (!departmentId) nextErrors.department = "Select a department first.";
    if (!roomNumber) nextErrors.roomNumber = "Enter a room number.";
    if (!roomType) nextErrors.roomType = "Enter a room type.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      toast.error("Check the room details.");
      return;
    }
    setErrors({});
    createMutation.mutate({ roomNumber, roomType, ...(floor ? { floor } : {}) });
  }

  function deactivateRoomRow(room: Room) {
    const confirmed = window.confirm(`Deactivate room ${room.roomNumber}? It will no longer be available for new duties.`);
    if (confirmed) deactivateMutation.mutate(room.id);
  }

  if (current.isPending) return <div className="timetable-state">Checking room access…</div>;
  if (current.isError) {
    return (
      <div className="timetable-state timetable-state--error">
        <span>Your workspace could not be verified.</span>
        <button type="button" onClick={() => void current.refetch()}>Retry</button>
      </div>
    );
  }
  if (!canManage) return <div className="timetable-state">Only hospital administrators can manage rooms.</div>;

  return (
    <div className="timetable-workspace room-admin-workspace">
      <section className="timetable-overview" aria-label="Room overview">
        <div className="timetable-overview-copy">
          <span className="timetable-overline">Hospital rooms</span>
          <h2>{selectedDepartment?.name ?? "Department"}{selectedDepartment?.code ? ` · ${selectedDepartment.code}` : ""}</h2>
          <p>Add rooms for this department and deactivate rooms that are no longer in use.</p>
        </div>
        <div className="timetable-metric"><b>{rooms.length}</b><span>Total</span></div>
        <div className="timetable-metric"><b>{rooms.filter((room) => room.isActive).length}</b><span>Active</span></div>
      </section>

      {!departmentId ? <div className="timetable-state">Select a department to manage its rooms.</div> : null}

      <section className="timetable-rooms" aria-label="Create a room">
        <div className="timetable-board-head"><div><h2>Create a room</h2><p>New rooms become available in the roster calendar immediately.</p></div></div>
        <form className="timetable-room-form" noValidate onSubmit={(event) => { event.preventDefault(); submitRoom(); }}>
          <label className="timetable-field">Department
            <input value={selectedDepartment?.name ?? ""} readOnly aria-invalid={Boolean(errors.department)} />
            {errors.department ? <span className="timetable-hint">{errors.department}</span> : null}
          </label>
          <label className="timetable-field">Room number
            <input value={form.roomNumber} aria-invalid={Boolean(errors.roomNumber)} onChange={(event) => setForm({ ...form, roomNumber: event.target.value })} />
            {errors.roomNumber ? <span className="timetable-hint">{errors.roomNumber}</span> : null}
          </label>
          <label className="timetable-field">Room type
            <input value={form.roomType} aria-invalid={Boolean(errors.roomType)} onChange={(event) => setForm({ ...form, roomType: event.target.value })} />
            {errors.roomType ? <span className="timetable-hint">{errors.roomType}</span> : null}
          </label>
          <label className="timetable-field">Floor
            <input value={form.floor} onChange={(event) => setForm({ ...form, floor: event.target.value })} />
          </label>
          <button type="submit" className="timetable-primary" disabled={!departmentId || createMutation.isPending}>{createMutation.isPending ? "Adding…" : "Add room"}</button>
        </form>
      </section>

      <section className="timetable-rooms" aria-label="Department rooms">
        <div className="timetable-board-head"><div><h2>Department rooms</h2><p>Deactivated rooms remain in history but cannot be assigned to new duties.</p></div></div>
        {roomsQuery.isPending ? <div className="timetable-state">Loading rooms…</div> : null}
        {roomsQuery.isError ? (
          <div className="timetable-state timetable-state--error">
            <span>{roomsQuery.error instanceof Error ? roomsQuery.error.message : "Rooms could not be loaded."}</span>
            <button type="button" onClick={() => void roomsQuery.refetch()}>Retry</button>
          </div>
        ) : null}
        {!roomsQuery.isPending && !roomsQuery.isError && !rooms.length ? <div className="timetable-state">No rooms have been added to this department.</div> : null}
        <div className="timetable-room-list">
          {rooms.map((room) => (
            <div className="timetable-room-row" key={room.id}>
              <div className="timetable-room-main"><b>Room {room.roomNumber}</b><span>{room.roomType} · {room.floor ? `Floor ${room.floor}` : "Floor not set"}</span></div>
              <span className="timetable-room-badge">{room.isActive ? "Active" : "Inactive"}</span>
              {room.isActive ? (
                <button type="button" className="timetable-secondary" disabled={deactivateMutation.isPending} onClick={() => deactivateRoomRow(room)}>Deactivate room</button>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
