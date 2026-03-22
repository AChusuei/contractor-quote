export function ClerkNotConfigured() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-sm space-y-2 text-center">
        <p className="text-base font-medium">Admin portal not configured</p>
        <p className="text-sm text-muted-foreground">
          Set <code className="rounded bg-muted px-1 py-0.5 text-xs">VITE_CLERK_PUBLISHABLE_KEY</code>{" "}
          to enable the admin portal.
        </p>
      </div>
    </div>
  )
}
