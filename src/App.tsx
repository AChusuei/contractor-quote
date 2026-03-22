import { Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/AppShell"
import { IntakePage } from "@/pages/IntakePage"
import { IntakeScreen2Page } from "@/pages/IntakeScreen2Page"
import { IntakeAppointmentPage } from "@/pages/IntakeAppointmentPage"
import { IntakePhotosPage } from "@/pages/IntakePhotosPage"
import { AppointmentConfirmPage } from "@/pages/AppointmentConfirmPage"
import { IntakeChoicePage } from "@/pages/IntakeChoicePage"
import { IntakeEstimatePage } from "@/pages/IntakeEstimatePage"
import { IntakeConfirmationPage } from "@/pages/IntakeConfirmationPage"
import { AdminShell } from "@/components/AdminShell"
import { QuotesPage } from "@/pages/admin/QuotesPage"
import { QuoteDetailPage } from "@/pages/admin/QuoteDetailPage"
import { SignInPage } from "@/pages/admin/SignInPage"
import { ClerkNotConfigured } from "@/components/ClerkNotConfigured"

interface AppProps {
  clerkConfigured: boolean
}

export default function App({ clerkConfigured }: AppProps) {
  return (
    <Routes>
      {/* Customer-facing intake flow */}
      <Route element={<AppShell />}>
        <Route path="/" element={<IntakePage />} />
        <Route path="/intake/scope" element={<IntakeScreen2Page />} />
        <Route path="/intake/appointment" element={<IntakeAppointmentPage />} />
        <Route path="/intake/photos" element={<IntakePhotosPage />} />
        <Route path="/intake/review" element={<IntakeChoicePage />} />
        <Route path="/intake/confirmation" element={<IntakeConfirmationPage />} />
        <Route path="/intake/confirmed" element={<AppointmentConfirmPage />} />
        <Route path="/intake/estimate" element={<IntakeEstimatePage />} />
      </Route>

      {/* Admin portal — Clerk-protected */}
      <Route element={<AdminShell />}>
        {clerkConfigured ? (
          <>
            <Route path="/admin/sign-in/*" element={<SignInPage />} />
            <Route path="/admin/quotes" element={<QuotesPage />} />
            <Route path="/admin/quotes/:id" element={<QuoteDetailPage />} />
            <Route path="/admin" element={<Navigate to="/admin/quotes" replace />} />
          </>
        ) : (
          <Route path="/admin/*" element={<ClerkNotConfigured />} />
        )}
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
