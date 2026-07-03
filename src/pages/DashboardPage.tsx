import { Link } from 'react-router-dom'

export function DashboardPage() {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <h1 className="mb-2 font-sans text-xl font-bold text-text-primary">Dashboard</h1>
      <p className="mb-6 text-sm text-text-secondary">
        Em construção. Por enquanto, use a Nova Análise para testar o motor de cálculo.
      </p>
      <Link
        to="/analise"
        className="inline-block rounded-md bg-accent-green px-4 py-2 font-medium"
        style={{ color: '#0D1B2A' }}
      >
        Ir para Nova Análise
      </Link>
    </div>
  )
}
