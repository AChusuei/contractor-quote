const APPOINTMENT_URL = import.meta.env.VITE_CQ_GOOGLE_APPOINTMENT_URL as string | undefined

export function IntakeAppointmentPage() {
  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Step 4 of 4</p>
        <h1 className="text-2xl font-semibold">Preferred Site Visit Appointment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pick a tentative date and time that works for your site visit. Once we receive your request, we'll confirm by email if that date and time work.
        </p>
      </div>

      {APPOINTMENT_URL ? (
        <iframe
          src={APPOINTMENT_URL}
          title="Schedule an appointment"
          className="w-full border-0"
          style={{ height: "700px" }}
          allowFullScreen
        />
      ) : (
        <p className="text-sm text-destructive">
          Appointment scheduling is not configured. Please contact us directly to book a time.
        </p>
      )}
    </div>
  )
}
