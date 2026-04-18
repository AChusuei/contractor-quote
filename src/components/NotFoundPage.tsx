export function NotFoundPage({ message }: { message?: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-center px-6">
      <h1 className="text-4xl font-bold tracking-tight">404</h1>
      <p className="text-muted-foreground text-lg">Page not found</p>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}
