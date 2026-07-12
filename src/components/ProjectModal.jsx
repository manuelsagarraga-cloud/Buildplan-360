import React, { useState, useEffect } from 'react'
import { useStore } from '../store/index.js'
import { PROVINCIAS, CICLOS_VIDA } from '../lib/supabase.js'
import { toast } from './Toast.jsx'

export function ProjectModal() {
  const { projectModal, closeProjectModal, currentProject, saveProject } = useStore()
  const [form, setForm] = useState({ provincia: '', ciclo_vida: '' })
  const [customFields, setCustomFields] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!projectModal.open || !currentProject) return
    setForm({ provincia: currentProject.provincia || '', ciclo_vida: currentProject.ciclo_vida || '' })
    const cf = currentProject.custom_fields || {}
    setCustomFields(Object.entries(cf).map(([k, v]) => ({ k, v })))
  }, [projectModal.open, currentProject])

  if (!projectModal.open) return null

  async function handleSave() {
    setSaving(true)
    try {
      const cf = {}
      customFields.forEach(({ k, v }) => { if (k.trim()) cf[k.trim()] = v })
      await saveProject({ provincia: form.provincia || null, ciclo_vida: form.ciclo_vida || null, custom_fields: cf })
      toast('Proyecto actualizado')
      closeProjectModal()
    } catch (e) { toast('Error: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeProjectModal()}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <h2 className="modal-title">Editar proyecto</h2>
          <button className="modal-close" onClick={closeProjectModal}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Provincia</label>
              <select className="form-control" value={form.provincia} onChange={e => setForm(f => ({ ...f, provincia: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {PROVINCIAS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ciclo de Vida</label>
              <select className="form-control" value={form.ciclo_vida} onChange={e => setForm(f => ({ ...f, ciclo_vida: e.target.value }))}>
                <option value="">— Seleccionar —</option>
                {CICLOS_VIDA.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '14px 0 12px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Campos personalizados</span>
            <button className="btn btn-sm" onClick={() => setCustomFields(f => [...f, { k: '', v: '' }])}>+ Campo</button>
          </div>

          {customFields.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0' }}>Sin campos personalizados.</div>
            : customFields.map((cf, i) => (
              <div key={i} className="form-row" style={{ marginBottom: 8 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <input className="form-control" value={cf.k} placeholder="Nombre del campo" onChange={e => setCustomFields(f => f.map((x, j) => j === i ? { ...x, k: e.target.value } : x))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, display: 'flex', gap: 6 }}>
                  <input className="form-control" value={cf.v} placeholder="Valor" onChange={e => setCustomFields(f => f.map((x, j) => j === i ? { ...x, v: e.target.value } : x))} style={{ flex: 1 }} />
                  <button className="btn btn-sm btn-danger" onClick={() => setCustomFields(f => f.filter((_, j) => j !== i))}>✕</button>
                </div>
              </div>
            ))
          }
        </div>
        <div className="modal-footer">
          <div />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={closeProjectModal}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
