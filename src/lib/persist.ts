import { useEffect, useState } from 'react'

/**
 * Estado React persistido automaticamente no localStorage do navegador.
 * Protege contra perda de configuração em quedas de servidor/recarga —
 * não é um substituto de um backend real (Supabase), é só a rede de
 * segurança imediata enquanto isso não está pronto.
 */
export function usePersistedState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : defaultValue
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // localStorage indisponível (modo privado, quota cheia) — falha silenciosa, não crítico
    }
  }, [key, value])

  return [value, setValue] as const
}
