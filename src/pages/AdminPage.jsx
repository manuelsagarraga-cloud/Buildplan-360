import React, { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { useStore } from '../store/index.js'
import { useAuth } from '../store/auth.js'
import { toast } from '../components/Toast.jsx'

/**
 * Panel de administración — solo admins.
 * Secciones: métricas de base, backup por proyecto, gestión de miembros.
 */
export function AdminPage() {
  const { role, isSuperAdmin } = useAuth()
  const { projects, members } = useStore()
  const isAdmin = role === 'admin' || isSuperAdmin

  const [dbStats, setDbStats] = useState([])
  const [storageStats, setStorageStats] = useState([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [backupBusy, setBackupBusy] = useState(null)

  useEffect(() => { if (isAdmin) loadStats() }, [isAdmin])

  async function loadStats() {
    setLoadingStats(true)
    const [dbRes, stRes] = await Promise.all([
      sb.from('database_usage').select('*'),
      sb.from('storage_usage').select('*'),
    ])
    setDbStats(dbRes.data || [])
    setStorageStats(stRes.data || [])
    setLoadingStats(false)
  }

  async function backup(project) {
    setBackupBusy(project.id)
    try {
      const { data, error } = await sb.rpc('export_project', { project_id: project.id })
      if (error) { toast('Error al generar backup: ' + error.message, 'error'); return }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup-${project.name.replace(/[^a-z0-9]/gi, '_')}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast(`Backup de "${project.name}" descargado`)
    } catch (e) {
      toast('Error: ' + e.message, 'error')
    } finally {
      setBackupBusy(null)
    }
  }

  if (!isAdmin) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Solo los admins pueden acceder al panel de administración.</div>
  )

  const totalRows = dbStats.reduce((s, t) => s + (t.row_count || 0), 0)

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '24px 32px' }}>
      <h2 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}>⚙️ Panel de administración</h2>

      {/* ── Métricas de base ── */}
      <Section title="📊 Uso de la base de datos">
        {loadingStats
          ? <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Cargando métricas…</p>
          : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
                <Kpi label="Registros totales" value={totalRows.toLocaleString('es-AR')} />
                {storageStats.map(s => (
                  <Kpi key={s.bucket_id} label={`Storage (${s.bucket_id})`} value={`${s.file_count} archivos · ${s.total_size || '0 bytes'}`} small />
                ))}
              </div>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em', fontSize: 11 }}>
                    <th style={{ textAlign: 'left', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Tabla</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Filas</th>
                    <th style={{ textAlign: 'right', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>Tamaño</th>
                  </tr>
                </thead>
                <tbody>
                  {dbStats.sort((a, b) => (b.row_count || 0) - (a.row_count || 0)).map(t => (
                    <tr key={t.table_name}>
                      <td style={{ padding: '5px 0', color: 'var(--text-1)', borderBottom: '1px solid var(--border)', fontFamily: 'JetBrains Mono, monospace' }}>{t.table_name}</td>
                      <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--text-2)', borderBottom: '1px solid var(--border)' }}>{(t.row_count || 0).toLocaleString('es-AR')}</td>
                      <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--text-3)', borderBottom: '1px solid var(--border)' }}>{t.total_size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
      </Section>

      {/* ── Backup por proyecto ── */}
      <Section title="💾 Backup manual por proyecto">
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 0, marginBottom: 14 }}>
          Descarga un archivo JSON con todas las tareas, dependencias, libro de obra y baselines del proyecto.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {projects.filter(p => p.status !== 'cancelled').map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{p.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.provincia || '—'}</span>
              <button
                className="btn"
                style={{ fontSize: 12, padding: '4px 10px' }}
                disabled={backupBusy === p.id}
                onClick={() => backup(p)}
              >
                {backupBusy === p.id ? '⏳ Generando…' : '⬇ Descargar'}
              </button>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Miembros ── */}
      <Section title="👥 Miembros de la empresa">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {members.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.color || 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {m.name?.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{m.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.email}</div>
              </div>
              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {m.role}
              </span>
              {!m.active && <span style={{ fontSize: 11, color: 'var(--danger)' }}>inactivo</span>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

const Section = ({ title, children }) => (
  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 22px', marginBottom: 20 }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 16 }}>{title}</div>
    {children}
  </div>
)

const Kpi = ({ label, value, small }) => (
  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
    <div style={{ fontSize: small ? 13 : 22, fontWeight: 700, color: 'var(--brand)', lineHeight: 1.2 }}>{value}</div>
    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{label}</div>
  </div>
)
