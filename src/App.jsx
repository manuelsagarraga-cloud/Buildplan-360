import React, { useEffect, useState } from 'react'
import { useStore } from './store/index.js'
import { useAuth } from './store/auth.js'
import { LoginScreen } from './components/LoginScreen.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import { ProjectHeader } from './components/ProjectHeader.jsx'
import { GanttView } from './components/GanttView.jsx'
import { TaskModal } from './components/TaskModal.jsx'
import { ProjectModal } from './components/ProjectModal.jsx'
import { ImportModal } from './components/ImportModal.jsx'
import { ResourceModal } from './components/ResourceModal.jsx'
import { ToastContainer } from './components/Toast.jsx'
import { ProjectsPage } from './pages/ProjectsPage.jsx'
import { ResourcesPage } from './pages/ResourcesPage.jsx'
import { GlobalSearch } from './components/GlobalSearch.jsx'
import { LogPage } from './pages/LogPage.jsx'

export default function App() {
  const { initAuth, authReady, session, currentMember, role, canEdit, isSuperAdmin, signOut } = useAuth()
  const {
    init, connected, page,
    sidebarOpen, toggleSidebar,
    editMode, setEditMode,
  } = useStore()
  const [searchOpen, setSearchOpen] = useState(false)

  // Ctrl+K abre la búsqueda
  useEffect(() => {
    const h = e => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(o => !o) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // 1) Arrancar la autenticación (sesión guardada + suscripción a cambios)
  useEffect(() => { initAuth() }, [])

  // 2) Cuando hay sesión, cargar los datos de la app
  useEffect(() => { if (session) init() }, [session])

  // Pill de conexión en el sidebar
  useEffect(() => {
    const el = document.getElementById('sidebarConnectionPill')
    if (!el) return
    if (connected === null) {
      el.className = 'connection-pill loading'; el.textContent = 'Conectando…'
    } else if (connected) {
      el.className = 'connection-pill ok'; el.textContent = 'Conectado'
    } else {
      el.className = 'connection-pill err'; el.textContent = 'Sin conexión'
    }
  }, [connected])

  // El modo edición solo tiene sentido si el rol puede editar
  const puedeEditar = canEdit

  // ── Portón de autenticación ──
  if (!authReady) {
    return <div className="app-loading">Cargando…</div>
  }
  if (!session) {
    return (
      <>
        <LoginScreen />
        <ToastContainer />
      </>
    )
  }

  const displayName = currentMember?.name || session.user?.email || 'Usuario'
  const empresa = currentMember?.company_name

  return (
    <div className="app-layout">
      {/* ── Top bar ──────────────────────────────────────────── */}
      <header className="app-bar">
        <div className="app-bar-left">
          <button className="sidebar-toggle" onClick={toggleSidebar}>☰</button>
          <span className="app-bar-title">{empresa ? empresa + ' · ' : ''}Buildplan 360</span>
        </div>
        <div className="app-bar-right">
          {puedeEditar && (
            <label className="admin-toggle">
              <input type="checkbox" checked={editMode} onChange={e => setEditMode(e.target.checked)} />
              Modo Edición
            </label>
          )}
          <span className={'role-badge role-' + role}>
            {isSuperAdmin ? 'SUPER ADMIN' : role.toUpperCase()}
          </span>
          <span className="app-bar-user">{displayName}</span>
          <button className="btn-logout" onClick={signOut} title="Cerrar sesión">Salir</button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="app-body">
        <Sidebar setSearchOpen={setSearchOpen} />

        <main className="main-content">
          {connected === false && (
            <div className="error-box">
              ⚠️ No se pudo conectar a Supabase. Verificá tu conexión o las credenciales.
            </div>
          )}

          {page === 'projects' && <ProjectsPage />}

          {page === 'gantt' && (
            <>
              <ProjectHeader />
              <GanttView />
            </>
          )}

          {page === 'resources' && <ResourcesPage />}
          {page === 'log' && <LogPage />}
        </main>
      </div>

      {/* ── Modals ───────────────────────────────────────────── */}
      <TaskModal />
      <ProjectModal />
      <ImportModal />
      <ResourceModal />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ToastContainer />
    </div>
  )
}
