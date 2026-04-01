import { Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/AppShell"
import { IntakePage } from "@/pages/IntakePage"
import { IntakeScreen2Page } from "@/pages/IntakeScreen2Page"
import { IntakePhotosPage } from "@/pages/IntakePhotosPage"
import { IntakeReviewPage } from "@/pages/IntakeReviewPage"
import { AppointmentConfirmPage } from "@/pages/AppointmentConfirmPage"
import { IntakeConfirmationPage } from "@/pages/IntakeConfirmationPage"
import { AdminShell } from "@/components/AdminShell"
import { QuotesPage } from "@/pages/admin/QuotesPage"
import { QuoteDetailPage } from "@/pages/admin/QuoteDetailPage"
import { SignInPage } from "@/pages/admin/SignInPage"
import { EmailComposePage } from "@/pages/admin/EmailComposePage"
import { SettingsPage } from "@/pages/admin/SettingsPage"
import { CustomersPage } from "@/pages/admin/CustomersPage"
import { CustomerDetailPage } from "@/pages/admin/CustomerDetailPage"
import { ClerkNotConfigured } from "@/components/ClerkNotConfigured"
import { PostLoginRedirect } from "@/pages/admin/PostLoginRedirect"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { SuperContractorsPage } from "@/pages/admin/super/SuperContractorsPage"
import { SuperContractorDetailPage } from "@/pages/admin/super/SuperContractorDetailPage"
import { SuperUsersPage } from "@/pages/admin/super/SuperUsersPage"
import { ContractorSessionProvider } from "@/contexts/ContractorSession"

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
        <Route path="/intake/photos" element={<IntakePhotosPage />} />
        <Route path="/intake/review" element={<IntakeReviewPage />} />
        <Route path="/intake/confirmation" element={<IntakeConfirmationPage />} />
        <Route path="/intake/confirmed" element={<AppointmentConfirmPage />} />
      </Route>

      {/* Auth pages — no shell header */}
      {clerkConfigured && (
        <>
          <Route path="/admin/sign-in/*" element={<SignInPage />} />
          <Route path="/admin/redirect" element={<PostLoginRedirect />} />
        </>
      )}

      {/* Super admin routes — no contractor context needed */}
      {clerkConfigured && (
        <Route element={<AdminShell />}>
          <Route path="/admin/contractors" element={<ProtectedRoute><SuperContractorsPage /></ProtectedRoute>} />
          <Route path="/admin/contractors/:id" element={<ProtectedRoute><SuperContractorDetailPage /></ProtectedRoute>} />
          <Route path="/admin/super-users" element={<ProtectedRoute><SuperUsersPage /></ProtectedRoute>} />
        </Route>
      )}

      {/* Contractor admin portal — requires contractor context */}
      {clerkConfigured ? (
        <Route element={<ContractorSessionProvider><AdminShell /></ContractorSessionProvider>}>
          <Route path="/admin/quotes" element={<ProtectedRoute><QuotesPage /></ProtectedRoute>} />
          <Route path="/admin/quotes/:id" element={<ProtectedRoute><QuoteDetailPage /></ProtectedRoute>} />
          <Route path="/admin/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
          <Route path="/admin/customers/:id" element={<ProtectedRoute><CustomerDetailPage /></ProtectedRoute>} />
          <Route path="/admin/email/compose" element={<ProtectedRoute><EmailComposePage /></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/admin" element={<Navigate to="/admin/quotes" replace />} />
        </Route>
      ) : (
        <Route element={<AdminShell />}>
          <Route path="/admin/*" element={<ClerkNotConfigured />} />
        </Route>
      )}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
