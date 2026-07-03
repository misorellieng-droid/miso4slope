import { Bell, Search, Settings, UserCircle } from 'lucide-react'
import { SlopeLogo } from '../icons/SlopeLogo'

export function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2">
        <SlopeLogo size={26} />
        <span className="font-sans text-lg font-bold text-text-primary">miso4slope</span>
      </div>

      <div className="hidden max-w-md flex-1 items-center gap-2 rounded-md bg-elevated px-3 py-2 md:mx-8 md:flex">
        <Search size={16} className="text-text-secondary" />
        <input
          type="text"
          placeholder="Buscar projetos..."
          className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-4 text-text-secondary">
        <button aria-label="Notificações" className="hover:text-text-primary">
          <Bell size={20} />
        </button>
        <button aria-label="Usuário" className="hover:text-text-primary">
          <UserCircle size={22} />
        </button>
        <button aria-label="Configurações" className="hover:text-text-primary">
          <Settings size={20} />
        </button>
      </div>
    </header>
  )
}
