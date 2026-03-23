import { useEffect, useRef, useCallback } from "react"

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

// Module-level tracking for script loading
let scriptLoaded = false
let scriptLoading = false
const onLoadCallbacks: (() => void)[] = []

function loadScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve()
  return new Promise((resolve) => {
    onLoadCallbacks.push(resolve)
    if (scriptLoading) return
    scriptLoading = true
    const script = document.createElement("script")
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.onload = () => {
      scriptLoaded = true
      onLoadCallbacks.forEach((cb) => cb())
      onLoadCallbacks.length = 0
    }
    document.head.appendChild(script)
  })
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: string | HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          "expired-callback"?: () => void
          "error-callback"?: () => void
          size?: "invisible" | "normal" | "compact"
          theme?: "light" | "dark" | "auto"
        }
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
  }
}

type TurnstileProps = {
  siteKey: string
  onVerify: (token: string) => void
  onExpire?: () => void
  onError?: () => void
}

export function Turnstile({ siteKey, onVerify, onExpire, onError }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  // Use refs for callbacks to avoid re-rendering the widget
  const onVerifyRef = useRef(onVerify)
  onVerifyRef.current = onVerify
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError

  useEffect(() => {
    let cancelled = false

    loadScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onVerifyRef.current(token),
        "expired-callback": () => onExpireRef.current?.(),
        "error-callback": () => onErrorRef.current?.(),
        size: "invisible",
      })
    })

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [siteKey])

  return <div ref={containerRef} />
}

/**
 * Hook that provides a Turnstile token for form submission.
 * Returns [token, resetToken, TurnstileWidget].
 * When siteKey is undefined, Turnstile is disabled (dev mode).
 */
export function useTurnstile(siteKey: string | undefined) {
  const tokenRef = useRef<string | null>(null)
  const widgetContainerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  const handleVerify = useCallback((token: string) => {
    tokenRef.current = token
  }, [])

  const handleExpire = useCallback(() => {
    tokenRef.current = null
  }, [])

  const getToken = useCallback(() => tokenRef.current, [])

  const resetToken = useCallback(() => {
    tokenRef.current = null
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
    }
  }, [])

  useEffect(() => {
    if (!siteKey) return

    let cancelled = false

    loadScript().then(() => {
      if (cancelled || !widgetContainerRef.current || !window.turnstile) return

      widgetIdRef.current = window.turnstile.render(widgetContainerRef.current, {
        sitekey: siteKey,
        callback: handleVerify,
        "expired-callback": handleExpire,
        "error-callback": handleExpire,
        size: "invisible",
      })
    })

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [siteKey, handleVerify, handleExpire])

  const TurnstileWidget = siteKey ? <div ref={widgetContainerRef} /> : null

  return { getToken, resetToken, TurnstileWidget } as const
}
