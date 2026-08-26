import React, { useState, useEffect } from 'react'
import { useStore } from '../store/index.js'
import { PROVINCIAS, CICLOS_VIDA, PROJECT_STATUS_LABELS, sb } from '../lib/supabase.js'
import { toast } from './Toast.jsx'

export function ProjectModal() {
  const { projectModal, closeProjectModal, currentProject, saveProject, createProject, loadProject } = useStore()
  const isCreate = projectModal.mode === 'create'
  const [form, setForm] = useState({})
  const [customFields, setCustomFields] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!projectModal.open) return
    if (isCreate) {
      setForm({
        name: '', description: '', status: 'planning', provincia: '', ciclo_vida: '',
        ciudad: '', m2_obra: '', start_date: new Date().toISOString().slice(0, 10),
        end_date: '', contratista: '', rubro: '', proy_obra_adm: '', color: '#2196F3', bar_color: '#FF9800',
      })
      setCustomFields([])
    } else if (currentProject) {
      const p = currentProject
      setForm({
        name: p.name || '', description: p.description || '', status: p.status || 'active',
        provincia: p.provincia || '', ciclo_vida: p.ciclo_vida || '', ciudad: p.ciudad || '',
        m2_obra: p.m2_obra ?? '', start_date: p.start_date || '', end_date: p.end_date || '',
        contratista: p.contratista || '', rubro: p.rubro || '', proy_obra_adm: p.proy_obra_adm || '',
        color: p.color || '', bar_color: p.bar_color || '',
      })
      setCustomFields(Object.entries(p.custom_fields || {}).map(([k, v]) => ({ k, v })))
    }
  }, [projectModal.open, isCreate, currentProject])

  if (!projectModal.open) return null
  function upd(field, value) { setForm(f => ({ ...f, [field]: value })) }

  async function handleSave() {
    if (!form.name?.trim()) { toast('El nombre es obligatorio', 'error'); return }
    setSaving(true)
    try {
      const cf = {}
      customFields.forEach(({ k, v }) => { if (k.trim()) cf[k.trim()] = v })
      const payload = {
        name: form.name.trim(),
        description: form.description || null,
        status: form.status || 'planning',
        provincia: form.provincia || null,
        ciclo_vida: form.ciclo_vida || null,
        ciudad: form.ciudad || null,
        m2_obra: form.m2_obra !== '' ? Number(form.m2_obra) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        contratista: form.contratista || null,
        rubro: form.rubro || null,
        proy_obra_adm: form.proy_obra_adm || null,
        color: form.color || null,
        bar_color: form.bar_color || null,
        custom_fields: cf,
      }
      if (isCreate) {
        const proj = await createProject(payload.name)
        // Update the rest of the fields
        delete payload.name
        await sb.from('projects').update(payload).eq('id', proj.id)
        toast('Proyecto creado')
        closeProjectModal()
        loadProject(proj.id)
      } else {
        await saveProject(payload)
        toast('Proyecto actualizado')
        closeProjectModal()
      }
    } catch (e) { toast('Error: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeProjectModal()}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h2 className="modal-title">{isCreate ? 'Nuevo proyecto' : 'Editar proyecto'}</h2>
          <button className="modal-close" onClick={closeProjectModal}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Nombre del proyecto *</label>
              <input className="form-control" value={form.name} onChange={e => upd('name', e.target.value)} autoFocus={isCreate} />
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <select className="form-control" value={form.status} onChange={e => upd('status', e.target.value)}>
                {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Descripción</label>
            <textarea className="form-control" rows={2} value={form.description} onChange={e => upd('description', e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Fecha inicio</label>
              <input type="date" className="form-control" value={form.start_date} onChange={e => upd('start_date', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha fin</label>
              <input type="date" className="form-control" value={form.end_date} onChange={e => upd('end_date', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Provincia</label>
              <select className="form-control" value={form.provincia} onChange={e => upd('provincia', e.target.value)}>
                <option value="">— Seleccionar —</option>
                {PROVINCIAS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ciudad</label>
              <input className="form-control" value={form.ciudad} onChange={e => upd('ciudad', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Ciclo de Vida</label>
              <select className="form-control" value={form.ciclo_vida} onChange={e => upd('ciclo_vida', e.target.value)}>
                <option value="">— Seleccionar —</option>
                {CICLOS_VIDA.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">M² de obra</label>
              <input type="number" className="form-control" value={form.m2_obra} onChange={e => upd('m2_obra', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Contratista</label>
              <input className="form-control" value={form.contratista} onChange={e => upd('contratista', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Rubro</label>
              <input className="form-control" value={form.rubro} onChange={e => upd('rubro', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Administración (Proy/Obra/Adm)</label>
            <input className="form-control" value={form.proy_obra_adm} onChange={e => upd('proy_obra_adm', e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Color del proyecto</label>
              <input type="color" className="form-control" value={form.color || '#2196F3'} onChange={e => upd('color', e.target.value)} style={{ height: 36, padding: 2 }} />
            </div>
            <div className="form-group">
              <label className="form-label">Color de barras</label>
              <input type="color" className="form-control" value={form.bar_color || '#FF9800'} onChange={e => upd('bar_color', e.target.value)} style={{ height: 36, padding: 2 }} />
            </div>
          </div>
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '14px 0 12px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase' }}>Campos personalizados</span>
            <button className="btn btn-sm" onClick={() => setCustomFields(f => [...f, { k: '', v: '' }])}>+ Campo</button>
          </div>
          {customFields.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0' }}>Sin campos personalizados.</div>
            : customFields.map((cf, i) => (
              <div key={i} className="form-row" style={{ marginBottom: 8 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <input className="form-control" value={cf.k} placeholder="Nombre" onChange={e => setCustomFields(f => f.map((x, j) => j === i ? { ...x, k: e.target.value } : x))} />
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
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : isCreate ? 'Crear proyecto' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
