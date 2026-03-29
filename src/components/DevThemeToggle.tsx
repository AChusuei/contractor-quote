import { useState, useEffect } from "react"

type Theme = "system" | "light" | "dark"

function applyTheme(theme: Theme) {
  const prefersDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", prefersDark)
  localStorage.setItem("cq_theme", theme)
}

/**
 * Dev-only floating toggle in the upper right for switching light/dark/system.
 * Only renders when import.meta.env.DEV is true.
 */
export function DevThemeToggle() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("cq_theme") as Theme) || "system"
  )

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applyTheme("system")
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme])

  if (!import.meta.env.DEV) return null

  const options: { value: Theme; label: string }[] = [
    { value: "system", label: "Auto" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ]

  return (
    <div className="fixed top-2 right-2 z-50 flex items-center gap-1 rounded-md border bg-background/80 backdrop-blur px-2 py-1 text-xs shadow-sm">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          className={`rounded px-2 py-0.5 transition-colors ${
            theme === opt.value
              ? "bg-primary text-primary-foreground font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
