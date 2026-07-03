import {
  BarChart2,
  BookOpen,
  Calculator,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Layers,
  LogOut,
  Settings,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { SlopeLogo } from '../icons/SlopeLogo'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: BarChart2, end: true },
  { to: '/projetos', label: 'Projetos', icon: FolderOpen },
  { to: '/analise', label: 'Nova Análise', icon: Calculator },
  { to: '/sondagens', label: 'Sondagens', icon: Layers },
  { to: '/manual', label: 'Manual / Ajuda', icon: BookOpen },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-border bg-surface transition-all ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md border-l-[3px] px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-accent-blue bg-accent-blue/20 text-white'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`
            }
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t border-border p-2">
        <button
          className="flex items-center gap-3 rounded-md border-l-[3px] border-transparent px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
          title={collapsed ? 'Configurações' : undefined}
        >
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span>Configurações</span>}
        </button>
        <button
          className="flex items-center gap-3 rounded-md border-l-[3px] border-transparent px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mt-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs text-text-secondary hover:text-text-primary"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <SlopeLogo size={16} />}
        </button>
      </div>
    </aside>
  )
}
