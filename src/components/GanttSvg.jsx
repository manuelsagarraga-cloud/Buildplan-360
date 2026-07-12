import React, { useRef, useEffect } from 'react'
import { parseDate, addDays, diffDays } from '../lib/utils.js'
import { DEP_TYPE_ABBR } from '../lib/supabase.js'

const ROW_H = 36
const BAR_H = 20
const BAR_PAD = (ROW_H - BAR_H) / 2
const SUMMARY_BAR_H = 10
const SUMMARY_BAR_PAD = (ROW_H - SUMMARY_BAR_H) / 2
const HEADER_PADDING_DAYS = 7

const VIEW_PX_PER_DAY = { day: 40, week: 20, month: 8, quarter: 4, year: 2 }
const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function depClass(type) {
  return { finish_to_start:'dep-fs',start_to_start:'dep-ss',finish_to_finish:'dep-ff',start_to_finish:'dep-sf' }[type] || 'dep-fs'
}

export function GanttSvg({ tasks, deps, viewMode, currentProject, onTaskClick }) {
  const bodyRef = useRef(null)
  const headerRef = useRef(null)

  if (!tasks.length) return <div className="empty-state">Sin tareas para mostrar</div>

  // Compute date range
  let minStart = tasks[0].start_date, maxEnd = tasks[0].end_date
  tasks.forEach(t => {
    if (t.start_date < minStart) minStart = t.start_date
    if (t.end_date > maxEnd) maxEnd = t.end_date
  })
  if (currentProject) {
    if (currentProject.start_date < minStart) minStart = currentProject.start_date
    if (currentProject.end_date > maxEnd) maxEnd = currentProject.end_date
  }

  const startD = addDays(parseDate(minStart), -HEADER_PADDING_DAYS)
  const endD = addDays(parseDate(maxEnd), HEADER_PADDING_DAYS)
  const totalDays = Math.round((endD - startD) / 86400000) + 1
  const pxPerDay = VIEW_PX_PER_DAY[viewMode] || 20
  const width = totalDays * pxPerDay
  const height = tasks.length * ROW_H

  const todayISO = new Date().toISOString().split('T')[0]
  const dateToX = d => Math.round((parseDate(d) - startD) / 86400000 * pxPerDay)

  // Build row number map
  const rowNums = {}
  tasks.forEach((t, i) => { rowNums[t.id] = i })

  // ─── Build SVG body ─────────────────────────────────────────
  const svgParts = []

  // Row backgrounds
  const c = new Date(startD.getTime())
  for (let d = 0; d < totalDays; d++) {
    const dow = c.getUTCDay()
    if (dow === 0 || dow === 6) {
      svgParts.push(`<rect class="row-bg weekend" x="${d * pxPerDay}" y="0" width="${pxPerDay}" height="${height}"/>`)
    }
    c.setUTCDate(c.getUTCDate() + 1)
  }

  // Summary row backgrounds
  tasks.forEach((t, i) => {
    if (t._isSummary) {
      svgParts.push(`<rect class="row-bg summary" x="0" y="${i * ROW_H}" width="${width}" height="${ROW_H}"/>`)
    }
  })

  // Grid lines (vertical)
  const c2 = new Date(startD.getTime())
  for (let d = 0; d < totalDays; d++) {
    const x = d * pxPerDay
    const dow = c2.getUTCDay()
    const day = c2.getUTCDate()
    let draw = false
    if (viewMode === 'day') draw = true
    else if (viewMode === 'week') draw = (dow === 1 || d === 0)
    else if (viewMode === 'month') draw = (day === 1)
    else if (viewMode === 'quarter') draw = (day === 1 && c2.getUTCMonth() % 3 === 0)
    else if (viewMode === 'year') draw = (day === 1 && c2.getUTCMonth() === 0)
    if (draw) {
      const cls = (day === 1 && viewMode !== 'day') ? 'grid-line-strong' : 'grid-line'
      svgParts.push(`<line class="${cls}" x1="${x}" y1="0" x2="${x}" y2="${height}"/>`)
    }
    c2.setUTCDate(c2.getUTCDate() + 1)
  }

  // Horizontal grid lines
  for (let i = 0; i <= tasks.length; i++) {
    svgParts.push(`<line class="grid-line" x1="0" y1="${i * ROW_H}" x2="${width}" y2="${i * ROW_H}"/>`)
  }

  // Dependency arrows
  deps.forEach(dep => {
    const predRow = rowNums[dep.predecessor_id]
    const succRow = rowNums[dep.successor_id]
    if (predRow === undefined || succRow === undefined) return
    const pred = tasks[predRow], succ = tasks[succRow]
    if (!pred || !succ) return

    const cls = depClass(dep.dependency_type)
    let x1, y1, x2, y2

    const type = dep.dependency_type
    if (type === 'finish_to_start' || type === 'finish_to_finish') {
      x1 = dateToX(pred.end_date) + pxPerDay
    } else {
      x1 = dateToX(pred.start_date)
    }
    if (type === 'finish_to_start' || type === 'start_to_start') {
      x2 = dateToX(succ.start_date)
    } else {
      x2 = dateToX(succ.end_date) + pxPerDay
    }
    y1 = predRow * ROW_H + ROW_H / 2
    y2 = succRow * ROW_H + ROW_H / 2

    const mx = (x1 + x2) / 2
    svgParts.push(
      `<path class="dep-arrow ${cls}" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" marker-end="url(#arrowhead-${cls.split('-')[1]})"/>`
    )
  })

  // Task bars
  tasks.forEach((t, i) => {
    const x = dateToX(t.start_date)
    const xEnd = dateToX(t.end_date) + pxPerDay
    const barW = Math.max(xEnd - x, 4)
    const y = i * ROW_H
    const isMilestone = t.is_milestone || t.start_date === t.end_date
    const statusCls = `bar-${t.status}`
    const barColor = t.bar_color || '#1d4ed8'

    if (t._isSummary) {
      // Summary/rollup bar (chevron style)
      const by = y + SUMMARY_BAR_PAD
      const bh = SUMMARY_BAR_H
      const arrowSize = 6
      svgParts.push(
        `<g class="bar-clickable" data-task-id="${t.id}">` +
        `<rect class="bar-summary" x="${x}" y="${by}" width="${barW}" height="${bh}" rx="2"/>` +
        `<polygon class="bar-summary" points="${x},${by + bh} ${x + arrowSize},${by + bh + arrowSize} ${x},${by + bh + arrowSize}"/>` +
        `<polygon class="bar-summary" points="${x + barW},${by + bh} ${x + barW - arrowSize},${by + bh + arrowSize} ${x + barW},${by + bh + arrowSize}"/>` +
        `</g>`
      )
    } else if (isMilestone) {
      const cx = dateToX(t.start_date) + pxPerDay / 2
      const cy = y + ROW_H / 2
      const size = 7
      svgParts.push(
        `<g class="bar-clickable" data-task-id="${t.id}">` +
        `<polygon points="${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}" fill="${barColor}" stroke="${barColor}"/>` +
        `</g>`
      )
    } else {
      const by = y + BAR_PAD
      const progW = Math.round(barW * (t.progress || 0) / 100)
      svgParts.push(
        `<g class="bar-clickable ${statusCls}" data-task-id="${t.id}">` +
        `<rect class="bar-bg" x="${x}" y="${by}" width="${barW}" height="${BAR_H}" rx="3" style="fill:${barColor}22;stroke:${barColor}"/>` +
        `<rect class="bar-progress" x="${x}" y="${by}" width="${progW}" height="${BAR_H}" rx="3" style="fill:${barColor}"/>` +
        (barW > 40 ? `<text class="bar-label" x="${x + 4}" y="${by + 13}" clip-path="url(#clip-${i})">${t.name}</text>` : '') +
        `<clipPath id="clip-${i}"><rect x="${x}" y="${by}" width="${barW}" height="${BAR_H}"/></clipPath>` +
        `</g>`
      )
    }
  })

  // Today line
  if (todayISO >= minStart && todayISO <= maxEnd) {
    const tx = dateToX(todayISO) + pxPerDay / 2
    svgParts.push(
      `<line class="today-line" x1="${tx}" y1="0" x2="${tx}" y2="${height}"/>` +
      `<text class="today-label" x="${tx + 3}" y="12">HOY</text>`
    )
  }

  // ─── Build header SVG ────────────────────────────────────────
  let headerHtml = ''
  const ch = new Date(startD.getTime())
  let upperLabel = '', upperStart = 0

  const formatUpperLabel = (key) => {
    if (viewMode === 'day' || viewMode === 'week') {
      const [y, m] = key.split('-').map(Number)
      return `${MONTH_NAMES[m]} ${y}`
    }
    return key
  }

  for (let d = 0; d < totalDays; d++) {
    const x = d * pxPerDay
    const dow = ch.getUTCDay()
    const day = ch.getUTCDate()
    const mon = ch.getUTCMonth()
    const yr = ch.getUTCFullYear()

    const upperKey = (viewMode === 'day' || viewMode === 'week') ? `${yr}-${mon}` : `${yr}`
    if (d === 0) upperLabel = upperKey
    if (upperKey !== upperLabel) {
      headerHtml += `<text class="timeline-major" x="${(upperStart + x) / 2}" y="16" text-anchor="middle">${formatUpperLabel(upperLabel)}</text>`
      headerHtml += `<line x1="${x}" y1="0" x2="${x}" y2="24" stroke="var(--border)" stroke-width="1"/>`
      upperLabel = upperKey; upperStart = x
    }

    let drawLower = false, lowerText = ''
    if (viewMode === 'day') { drawLower = true; lowerText = String(day) }
    else if (viewMode === 'week') { if (dow === 1 || d === 0) { drawLower = true; lowerText = `${String(day).padStart(2,'0')}/${MONTH_NAMES[mon]}` } }
    else if (viewMode === 'month') { if (day === 1 || d === 0) { drawLower = true; lowerText = MONTH_NAMES[mon] } }
    else if (viewMode === 'quarter') { if ((day === 1 && mon % 3 === 0) || d === 0) { drawLower = true; lowerText = `T${Math.floor(mon/3)+1}` } }
    else if (viewMode === 'year') { if ((day === 1 && mon === 0) || d === 0) { drawLower = true; lowerText = String(yr) } }

    if (drawLower) {
      headerHtml += `<text class="timeline-minor" x="${x + 3}" y="40">${lowerText}</text>`
      headerHtml += `<line x1="${x}" y1="24" x2="${x}" y2="48" stroke="var(--border)" stroke-width="1"/>`
    }
    ch.setUTCDate(ch.getUTCDate() + 1)
  }
  headerHtml += `<text class="timeline-major" x="${(upperStart + totalDays * pxPerDay) / 2}" y="16" text-anchor="middle">${formatUpperLabel(upperLabel)}</text>`
  headerHtml += `<line x1="0" y1="24" x2="${width}" y2="24" stroke="var(--border)" stroke-width="1"/>`
  headerHtml += `<line x1="0" y1="48" x2="${width}" y2="48" stroke="var(--border-strong)" stroke-width="1"/>`

  if (todayISO >= minStart) {
    const tx = dateToX(todayISO) + pxPerDay / 2
    headerHtml += `<line class="today-line" x1="${tx}" y1="0" x2="${tx}" y2="48"/>`
    headerHtml += `<text class="today-label" x="${tx + 4}" y="11">HOY</text>`
  }

  const arrowMarkers = `
    <defs>
      <marker id="arrowhead-fs" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6" fill="none" stroke="var(--dep-fs)" stroke-width="1.2"/>
      </marker>
      <marker id="arrowhead-ss" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6" fill="none" stroke="var(--dep-ss)" stroke-width="1.2"/>
      </marker>
      <marker id="arrowhead-ff" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6" fill="none" stroke="var(--dep-ff)" stroke-width="1.2"/>
      </marker>
      <marker id="arrowhead-sf" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6" fill="none" stroke="var(--dep-sf)" stroke-width="1.2"/>
      </marker>
    </defs>
  `

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <div className="right-header-wrap" ref={headerRef}>
        <svg
          id="ganttHeaderSvg"
          width={width}
          height={48}
          style={{ display: 'block' }}
          dangerouslySetInnerHTML={{ __html: arrowMarkers + headerHtml }}
        />
      </div>
      {/* Body */}
      <div className="right-body" ref={bodyRef} id="ganttRightBody">
        <svg
          id="ganttSvg"
          width={width}
          height={height}
          style={{ display: 'block' }}
          dangerouslySetInnerHTML={{ __html: arrowMarkers + svgParts.join('') }}
          onClick={e => {
            const el = e.target.closest('.bar-clickable')
            if (el) onTaskClick(el.dataset.taskId)
          }}
        />
      </div>
    </div>
  )
}
