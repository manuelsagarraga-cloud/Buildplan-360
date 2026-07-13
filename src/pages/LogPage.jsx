import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '../store/index.js'
import { useAuth } from '../store/auth.js'
import { sb, SUPABASE_URL } from '../lib/supabase.js'
import { toast } from '../components/Toast.jsx'
import { compressImage } from '../lib/images.js'

const ENTRY_TYPES = ['observacion', 'avance', 'incidente', 'entrega', 'reunion', 'otro']
const TYPE_LABELS = { observacion: 'Observación', avance: 'Avance', incidente: 'Incidente', entrega: 'Entrega', reunion: 'Reunión', otro: 'Otro' }
const TYPE_ICONS  = { observacion: '📝', avance: '📈', incidente: '⚠️', entrega: '📦', reunion: '🤝', otro: '📌' }
const BUCKET = 'project-log-attachments'

export function LogPage() {
  const { currentProject, members } = useStore()
  const { currentMember, canEdit } = useAuth()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  const [form, setForm] = useState({ entry_type: 'observacion', detail: '', files: [] })
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { if (currentProject) loadEntries() }, [currentProject?.id])

  async function loadEntries() {
    setLoading(true)
    const { data, error } = await sb.from('project_log_entries')
      .select('*').eq('project_id', currentProject.id)
      .order('created_at', { ascending: false })
    if (!error) setEntries(data || [])
    setLoading(false)
  }

  async function handleSubmit() {
    if (!form.detail.trim()) { toast('Escribí una descripción', 'warning'); return }
    setSaving(true)
    try {
      const attachments = []

      // Subir fotos si hay
      for (const file of form.files) {
        const compressed = await compressImage(file)
        const path = `${currentProject.id}/${currentMember?.id || 'unknown'}/${Date.now()}-${file.name}`
        const { error: upErr } = await sb.storage.from(BUCKET).upload(path, compressed, { contentType: file.type })
        if (upErr) { toast('Error al subir ' + file.name, 'error'); continue }
        const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
        attachments.push({ url, name: file.name, path, size: compressed.size, type: file.type })
      }

      const { error } = await sb.from('project_log_entries').insert({
        project_id: currentProject.id,
        entry_type: form.entry_type,
        detail: form.detail.trim(),
        attachments,
        author_id: currentMember?.id || null,
      })
      if (error) { toast('Error al guardar: ' + error.message, 'error'); return }

      toast('Entrada guardada')
      setForm({ entry_type: 'observacion', detail: '', files: [] })
      setShowForm(false)
      await loadEntries()
    } finally {
      setSaving(false)
    }
  }

  if (!currentProject) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>Abrí un proyecto primero.</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}>📒 Libro de obra</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-3)' }}>{currentProject.name} · {entries.length} entrada(s)</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
            {showForm ? '✕ Cancelar' : '+ Nueva entrada'}
          </button>
        )}
      </div>

      {/* Formulario nueva entrada */}
      {showForm && (
        <div style={{ padding: '16px 28px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <select
              className="filter-select"
              value={form.entry_type}
              onChange={e => setForm(f => ({ ...f, entry_type: e.target.value }))}
            >
              {ENTRY_TYPES.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <textarea
            value={form.detail}
            onChange={e => setForm(f => ({ ...f, detail: e.target.value }))}
            placeholder="Describí lo que pasó en obra hoy…"
            rows={3}
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--text-1)' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => setForm(f => ({ ...f, files: [...f.files, ...Array.from(e.target.files)] }))} />
            <button className="btn" onClick={() => fileRef.current.click()}>📷 Agregar fotos</button>
            {form.files.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{form.files.length} foto(s) seleccionada(s)</span>}
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={saving} onClick={handleSubmit}>
              {saving ? 'Guardando…' : 'Guardar entrada'}
            </button>
          </div>
          {/* Preview de fotos seleccionadas */}
          {form.files.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {form.files.map((f, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={URL.createObjectURL(f)} alt={f.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                  <button
                    onClick={() => setForm(fm => ({ ...fm, files: fm.files.filter((_, j) => j !== i) }))}
                    style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, border: 'none', borderRadius: '50%', background: 'var(--danger)', color: '#fff', fontSize: 10, cursor: 'pointer', padding: 0 }}
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lista de entradas */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px' }}>
        {loading && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Cargando…</div>}
        {!loading && entries.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📒</div>
            <p>Todavía no hay entradas en el libro de obra.</p>
            {canEdit && <p style={{ fontSize: 13 }}>Usá "+ Nueva entrada" para registrar el primer evento.</p>}
          </div>
        )}
        {entries.map(entry => {
          const author = members.find(m => m.id === entry.author_id)
          const date = new Date(entry.created_at)
          const dateStr = date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
          const timeStr = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
          const attachments = Array.isArray(entry.attachments) ? entry.attachments : []

          return (
            <div key={entry.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>{TYPE_ICONS[entry.entry_type] || '📌'}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>{TYPE_LABELS[entry.entry_type] || entry.entry_type}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>
                  {author ? author.name : 'Sin autor'} · {dateStr} {timeStr}
                </span>
              </div>
              <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--text-1)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{entry.detail}</p>
              {attachments.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {attachments.map((att, i) => (
                    att.type?.startsWith('image/') ? (
                      <img
                        key={i} src={att.url} alt={att.name}
                        style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }}
                        onClick={() => setLightbox(att.url)}
                        title={att.name}
                      />
                    ) : (
                      <a key={i} href={att.url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 12, color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        📎 {att.name}
                      </a>
                    )
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Lightbox de fotos */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img src={lightbox} alt="foto" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 4px 40px rgba(0,0,0,.5)' }} onClick={e => e.stopPropagation()} />
          <button onClick={() => setLightbox(null)} style={{ position: 'fixed', top: 20, right: 20, background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', fontSize: 20, width: 40, height: 40, borderRadius: '50%', cursor: 'pointer' }}>✕</button>
        </div>
      )}
    </div>
  )
}
