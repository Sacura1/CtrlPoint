import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './store/auth'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import Settings from './pages/Settings'
import Deploy from './pages/Deploy'
import Keys from './pages/Keys'
import Deployments from './pages/Deployments'
import GitHub from './pages/GitHub'
import Credits from './pages/Credits'
import Agents from './pages/Agents'
import AgentAnalytics from './pages/AgentAnalytics'
import Support from './pages/Support'
import AdminStatus from './pages/AdminStatus'
import Privacy from './pages/Privacy'
import AccountDeletion from './pages/AccountDeletion'
import ArcHome from './pages/arc/ArcHome'
import ArcProjects from './pages/arc/ArcProjects'
import ArcBuilder from './pages/arc/ArcBuilder'
import ArcDeployments from './pages/arc/ArcDeployments'

const ARC_BUILDER_ENABLED = import.meta.env.VITE_ENABLE_ARC_BUILDER === 'true'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-base-950">
      <Spinner />
    </div>
  )
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function Spinner() {
  return (
    <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
  )
}

export default function App() {
  const init = useAuth(s => s.init)
  useEffect(() => { init() }, [init])

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/agents" element={<Agents />} />
      <Route path="/agents/analytics" element={<AgentAnalytics />} />
      <Route path="/agent-analytics" element={<AgentAnalytics />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/privacy-policy" element={<Privacy />} />
      <Route path="/account-deletion" element={<AccountDeletion />} />
      <Route path="/delete-account" element={<AccountDeletion />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/editor" element={<PrivateRoute><Editor /></PrivateRoute>} />
      <Route path="/editor/:siteId" element={<PrivateRoute><Editor /></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
      <Route path="/deploy" element={<PrivateRoute><Deploy /></PrivateRoute>} />
      <Route path="/keys" element={<PrivateRoute><Keys /></PrivateRoute>} />
      <Route path="/deployments" element={<PrivateRoute><Deployments /></PrivateRoute>} />
      <Route path="/github" element={<PrivateRoute><GitHub /></PrivateRoute>} />
      <Route path="/credits" element={<PrivateRoute><Credits /></PrivateRoute>} />
      <Route path="/support" element={<PrivateRoute><Support /></PrivateRoute>} />
      {ARC_BUILDER_ENABLED ? (
        <>
          <Route path="/arc" element={<PrivateRoute><ArcHome /></PrivateRoute>} />
          <Route path="/arc/projects" element={<PrivateRoute><ArcProjects /></PrivateRoute>} />
          <Route path="/arc/deployments" element={<PrivateRoute><ArcDeployments /></PrivateRoute>} />
          <Route path="/arc/build/:dappId" element={<PrivateRoute><ArcBuilder /></PrivateRoute>} />
        </>
      ) : (
        <Route path="/arc/*" element={<PrivateRoute><Navigate to="/dashboard" replace /></PrivateRoute>} />
      )}
      <Route path="/admin/status" element={<PrivateRoute><AdminStatus /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
