import { useState, useEffect, useCallback } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { useAuth } from "@clerk/clerk-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "components"
import { CustomerInfoForm, customerInfoSchema, type CustomerInfoData } from "@/components/forms/CustomerInfoForm"
import { apiGet, apiPatch, apiDelete, setAuthProvider } from "@/lib/api"
import { useAutoSave } from "@/hooks/useAutoSave"
import {
  STATUS_LABELS,
  STATUS_COLORS,
  type QuoteStatus,
} from "@/lib/statusTransitions"
import { MailIcon } from "lucide-react"

type CustomerQuote = {
  id: string
  jobSiteAddress: string
  propertyType: string
  budgetRange: string
  status: string
  createdAt: string
}

type Customer = {
  id: string
  name: string
  email: string
  phone: string
  howDidYouFindUs: string | null
  referredByContractor: string | null
  quotes: CustomerQuote[]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function StatusBadge({ status }: { status: string }) {
  const colorClass = STATUS_COLORS[status as QuoteStatus] ?? STATUS_COLORS.draft
  const label = STATUS_LABELS[status as QuoteStatus] ?? status
  return <span className={colorClass}>{label}</span>
}

function DeleteCustomerPanel({
  customer,
  onDeleted,
}: {
  customer: Customer
  onDeleted: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      const res = await apiDelete(`/customers/${encodeURIComponent(customer.id)}`, {
        requestType: "contractor",
      })
      if (res.ok) {
        onDeleted()
      } else {
        throw new Error("error" in res ? res.error : "Delete failed")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred")
    } finally {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground border-b pb-2 mb-4">
        Customer data
      </h3>
      {!confirming ? (
        <Button
          size="sm"
          variant="outline"
          className="text-red-600 border-red-300 hover:bg-red-50"
          onClick={() => setConfirming(true)}
        >
          Delete customer data
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-red-600">
            This will permanently delete all quotes, photos, appointments, and
            activity for <strong>{customer.name}</strong> ({customer.email}).
            This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setConfirming(false)
                setError(null)
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting\u2026" : "Confirm delete"}
            </Button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { isLoaded, isSignedIn, getToken } = useAuth()
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setAuthProvider(() => getToken())
    }
  }, [isLoaded, isSignedIn, getToken])

  const loadCustomer = useCallback(async () => {
    if (!id || !isLoaded || !isSignedIn) return

    const res = await apiGet<Record<string, unknown>>(
      `/customers/${encodeURIComponent(id)}`
    )

    if (res.ok) {
      const d = res.data
      setCustomer({
        id: d.id as string,
        name: d.name as string,
        email: d.email as string,
        phone: d.phone as string,
        howDidYouFindUs: (d.howDidYouFindUs as string) ?? null,
        referredByContractor: (d.referredByContractor as string) ?? null,
        quotes: (d.quotes as CustomerQuote[]) ?? [],
      })
    } else {
      setNotFound(true)
    }
  }, [id, isLoaded, isSignedIn])

  useEffect(() => {
    loadCustomer()
  }, [loadCustomer])

  // Auto-save form for customer info
  const {
    register,
    watch,
    getValues,
    formState: { errors },
  } = useForm<CustomerInfoData>({
    resolver: zodResolver(customerInfoSchema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      howDidYouFindUs: "",
      referredByContractor: "",
    },
    values: customer
      ? {
          name: customer.name ?? "",
          email: customer.email ?? "",
          phone: customer.phone ?? "",
          howDidYouFindUs: customer.howDidYouFindUs ?? "",
          referredByContractor: customer.referredByContractor ?? "",
        }
      : undefined,
  })

  const performSave = useCallback(async () => {
    if (!id || !customer) return
    const values = getValues()
    await apiPatch(`/customers/${encodeURIComponent(id)}`, values)
  }, [id, customer, getValues])

  const { trigger: triggerAutoSave } = useAutoSave(performSave)

  useEffect(() => {
    const sub = watch(() => triggerAutoSave())
    return () => sub.unsubscribe()
  }, [watch, triggerAutoSave])

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading\u2026</p>
      </div>
    )
  }

  if (notFound || !customer) {
    if (notFound) {
      return (
        <div className="max-w-3xl mx-auto">
          <Link
            to="/admin/customers"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Back to customers
          </Link>
          <p className="mt-8 text-center text-muted-foreground">
            Customer not found.
          </p>
        </div>
      )
    }
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading\u2026</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <Link
        to="/admin/customers"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Back to customers
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{customer.name}</h1>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-sm text-muted-foreground">{customer.email}</p>
          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title={`Email ${customer.email}`}
            >
              <MailIcon className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-foreground border-b pb-2 mb-4">
            Customer Info
          </h2>
          <CustomerInfoForm
            register={register}
            errors={errors}
            readOnly={false}
          />
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground border-b pb-2 mb-4">
            Quotes ({customer.quotes.length})
          </h2>
          {customer.quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No quotes for this customer.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {customer.quotes.map((quote) => (
                <Link
                  key={quote.id}
                  to={`/admin/quotes/${quote.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-accent transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {quote.jobSiteAddress}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(quote.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={quote.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        <DeleteCustomerPanel
          customer={customer}
          onDeleted={() => navigate("/admin/customers")}
        />
      </div>
    </div>
  )
}
