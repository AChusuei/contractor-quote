export interface AddressSuggestion {
  id: string
  label: string
}

export interface AddressComponents {
  street: string
  city: string
  state: string
  zip: string
  country: string
  raw: string
}

export interface AddressProvider {
  suggest(query: string): Promise<AddressSuggestion[]>
  resolve(id: string): Promise<AddressComponents>
}
