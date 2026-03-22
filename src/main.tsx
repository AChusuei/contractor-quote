import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { ClerkProvider } from "@clerk/clerk-react"
import "./index.css"
import App from "./App.tsx"
import { seedMockQuotes } from "@/lib/quoteStore"

if (import.meta.env.DEV) {
  seedMockQuotes()
}

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

function Root() {
  if (!CLERK_PUBLISHABLE_KEY) {
    // Clerk not configured — admin routes will show a configuration notice
    return <App clerkConfigured={false} />
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <App clerkConfigured />
    </ClerkProvider>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </StrictMode>,
)
