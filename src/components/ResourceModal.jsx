import React, { useState, useEffect } from 'react'
import { useStore } from '../store/index.js'
import { toast } from './Toast.jsx'

const MEMBER_COLORS = [
  '#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6',
  '#EC4899','#06B6D4','#84CC16','#F97316','#6366F1',
]

export function ResourceModal() {
  const { resourceModal, closeResourceModal, saveMember, deleteMember } = useStore()
  const { open, member } = resourceModal
  const isNew = !member

  const [form, setForm] = useState({ name: '', email: '', role: '', color: '#3B82F6', active: true })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (member) {
      setForm({ name: member.name || '', email: member.email || '', role: member.role || '', color: member.color || '#3B82F6', active: member.active !== false })
    } else {
      setForm({ name: '', email: '', role: '', color: MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)], active: true })
    }
  }, [open, member])

  if (!open) return null

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.name.trim()) return toast('El nombre es requerido', 'error')
    setSaving(true)
    try {
      await saveMember({ name: form.name.trim(), email: form.email || null, role: form.role || null, color: form.color, active: form.active }, member?.id)
      toast(isNew ? 'Recurso creado' : 'Recurso actualizado')
      closeResourceModal()
    } catch (e) { toast('Error: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!member || !window.confirm('¿Eliminar este recurso?')) return
    try {
      await deleteMember(member.id)
      toast('Recurso eliminado')
      closeResourceModal()
    } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeResourceModal()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 className="modal-title">{isNew ? 'Nuevo recurso' : 'Editar recurso'}</h2>
          <button className="modal-close" onClick={closeResourceModal}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Nombre *</label>
            <input className="form-control" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre completo" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" className="form-control" value={form.email} onChange={e => set('email', e.target.value)} placeholder="correo@empresa.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Rol / Cargo</label>
              <input className="form-control" value={form.role} onChange={e => set('role', e.target.value)} placeholder="Ej: Arquitecto" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Color del avatar</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {MEMBER_COLORS.map(c => (
                <button key={c} onClick={() => set('color', c)} style={{
                  width: 28, height: 28, borderRadius: '50%', background: c,
                  border: form.color === c ? '3px solid var(--brand)' : '2px solid transparent',
                  outline: form.color === c ? '2px solid white' : 'none',
                  cursor: 'pointer',
                }} />
              ))}
            </div>
          </div>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
              <span>Activo (aparece en asignaciones)</span>
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <div>{!isNew && <button className="btn btn-danger" onClick={handleDelete}>Eliminar</button>}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={closeResourceModal}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
