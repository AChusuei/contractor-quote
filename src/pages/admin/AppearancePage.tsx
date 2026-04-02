import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type Theme = "light" | "dark" | "system"

const THEME_KEY = "cq_theme"

function getStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === "light" || stored === "dark" || stored === "system") return stored
  return "system"
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    root.classList.toggle("dark", prefersDark)
  } else {
    root.classList.toggle("dark", theme === "dark")
  }
}

const themeOptions: { value: Theme; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "Always use light mode" },
  { value: "dark", label: "Dark", description: "Always use dark mode" },
  { value: "system", label: "System", description: "Follow your device settings" },
]

export function AppearancePage() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme)
    applyTheme(theme)

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)")
      const handler = () => applyTheme("system")
      mq.addEventListener("change", handler)
      return () => mq.removeEventListener("change", handler)
    }
  }, [theme])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Appearance</h1>
        <p className="text-sm text-muted-foreground">Choose how the admin panel looks to you.</p>
      </div>

      <div className="grid gap-3">
        {themeOptions.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-center gap-4 rounded-lg border p-4 transition-colors",
              theme === option.value
                ? "border-primary bg-accent"
                : "border-border hover:bg-accent/50"
            )}
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={theme === option.value}
              onChange={() => setTheme(option.value)}
              className="h-4 w-4 accent-primary"
            />
            <div>
              <div className="text-sm font-medium">{option.label}</div>
              <div className="text-xs text-muted-foreground">{option.description}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}
