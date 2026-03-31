import { Link } from "react-router-dom"

export function SuperDashboardPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Super Admin</h1>
        <p className="text-sm text-muted-foreground">Platform-wide administration</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/admin/super/contractors"
          className="group rounded-lg border border-border bg-card p-6 shadow-sm transition-colors hover:bg-accent"
        >
          <h2 className="text-lg font-medium group-hover:text-accent-foreground">Manage Contractors</h2>
          <p className="mt-1 text-sm text-muted-foreground group-hover:text-accent-foreground/80">
            View all contractors, edit their details, and access their portals.
          </p>
        </Link>

        <Link
          to="/admin/super/users"
          className="group rounded-lg border border-border bg-card p-6 shadow-sm transition-colors hover:bg-accent"
        >
          <h2 className="text-lg font-medium group-hover:text-accent-foreground">Manage Super Users</h2>
          <p className="mt-1 text-sm text-muted-foreground group-hover:text-accent-foreground/80">
            Add or remove platform administrators with super user access.
          </p>
        </Link>
      </div>
    </div>
  )
}
