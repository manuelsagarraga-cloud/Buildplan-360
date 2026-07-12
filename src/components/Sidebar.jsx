import React from 'react'
import { useStore } from '../store/index.js'

export function Sidebar({ setSearchOpen = () => {} }) {
  const { page, setPage, sidebarOpen, currentProject, editMode } = useStore()

  return (
    <nav className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">B</div>
        <div>
          <div className="sidebar-logo-text">Bauvek</div>
          <div className="sidebar-logo-sub">Buildplan 360</div>
        </div>
      </div>

      <div className="sidebar-nav">
        <div className="sidebar-section">Navegación</div>

        <button
          className={`sidebar-item ${page === 'projects' ? 'active' : ''}`}
          onClick={() => setPage('projects')}
        >
          <span className="sidebar-item-icon">🏗️</span>
          Centro de Proyectos
        </button>

        <button
          className="sidebar-item"
          onClick={() => setSearchOpen(o => !o)}
          title="Ctrl+K"
        >
          <span className="sidebar-item-icon">🔍</span>
          Búsqueda
          <kbd style={{ marginLeft: 'auto', fontSize: 9, padding: '1px 4px', background: 'rgba(255,255,255,.1)', borderRadius: 3, color: 'rgba(255,255,255,.5)' }}>Ctrl+K</kbd>
        </button>

        {currentProject && (
          <button
            className={`sidebar-item ${page === 'gantt' ? 'active' : ''}`}
            onClick={() => setPage('gantt')}
          >
            <span className="sidebar-item-icon">📊</span>
            {currentProject.name.length > 22
              ? currentProject.name.slice(0, 22) + '…'
              : currentProject.name}
          </button>
        )}

        {currentProject && (
          <button
            className={`sidebar-item ${page === 'log' ? 'active' : ''}`}
            onClick={() => setPage('log')}
          >
            <span className="sidebar-item-icon">📒</span>
            Libro de obra
          </button>
        )}

        {editMode && (
          <>
            <div className="sidebar-section" style={{ marginTop: 8 }}>Administración</div>
            <button
              className={`sidebar-item ${page === 'resources' ? 'active' : ''}`}
              onClick={() => setPage('resources')}
            >
              <span className="sidebar-item-icon">👥</span>
              Centro de Recursos
            </button>
          </>
        )}
      </div>

      <div className="sidebar-footer">
        <div className="connection-pill loading" id="sidebarConnectionPill">
          Conectando...
        </div>
      </div>
    </nav>
  )
}
