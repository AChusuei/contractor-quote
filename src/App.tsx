import { Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/AppShell"
import { IntakePage } from "@/pages/IntakePage"
import { IntakeScreen2Page } from "@/pages/IntakeScreen2Page"
import { IntakeAppointmentPage } from "@/pages/IntakeAppointmentPage"
import { IntakePhotosPage } from "@/pages/IntakePhotosPage"
import { AppointmentConfirmPage } from "@/pages/AppointmentConfirmPage"
import { IntakeChoicePage } from "@/pages/IntakeChoicePage"
import { IntakeEstimatePage } from "@/pages/IntakeEstimatePage"

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<IntakePage />} />
        <Route path="/intake/scope" element={<IntakeScreen2Page />} />
        <Route path="/intake/appointment" element={<IntakeAppointmentPage />} />
        <Route path="/intake/photos" element={<IntakePhotosPage />} />
        <Route path="/intake/review" element={<IntakeChoicePage />} />
        <Route path="/intake/confirmed" element={<AppointmentConfirmPage />} />
        <Route path="/intake/estimate" element={<IntakeEstimatePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
