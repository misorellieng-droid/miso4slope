import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { AnalysisPage } from './pages/AnalysisPage'
import { DashboardPage } from './pages/DashboardPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ProjetosPage } from './pages/ProjetosPage'
import { ProjetoDetailPage } from './pages/ProjetoDetailPage'
import { SondagensPage } from './pages/SondagensPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="projetos" element={<ProjetosPage />} />
        <Route path="projetos/:id" element={<ProjetoDetailPage />} />
        <Route path="analise" element={<AnalysisPage />} />
        <Route path="sondagens" element={<SondagensPage />} />
        <Route path="manual" element={<PlaceholderPage title="Manual / Ajuda" />} />
      </Route>
    </Routes>
  )
}
