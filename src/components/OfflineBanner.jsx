import React, { useState, useEffect } from 'react'
import { useStore } from '../store/index.js'

/**
 * Banner de modo offline.
 * Detecta online/offline del navegador.
 * Cuando vuelve la conexión, recarga los datos automáticamente.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const { init, currentProject, loadProject } = useStore()

  useEffect(() => {
    const goOnline = async () => {
      setOnline(true)
      setSyncing(true)
      // Recargar datos al volver la conexión
      try {
        if (currentProject) await loadProject(currentProject.id)
        else await init()
      } catch (e) {
        console.error('Error al sincronizar:', e)
      } finally {
        setSyncing(false)
      }
    }
    const goOffline = () => setOnline(false)

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [currentProject?.id])

  if (online && !syncing) return null

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, padding: '10px 20px', borderRadius: 10,
      background: online ? 'var(--success)' : '#1f2937',
      color: '#fff', fontSize: 13, fontWeight: 600,
      boxShadow: '0 4px 20px rgba(0,0,0,.3)',
      display: 'flex', alignItems: 'center', gap: 10,
      animation: 'slideUp .2s ease',
    }}>
      {!online && (
        <>
          <span style={{ fontSize: 16 }}>⚠️</span>
          Sin conexión — los cambios se guardarán cuando vuelva la red
        </>
      )}
      {online && syncing && (
        <>
          <span style={{ fontSize: 16 }}>🔄</span>
          Conexión restaurada — sincronizando datos…
        </>
      )}
    </div>
  )
}
