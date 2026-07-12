import React, { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { useAuth } from '../store/auth.js'
import { toast } from '../components/Toast.jsx'
import { formatDate } from '../lib/utils.js'

/**
 * Papelera de proyectos eliminados.
 * Permite listar proyectos en la papelera, restaurarlos o eliminarlos definitivamente.
 * Solo visible para admin.
 */
export function TrashPage() {
  const { canEdit, isSuperAdmin, role } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  const isAdmin = role === 'admin' || isSuperAdmin

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await sb.from('deleted_projects').select('*').order('deleted_at', { ascending: false })
    if (!error) setItems(data || [])
    setLoading(false)
  }

  async function restore(item) {
    if (!confirm(`¿Restaurar "${item.project_data?.name || 'este proyecto'}"? Se van a recuperar todas sus tareas, dependencias y entradas del libro de obra.`)) return
    setBusy(item.id)
    try {
      const snap = item.project_data
      if (!snap) { toast('El snapshot de este proyecto está incompleto', 'error'); return }

      // Restaurar proyecto
      const { data: proj, error: pe } = await sb.from('projects').insert({ ...snap.project, id: snap.project.id }).select().single()
      if (pe) { toast('Error al restaurar el proyecto: ' + pe.message, 'error'); return }

      // Restaurar tareas
      if (snap.tasks?.length) await sb.from('tasks').insert(snap.tasks)

      // Restaurar dependencias
      if (snap.deps?.length) await sb.from('task_dependencies').insert(snap.deps)

      // Restaurar libro de obra
      if (snap.log?.length) await sb.from('project_log_entries').insert(snap.log)

      // Restaurar baselines
      if (snap.baselines?.length) await sb.from('project_baselines').insert(snap.baselines)

      // Eliminar de la papelera
      await sb.from('deleted_projects').delete().eq('id', item.id)

      toast(`"${snap.project?.name}" restaurado`)
      await load()
    } catch (e) {
      toast('Error al restaurar: ' + e.message, 'error')
    } finally {
      setBusy(null)
    }
  }

  async function purge(item) {
    if (!confirm(`¿ELIMINAR DEFINITIVAMENTE "${item.project_data?.name}"? Esta acción NO se puede deshacer.`)) return
    setBusy(item.id)
    await sb.from('deleted_projects').delete().eq('id', item.id)
    toast('Eliminado definitivamente')
    await load()
    setBusy(null)
  }

  if (!isAdmin) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Solo los admins pueden acceder a la papelera.</div>
  )

  return (
    <div style={{ padding: '24px 32px', overflowY: 'auto', flex: 1 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', marginTop: 0, marginBottom: 6 }}>🗑 Papelera de proyectos</h2>
      <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 0, marginBottom: 24 }}>Los proyectos eliminados se guardan acá 30 días antes de borrarse definitivamente.</p>

      {loading && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Cargando…</div>}

      {!loading && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗑</div>
          <p>La papelera está vacía.</p>
        </div>
      )}

      {items.map(item => {
        const proj = item.project_data?.project || {}
        const taskCount = item.project_data?.tasks?.length || 0
        const deletedAt = item.deleted_at ? new Date(item.deleted_at).toLocaleDateString('es-AR') : '—'
        const isBusy = busy === item.id

        return (
          <div key={item.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-1)', marginBottom: 4 }}>{proj.name || 'Sin nombre'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 16 }}>
                <span>📋 {taskCount} tareas</span>
                <span>📍 {proj.provincia || 'Sin provincia'}</span>
                <span>🗑 Eliminado el {deletedAt}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                className="btn"
                style={{ background: 'var(--success-bg)', color: 'var(--success)', borderColor: 'var(--success)' }}
                disabled={isBusy}
                onClick={() => restore(item)}
              >
                {isBusy ? '…' : '↩ Restaurar'}
              </button>
              <button
                className="btn"
                style={{ background: 'var(--danger-bg)', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                disabled={isBusy}
                onClick={() => purge(item)}
              >
                {isBusy ? '…' : '🗑 Eliminar definitivamente'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
