import { cn } from "@/lib/utils"

export function Label({ htmlFor, children, className }: { htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("block text-sm font-medium text-foreground mb-1", className)}>
      {children}
    </label>
  )
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-xs text-destructive">{message}</p>
}

export function inputClass(hasError?: boolean) {
  return cn(
    "w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm",
    "focus:outline-none focus:ring-1 focus:ring-ring",
    hasError ? "border-destructive" : "border-input"
  )
}

export function RadioGroup({
  name,
  options,
  value,
  onChange,
  onBlur,
  error,
  disabled,
}: {
  name: string
  options: { value: string; label: string }[]
  value: string | undefined
  onChange: (v: string) => void
  onBlur?: () => void
  error?: string
  disabled?: boolean
}) {
  const isSegmented = options.length <= 2
  return (
    <div>
      <div className={cn(
        isSegmented
          ? "grid gap-2"
          : "flex flex-wrap gap-2",
        isSegmented && options.length === 2 && "grid-cols-2",
        isSegmented && options.length === 3 && "grid-cols-3",
      )}>
        {options.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "flex items-center justify-center rounded-md border min-h-[44px] px-4 py-2.5 text-sm select-none text-center",
              disabled ? "cursor-default opacity-75" : "cursor-pointer hover:bg-accent active:bg-accent/80 transition-colors",
              value === opt.value
                ? "border-primary bg-primary/5 font-medium ring-1 ring-primary/20"
                : "border-input bg-background"
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => { if (!disabled) { onChange(opt.value); onBlur?.() } }}
              disabled={disabled}
              className="sr-only"
            />
            {opt.label}
          </label>
        ))}
      </div>
      <FieldError message={error} />
    </div>
  )
}

const APPLIANCE_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "Not included" },
  { value: "new", label: "New" },
  { value: "existing", label: "Existing / keep" },
]

export function ApplianceRow({
  label,
  name,
  value,
  onChange,
  disabled,
}: {
  label: string
  name: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="py-3 border-b last:border-0 space-y-2">
      <span className="text-sm font-medium">{label}</span>
      <div className="grid grid-cols-3 gap-2">
        {APPLIANCE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "flex items-center justify-center rounded-md border min-h-[40px] px-2 py-2 text-xs select-none text-center",
              disabled ? "cursor-default opacity-75" : "cursor-pointer hover:bg-accent active:bg-accent/80 transition-colors",
              value === opt.value
                ? "border-primary bg-primary/5 font-medium ring-1 ring-primary/20"
                : "border-input bg-background"
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => { if (!disabled) onChange(opt.value) }}
              disabled={disabled}
              className="sr-only"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  )
}
