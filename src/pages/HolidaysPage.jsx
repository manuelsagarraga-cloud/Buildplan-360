import React, { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { useAuth } from '../store/auth.js'
import { toast } from '../components/Toast.jsx'

/**
 * Calendario de feriados de la empresa.
 * Ver: todos los logueados. Agregar/eliminar: solo admin.
 */
export function HolidaysPage() {
  const { role, isSuperAdmin, currentMember } = useAuth()
  const isAdmin = role === 'admin' || isSuperAdmin
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ date: '', name: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await sb.from('company_holidays').select('*').order('date')
    setHolidays(data || [])
    setLoading(false)
  }

  async function add() {
    if (!form.date || !form.name.trim()) { toast('Completá la fecha y el nombre', 'warning'); return }
    setSaving(true)
    const { error } = await sb.from('company_holidays').insert({
      date: form.date,
      name: form.name.trim(),
      company_id: currentMember?.company_id,
    })
    if (error) { toast('Error: ' + error.message, 'error') }
    else { toast('Feriado agregado'); setForm({ date: '', name: '' }); await load() }
    setSaving(false)
  }

  async function remove(id, name) {
    if (!confirm(`¿Eliminar "${name}"?`)) return
    await sb.from('company_holidays').delete().eq('id', id)
    toast('Feriado eliminado')
    await load()
  }

  // Agrupar por año
  const byYear = holidays.reduce((acc, h) => {
    const y = h.date?.slice(0, 4) || 'Sin año'
    if (!acc[y]) acc[y] = []
    acc[y].push(h)
    return acc
  }, {})

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '24px 32px', maxWidth: 700 }}>
      <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: 'var(--text-1)' }}>📅 Feriados de la empresa</h2>
      <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 24px' }}>
        {holidays.length} feriados cargados · Se usan para calcular días hábiles en el cronograma.
      </p>

      {/* Formulario — solo admin */}
      {isAdmin && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Fecha</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              style={{ height: 36, padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--bg)', color: 'var(--text-1)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Nombre del feriado</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Día de la Independencia"
              style={{ height: 36, padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--bg)', color: 'var(--text-1)' }}
              onKeyDown={e => { if (e.key === 'Enter') add() }}
            />
          </div>
          <button className="btn btn-primary" disabled={saving} onClick={add} style={{ height: 36, whiteSpace: 'nowrap' }}>
            {saving ? 'Guardando…' : '+ Agregar feriado'}
          </button>
        </div>
      )}

      {/* Lista por año */}
      {loading && <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Cargando…</div>}
      {!loading && Object.entries(byYear).sort(([a], [b]) => a.localeCompare(b)).map(([year, items]) => (
        <div key={year} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
            {year} · {items.length} feriados
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {items.map((h, i) => {
              const d = new Date(h.date + 'T12:00:00')
              const day = d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'long' })
              return (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none', gap: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', width: 160, flexShrink: 0, textTransform: 'capitalize' }}>{day}</span>
                  <span style={{ flex: 1, fontSize: 14, color: 'var(--text-1)', fontWeight: 500 }}>{h.name}</span>
                  {isAdmin && (
                    <button onClick={() => remove(h.id, h.name)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 14, padding: '2px 6px', borderRadius: 4, opacity: .6 }}
                      title="Eliminar feriado"
                    >✕</button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
