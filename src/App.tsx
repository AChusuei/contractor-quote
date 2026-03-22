import { Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/AppShell"
import { IntakePage } from "@/pages/IntakePage"
import { IntakeScreen2Page } from "@/pages/IntakeScreen2Page"
import { IntakePhotosPage } from "@/pages/IntakePhotosPage"
import { AppointmentConfirmPage } from "@/pages/AppointmentConfirmPage"
import { IntakeChoicePage } from "@/pages/IntakeChoicePage"
import { IntakeCheckoutPage } from "@/pages/IntakeCheckoutPage"
import { IntakeEstimatePage } from "@/pages/IntakeEstimatePage"

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<IntakePage />} />
        <Route path="/intake/scope" element={<IntakeScreen2Page />} />
        <Route path="/intake/photos" element={<IntakePhotosPage />} />
        <Route path="/intake/review" element={<IntakeChoicePage />} />
        <Route path="/intake/checkout" element={<IntakeCheckoutPage />} />
        <Route path="/intake/estimate" element={<IntakeEstimatePage />} />
        <Route path="/appointments/:token" element={<AppointmentConfirmPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
