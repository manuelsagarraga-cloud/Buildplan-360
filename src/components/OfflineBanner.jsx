import React, { useState, useEffect } from 'react'
import { useStore } from '../store/index.js'
import { getPendingCount, waitForEmpty } from '../lib/saveQueue.js'

/**
 * Banner de modo offline y de sincronización.
 * - Detecta online/offline del navegador.
 * - Cuando vuelve la conexión, ESPERA a que la cola de guardado termine
 *   antes de recargar datos del servidor (para no pisar cambios pendientes).
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [pending, setPending] = useState(0)
  const { init, currentProject, loadProject } = useStore()

  // Actualizar el contador de pendientes periódicamente
  useEffect(() => {
    const interval = setInterval(() => setPending(getPendingCount()), 500)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const goOnline = async () => {
      setOnline(true)
      setSyncing(true)
      try {
        // Primero: esperar a que la cola de guardado termine de enviar
        // (la cola ya arrancó sola con 3s de delay al detectar 'online')
        // Le damos hasta 60 segundos para que agote sus reintentos.
        console.log('[OfflineBanner] Esperando a que la cola se vacíe…')
        const remaining = await waitForEmpty(60000)
        if (remaining > 0) {
          console.warn(`[OfflineBanner] La cola no se vació del todo (${remaining} pendientes)`)
        }

        // Recién ahora recargamos datos del servidor
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

  // No mostrar nada si está todo bien
  if (online && !syncing && pending === 0) return null

  const bannerStyle = {
    position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
    zIndex: 9999, padding: '10px 20px', borderRadius: 10,
    color: '#fff', fontSize: 13, fontWeight: 600,
    boxShadow: '0 4px 20px rgba(0,0,0,.3)',
    display: 'flex', alignItems: 'center', gap: 10,
    animation: 'slideUp .2s ease',
  }

  // Offline
  if (!online) {
    const msg = pending > 0
      ? `Sin conexión — ${pending} cambio(s) pendiente(s), se enviarán al reconectar`
      : 'Sin conexión — los cambios que hagas se encolarán y enviarán al reconectar'
    return (
      <div style={{ ...bannerStyle, background: '#1f2937' }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        {msg}
      </div>
    )
  }

  // Sincronizando después de reconexión
  if (syncing) {
    return (
      <div style={{ ...bannerStyle, background: 'var(--info, #3b82f6)' }}>
        <span style={{ fontSize: 16 }}>🔄</span>
        Conexión restaurada — sincronizando{pending > 0 ? ` (${pending} pendiente(s))` : ''}…
      </div>
    )
  }

  // Online pero con saves pendientes (debounce en progreso)
  if (pending > 0) {
    return (
      <div style={{ ...bannerStyle, background: 'var(--accent, #8b5cf6)', padding: '8px 16px', fontSize: 12 }}>
        <span style={{ fontSize: 14 }}>💾</span>
        Guardando {pending} cambio(s)…
      </div>
    )
  }

  return null
}
