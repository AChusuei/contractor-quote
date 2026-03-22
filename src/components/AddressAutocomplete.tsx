import { useCallback, useEffect, useRef, useState } from "react"
import { getAddressProvider } from "@/lib/address/provider"
import type { AddressSuggestion } from "@/lib/address/types"
import { cn } from "@/lib/utils"

interface AddressAutocompleteProps {
  id?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  className?: string
  hasError?: boolean
  placeholder?: string
  autoComplete?: string
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

export function AddressAutocomplete({
  id,
  value,
  onChange,
  onBlur,
  className,
  hasError,
  placeholder,
  autoComplete = "off",
}: AddressAutocompleteProps) {
  const provider = getAddressProvider()

  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const ignoreNextFetchRef = useRef(false)

  const debouncedValue = useDebounce(value, 300)

  useEffect(() => {
    if (!provider || debouncedValue.trim().length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }

    if (ignoreNextFetchRef.current) {
      ignoreNextFetchRef.current = false
      return
    }

    let cancelled = false
    setLoading(true)
    provider.suggest(debouncedValue).then((results) => {
      if (!cancelled) {
        setSuggestions(results)
        setOpen(results.length > 0)
        setActiveIndex(-1)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) {
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [debouncedValue, provider])

  const selectSuggestion = useCallback(async (suggestion: AddressSuggestion) => {
    if (!provider) return

    ignoreNextFetchRef.current = true
    setOpen(false)
    setSuggestions([])

    // Optimistically fill with the suggestion label
    onChange(suggestion.label)

    try {
      const components = await provider.resolve(suggestion.id)
      const formatted = components.raw || suggestion.label
      ignoreNextFetchRef.current = true
      onChange(formatted)
    } catch {
      // Keep the suggestion label as fallback
    }
  }, [provider, onChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault()
      selectSuggestion(suggestions[activeIndex])
    } else if (e.key === "Escape") {
      setOpen(false)
      setActiveIndex(-1)
    }
  }, [open, suggestions, activeIndex, selectSuggestion])

  const inputClass = cn(
    "w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm",
    "focus:outline-none focus:ring-1 focus:ring-ring",
    hasError ? "border-destructive" : "border-input",
    className
  )

  // No provider configured — render a plain text input
  if (!provider) {
    return (
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={inputClass}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
    )
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={open ? `${id}-listbox` : undefined}
        aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          // Delay close so click on suggestion fires first
          setTimeout(() => {
            setOpen(false)
            onBlur?.()
          }, 150)
        }}
        onKeyDown={handleKeyDown}
        className={inputClass}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          …
        </span>
      )}
      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          className={cn(
            "absolute z-50 mt-1 w-full rounded-md border border-input bg-background shadow-md",
            "max-h-60 overflow-auto text-sm"
          )}
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault()
                selectSuggestion(s)
              }}
              className={cn(
                "cursor-pointer px-3 py-2 text-sm",
                i === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
