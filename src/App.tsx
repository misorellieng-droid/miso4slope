import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { AnalysisPage } from './pages/AnalysisPage'
import { DashboardPage } from './pages/DashboardPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ProjetosPage } from './pages/ProjetosPage'
import { ProjetoDetailPage } from './pages/ProjetoDetailPage'
import { SondagensPage } from './pages/SondagensPage'
import { SSOPage } from './pages/SSOPage'
import { NotificacoesPage } from './pages/NotificacoesPage'
import { RequireHubLogin } from './components/RequireHubLogin'

export default function App() {
  return (
    <Routes>
      <Route path="sso" element={<SSOPage />} />
      <Route element={<RequireHubLogin><AppLayout /></RequireHubLogin>}>
        <Route index element={<DashboardPage />} />
        <Route path="projetos" element={<ProjetosPage />} />
        <Route path="projetos/:id" element={<ProjetoDetailPage />} />
        <Route path="analise" element={<AnalysisPage />} />
        <Route path="sondagens" element={<SondagensPage />} />
        <Route path="notificacoes" element={<NotificacoesPage />} />
        <Route path="manual" element={<PlaceholderPage title="Manual / Ajuda" />} />
      </Route>
    </Routes>
  )
}
