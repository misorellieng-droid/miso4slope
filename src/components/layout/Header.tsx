import { Bell, Search, Settings, UserCircle } from 'lucide-react'

export function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
      <div className="flex max-w-xl flex-1 items-center gap-2 rounded-lg bg-elevated px-3 py-2">
        <Search size={16} className="text-text-secondary" />
        <input
          type="text"
          placeholder="Buscar análises, projetos..."
          className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
        />
        <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
          Ctrl K
        </span>
      </div>

      <div className="ml-auto flex items-center gap-4 text-text-secondary">
        <button aria-label="Notificações" className="hover:text-brand">
          <Bell size={20} />
        </button>
        <button aria-label="Usuário" className="hover:text-brand">
          <UserCircle size={22} />
        </button>
        <button aria-label="Configurações" className="hover:text-brand">
          <Settings size={20} />
        </button>
      </div>
    </header>
  )
}
