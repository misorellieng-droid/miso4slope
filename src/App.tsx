import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { AnalysisPage } from './pages/AnalysisPage'
import { DashboardPage } from './pages/DashboardPage'
import { PlaceholderPage } from './pages/PlaceholderPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="projetos" element={<PlaceholderPage title="Projetos" />} />
        <Route path="analise" element={<AnalysisPage />} />
        <Route path="sondagens" element={<PlaceholderPage title="Sondagens" />} />
        <Route path="manual" element={<PlaceholderPage title="Manual / Ajuda" />} />
      </Route>
    </Routes>
  )
}
