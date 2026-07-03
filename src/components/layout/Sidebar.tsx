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
      className={`flex shrink-0 flex-col bg-brand transition-all ${collapsed ? 'w-16' : 'w-60'}`}
    >
      <div className={`flex items-center gap-2 px-4 py-5 ${collapsed ? 'justify-center px-2' : ''}`}>
        <SlopeLogo size={26} light />
        {!collapsed && (
          <div className="leading-tight">
            <div className="font-sans text-base font-bold text-white">miso4slope</div>
            <div className="text-[10px] font-medium tracking-wide text-white/70">MISORELLI ENGENHARIA</div>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-white text-brand' : 'text-white/85 hover:bg-white/10 hover:text-white'
              }`
            }
            title={collapsed ? label : undefined}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t border-white/15 p-2">
        <button
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
          title={collapsed ? 'Configurações' : undefined}
        >
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span>Configurações</span>}
        </button>
        <button
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mt-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span>Recolher</span>}
        </button>
        {!collapsed && <div className="px-3 pt-1 text-[10px] text-white/50">miso4slope · v0.1.0</div>}
      </div>
    </aside>
  )
}
