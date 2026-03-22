const APPOINTMENT_URL = import.meta.env.VITE_CQ_GOOGLE_APPOINTMENT_URL as string | undefined

export function IntakeAppointmentPage() {
  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Step 5 of 5</p>
        <h1 className="text-2xl font-semibold">Preferred Appointment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a tentative date and time that works for your site visit. Once we receive your request, we'll confirm by email if that date and time work.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-6 text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          You'll be taken to our scheduling page to pick a time. Come back here once you've booked.
        </p>
        {APPOINTMENT_URL ? (
          <a
            href={APPOINTMENT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            Open Scheduling Page →
          </a>
        ) : (
          <p className="text-sm text-destructive">
            Appointment scheduling is not configured. Please contact us directly to book a time.
          </p>
        )}
      </div>
    </div>
  )
}
