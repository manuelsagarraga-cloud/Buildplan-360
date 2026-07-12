import React, { useState, useRef } from 'react'
import { useStore } from '../store/index.js'
import { parseMSProjectXML } from '../lib/utils.js'
import { toast } from './Toast.jsx'

export function ImportModal() {
  const { importModal, closeImportModal, importMSProject } = useStore()
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState(null)
  const [parsedData, setParsedData] = useState(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef(null)

  if (!importModal.open) return null

  function reset() { setPreview(null); setParsedData(null) }

  async function processFile(file) {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xml', 'mpp', 'mpx'].includes(ext)) {
      return toast('Formato no soportado. Exportá desde MS Project como XML (.xml)', 'error')
    }
    try {
      const text = await file.text()
      const data = parseMSProjectXML(text)
      setParsedData(data)
      setPreview({ fileName: file.name, taskCount: data.tasks.length })
    } catch (e) {
      toast('Error al parsear el archivo: ' + e.message, 'error')
    }
  }

  async function handleImport() {
    if (!parsedData) return
    setImporting(true)
    try {
      const count = await importMSProject(parsedData)
      toast(`✓ ${count} tareas importadas correctamente`)
      closeImportModal()
      reset()
    } catch (e) {
      toast('Error al importar: ' + e.message, 'error')
    } finally { setImporting(false) }
  }

  function handleDrop(e) {
    e.preventDefault(); setDragOver(false)
    processFile(e.dataTransfer.files[0])
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeImportModal()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">📥 Importar desde MS Project</h2>
          <button className="modal-close" onClick={closeImportModal}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
            <strong>Cómo exportar desde MS Project:</strong>
            <ol style={{ marginTop: 6, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <li>Abrí el archivo .mpp en MS Project</li>
              <li>Ir a <strong>Archivo → Guardar como</strong></li>
              <li>Elegir formato <strong>Proyecto XML (*.xml)</strong></li>
              <li>Guardar y subir ese archivo aquí</li>
            </ol>
          </div>

          {!preview ? (
            <div
              className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <div className="drop-zone-icon">📂</div>
              <div className="drop-zone-text">Arrastrá tu archivo XML acá</div>
              <div className="drop-zone-sub">o hacé click para seleccionar</div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-3)' }}>Formatos: .xml (exportado desde MS Project)</div>
              <input ref={fileRef} type="file" accept=".xml,.mpp,.mpx" hidden onChange={e => processFile(e.target.files[0])} />
            </div>
          ) : (
            <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success)', borderRadius: 'var(--radius)', padding: 16 }}>
              <div style={{ fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>✓ Archivo parseado correctamente</div>
              <div style={{ fontSize: 13 }}>
                <div><strong>Archivo:</strong> {preview.fileName}</div>
                <div><strong>Tareas encontradas:</strong> {preview.taskCount}</div>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-2)', background: 'var(--warning-bg)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--warning-bg)' }}>
                ⚠️ Las tareas se agregarán al proyecto actual. Los recursos se asignarán si coinciden por nombre con los miembros existentes.
              </div>
              <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={reset}>↺ Cambiar archivo</button>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={() => { closeImportModal(); reset() }}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={!preview || importing}
          >
            {importing ? 'Importando…' : `✓ Importar ${preview ? preview.taskCount + ' tareas' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
