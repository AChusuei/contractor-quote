import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "components"
import { cn } from "@/lib/utils"
import {
  getAvailabilityWindows,
  addAvailabilityWindow,
  updateAvailabilityWindow,
  deleteAvailabilityWindow,
  formatTime,
  type AvailabilityWindow,
  type DayOfWeek,
} from "@/lib/admin"

const DAY_OPTIONS: { value: DayOfWeek; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
]

const windowSchema = z
  .object({
    dayOfWeek: z.string().min(1, "Select a day"),
    startTime: z.string().min(1, "Start time is required").regex(/^\d{2}:\d{2}$/, "Enter a valid start time"),
    endTime: z.string().min(1, "End time is required").regex(/^\d{2}:\d{2}$/, "Enter a valid end time"),
  })
  .refine((d) => d.startTime < d.endTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  })

type WindowFormData = z.infer<typeof windowSchema>

function inputClass(hasError?: boolean) {
  return cn(
    "w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm",
    "focus:outline-none focus:ring-1 focus:ring-ring",
    hasError ? "border-destructive" : "border-input"
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-xs text-destructive">{message}</p>
}

type EditingState = { id: string } | "new" | null

export function AdminAvailabilityPage() {
  const [windows, setWindows] = useState<AvailabilityWindow[]>(() =>
    getAvailabilityWindows()
  )
  const [editing, setEditing] = useState<EditingState>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WindowFormData>({
    resolver: zodResolver(windowSchema),
    defaultValues: {
      dayOfWeek: "1",
      startTime: "",
      endTime: "",
    },
  })

  function openNew() {
    setEditing("new")
    reset({ dayOfWeek: "1", startTime: "", endTime: "" })
  }

  function openEdit(window_: AvailabilityWindow) {
    setEditing({ id: window_.id })
    reset({
      dayOfWeek: String(window_.dayOfWeek),
      startTime: window_.startTime,
      endTime: window_.endTime,
    })
  }

  function handleCancel() {
    setEditing(null)
    reset()
  }

  function onSubmit(data: WindowFormData) {
    const dayOfWeek = parseInt(data.dayOfWeek, 10) as DayOfWeek
    if (editing === "new") {
      addAvailabilityWindow({ dayOfWeek, startTime: data.startTime, endTime: data.endTime })
    } else if (editing) {
      updateAvailabilityWindow({ id: editing.id, dayOfWeek, startTime: data.startTime, endTime: data.endTime })
    }
    setWindows(getAvailabilityWindows())
    setEditing(null)
    reset()
  }

  function handleDelete(id: string) {
    deleteAvailabilityWindow(id)
    setWindows(getAvailabilityWindows())
    if (editing && editing !== "new" && editing.id === id) {
      setEditing(null)
    }
  }

  // Group windows by day for display
  const byDay = DAY_OPTIONS.map(({ value, label }) => ({
    day: value,
    label,
    windows: windows.filter((w) => w.dayOfWeek === value),
  })).filter(({ windows: ws }) => ws.length > 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Availability</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set the time windows shown to customers when booking an appointment.
          </p>
        </div>
        {editing === null && (
          <Button size="sm" onClick={openNew}>
            + Add Window
          </Button>
        )}
      </div>

      {/* Add / Edit form */}
      {editing !== null && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold mb-4">
            {editing === "new" ? "New Availability Window" : "Edit Window"}
          </h2>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="dayOfWeek"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Day of Week *
              </label>
              <select
                id="dayOfWeek"
                className={inputClass(!!errors.dayOfWeek)}
                {...register("dayOfWeek")}
              >
                {DAY_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <FieldError message={errors.dayOfWeek?.message} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="startTime"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  Start Time *
                </label>
                <input
                  id="startTime"
                  type="time"
                  className={inputClass(!!errors.startTime)}
                  {...register("startTime")}
                />
                <FieldError message={errors.startTime?.message} />
              </div>
              <div>
                <label
                  htmlFor="endTime"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  End Time *
                </label>
                <input
                  id="endTime"
                  type="time"
                  className={inputClass(!!errors.endTime)}
                  {...register("endTime")}
                />
                <FieldError message={errors.endTime?.message} />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" size="sm">
                {editing === "new" ? "Add Window" : "Save Changes"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Availability list */}
      {windows.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground text-sm">
          No availability windows configured. Add one to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {byDay.map(({ day, label, windows: dayWindows }) => (
            <div key={day}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {label}
              </h3>
              <div className="space-y-2">
                {dayWindows.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
                  >
                    <span className="text-sm">
                      {formatTime(w.startTime)} – {formatTime(w.endTime)}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(w)}
                        disabled={editing !== null}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(w.id)}
                        disabled={editing !== null}
                        className="text-destructive hover:text-destructive"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(() => {
        const daysWithWindows = new Set(windows.map((w) => w.dayOfWeek))
        const daysWithout = DAY_OPTIONS.filter(({ value }) => !daysWithWindows.has(value))
        if (daysWithout.length === 0 || windows.length === 0) return null
        return (
          <p className="text-xs text-muted-foreground">
            No windows on: {daysWithout.map(({ label }) => label).join(", ")}
          </p>
        )
      })()}
    </div>
  )
}
