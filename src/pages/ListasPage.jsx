import React, { useState, useEffect } from 'react'
import { sb } from '../lib/supabase.js'
import { toast } from '../components/Toast.jsx'

function useCompanyId() {
  const [companyId, setCompanyId] = useState(null)
  useEffect(() => {
    sb.rpc('get_my_company_id', {}).then(({ data }) => setCompanyId(data))
  }, [])
  return companyId
}

function ListaEditor({ tabla, titulo, emoji, companyId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')

  async function load() {
    setLoading(true)
    const { data } = await sb.from(tabla).select('id, nombre, activo').eq('company_id', companyId).order('nombre')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { if (companyId) load() }, [companyId, tabla])

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    const { error } = await sb.from(tabla).insert({ nombre: name, company_id: companyId, activo: true })
    if (error) { toast('Error: ' + error.message, 'error'); return }
    setNewName('')
    toast(`${titulo.slice(0, -1)} creado`)
    load()
  }

  async function handleToggle(item) {
    await sb.from(tabla).update({ activo: !item.activo }).eq('id', item.id)
    load()
  }

  async function handleRename(item) {
    const nuevo = window.prompt(`Renombrar "${item.nombre}":`, item.nombre)
    if (nuevo == null || nuevo.trim() === '' || nuevo.trim() === item.nombre) return
    await sb.from(tabla).update({ nombre: nuevo.trim() }).eq('id', item.id)
    toast('Renombrado')
    load()
  }

  return (
    <div className="listas-card">
      <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700 }}>{emoji} {titulo}</h3>
      {loading ? <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Cargando…</p> : (
        <>
          {items.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Sin {titulo.toLowerCase()} todavía.</p>}
          {items.map(item => (
            <div key={item.id} className="listas-row">
              <span className={`listas-status ${item.activo ? 'active' : 'inactive'}`}>
                {item.activo ? '●' : '○'}
              </span>
              <span className="listas-name" style={{ opacity: item.activo ? 1 : 0.5 }}>{item.nombre}</span>
              <div className="listas-actions">
                <button className="btn btn-sm" onClick={() => handleRename(item)} title="Renombrar">✏️</button>
                <button
                  className={`btn btn-sm ${item.activo ? '' : 'btn-ghost'}`}
                  onClick={() => handleToggle(item)}
                  title={item.activo ? 'Desactivar' : 'Activar'}
                >
                  {item.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
          <div className="listas-add" style={{ marginTop: 12 }}>
            <input
              className="form-control"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder={`Nuevo ${titulo.slice(0, -1).toLowerCase()}…`}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!newName.trim()}>+ Agregar</button>
          </div>
        </>
      )}
    </div>
  )
}

export function ListasPage() {
  const companyId = useCompanyId()
  const [tab, setTab] = useState('contratistas')

  if (!companyId) return <div style={{ padding: 28, color: 'var(--text-3)' }}>Cargando…</div>

  return (
    <div style={{ padding: '20px 28px', maxWidth: 700 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700 }}>Listas de administración</h2>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        <button className={`btn ${tab === 'contratistas' ? 'btn-primary' : ''}`} onClick={() => setTab('contratistas')}>
          🏗️ Contratistas
        </button>
        <button className={`btn ${tab === 'zonas' ? 'btn-primary' : ''}`} onClick={() => setTab('zonas')}>
          📍 Zonas
        </button>
      </div>
      {tab === 'contratistas' && <ListaEditor tabla="contratistas" titulo="Contratistas" emoji="🏗️" companyId={companyId} />}
      {tab === 'zonas' && <ListaEditor tabla="zonas" titulo="Zonas" emoji="📍" companyId={companyId} />}
    </div>
  )
}
