import { Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/AppShell"
import { IntakePage } from "@/pages/IntakePage"
import { IntakeScreen2Page } from "@/pages/IntakeScreen2Page"

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<IntakePage />} />
        <Route path="/intake/scope" element={<IntakeScreen2Page />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
