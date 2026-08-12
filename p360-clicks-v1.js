/**
 * Pipeline360 v2 — p360-clicks-v1.js  (v1.2)
 *
 *  A) Clic en la grilla:
 *     · Clic simple en una fila → SELECCIONAR (marca el checkbox). No abre la ficha.
 *     · ✎ (Modo Edición) → ABRIR la ficha completa.
 *     · Doble clic en el NOMBRE (Modo Edición) → editarlo inline (Enter guarda, Esc cancela).
 *  B) LÍNEA BASE (nuevo): botón flotante "📊 Línea base" que abre un panel para
 *     · CREAR una línea base del proyecto abierto (usa la función create_baseline).
 *     · VER la variación vs la última línea base: "Su plan lleva un retraso de X días"
 *       + detalle por tarea (Fin previsto vs Fin actual = Variación de fin).
 *
 *  Parche defensivo (todo en try/catch). Usa el cliente Supabase en window._p360sb.
 *  El ID de tarea sale del key del fiber de React (la fila se rendea con key = task.id).
 */
(function () {
  'use strict';
  if (window._p360clicks1) return;
  window._p360clicks1 = true;

  var OPEN = 'p360-open-btn';
  var bypass = false;
  var raf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function (f) { return setTimeout(f, 50); };
  function editModeOn() { return !!document.querySelector('.assignee-cell select, .inline-select, .inline-pct'); }
  var PASS = 'input, select, textarea, a, button, .expand-toggle, .assignee-cell, .inline-select, .inline-pct, .' + OPEN;

  function taskIdOf(row) {
    try {
      var key = Object.keys(row).find(function (k) { return k.indexOf('__reactFiber$') === 0; });
      var f = key ? row[key] : null;
      return f && f.key != null ? f.key : null;
    } catch (e) { return null; }
  }

  /* ===================== A) CLIC EN LA GRILLA ===================== */
  document.addEventListener('click', function (e) {
    try {
      var t = e.target; if (!t || !t.closest) return;
      var btn = t.closest('.' + OPEN);
      if (btn) {
        e.stopPropagation();
        var r0 = btn.closest('.task-row');
        if (r0) { bypass = true; r0.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }
        return;
      }
      var row = t.closest('.task-row'); if (!row) return;
      if (bypass) { bypass = false; return; }
      if (t.closest('.p360-name-input')) return;
      if (t.closest(PASS)) return;
      e.stopPropagation();
      var cb = row.querySelector('input[type="checkbox"]');
      if (cb) cb.click();
    } catch (err) {}
  }, true);

  document.addEventListener('dblclick', function (e) {
    try {
      var span = e.target.closest && e.target.closest('.task-name-text');
      if (!span) return;
      e.stopPropagation(); e.preventDefault();
      startNameEdit(span);
    } catch (err) {}
  }, true);

  function startNameEdit(span) {
    if (!editModeOn()) return;
    var cell = span.closest('.task-name-cell'), row = span.closest('.task-row');
    if (!cell || !row || cell.querySelector('.p360-name-input')) return;
    var id = taskIdOf(row);
    if (id == null || !window._p360sb) return;
    var current = span.textContent || '';
    var input = document.createElement('input');
    input.type = 'text'; input.className = 'p360-name-input'; input.value = current;
    span.style.display = 'none';
    span.parentNode.insertBefore(input, span.nextSibling);
    input.focus(); input.select();
    var done = false;
    function finish(save) {
      if (done) return; done = true;
      var val = (input.value || '').trim();
      if (input.parentNode) input.parentNode.removeChild(input);
      span.style.display = '';
      if (save && val && val !== current) {
        span.textContent = val;
        try {
          window._p360sb.from('tasks').update({ name: val }).eq('id', id).then(function (res) {
            if (res && res.error) { span.textContent = current; console.warn('[p360] no se pudo guardar el nombre:', res.error.message); }
          });
        } catch (err) { span.textContent = current; }
      }
    }
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', function () { finish(true); });
    input.addEventListener('click', function (ev) { ev.stopPropagation(); });
    input.addEventListener('dblclick', function (ev) { ev.stopPropagation(); });
  }

  var pending = false;
  function scheduleSync() { if (pending) return; pending = true; raf(function () { pending = false; syncButtons(); }); }
  function syncButtons() {
    try {
      var on = editModeOn();
      var cells = document.querySelectorAll('.task-name-cell');
      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i], has = cell.querySelector('.' + OPEN);
        if (on && !has) {
          var b = document.createElement('button');
          b.type = 'button'; b.className = OPEN; b.title = 'Abrir ficha de la tarea'; b.textContent = '✎';
          cell.appendChild(b);
        } else if (!on && has) { has.remove(); }
      }
      ensureBaselineBtn();
    } catch (err) {}
  }

  /* ===================== B) LÍNEA BASE ===================== */
  function fmt(d) { if (!d) return '—'; var p = String(d).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d; }
  function diffDays(a, b) { if (!a || !b) return null; var x = new Date(a), y = new Date(b); return Math.round((x - y) / 86400000); }

  function ensureBaselineBtn() {
    if (document.getElementById('p360-bl-btn')) return;
    if (!document.querySelector('.task-row')) return;         // solo con un proyecto abierto
    var b = document.createElement('button');
    b.id = 'p360-bl-btn'; b.type = 'button'; b.textContent = '📊 Línea base';
    b.addEventListener('click', openBaselinePanel);
    document.body.appendChild(b);
  }

  function overlay() {
    var o = document.getElementById('p360-bl-ov');
    if (o) return o;
    o = document.createElement('div'); o.id = 'p360-bl-ov';
    o.addEventListener('click', function (e) { if (e.target === o) o.remove(); });
    document.body.appendChild(o);
    return o;
  }

  async function openBaselinePanel() {
    var o = overlay();
    o.innerHTML = '<div class="p360-bl-card"><div class="p360-bl-h">Línea base <span class="p360-bl-x">&times;</span></div><div class="p360-bl-body">Cargando…</div></div>';
    o.querySelector('.p360-bl-x').addEventListener('click', function () { o.remove(); });
    var body = o.querySelector('.p360-bl-body');
    try {
      var sb = window._p360sb; if (!sb) { body.textContent = 'No encuentro el cliente de datos.'; return; }
      var row = document.querySelector('.task-row'); var tid = row && taskIdOf(row);
      if (!tid) { body.textContent = 'Abrí un proyecto (vista Cuadrícula) para usar la línea base.'; return; }
      var one = await sb.from('tasks').select('project_id').eq('id', tid).single();
      if (one.error || !one.data) { body.textContent = 'No pude identificar el proyecto.'; return; }
      var pid = one.data.project_id;
      var proj = await sb.from('projects').select('name').eq('id', pid).single();
      var tasks = await sb.from('tasks').select('id,name,start_date,end_date,order_index').eq('project_id', pid);
      var bls = await sb.from('project_baselines').select('*').eq('project_id', pid).order('created_at', { ascending: false });
      renderPanel(body, pid, (proj.data && proj.data.name) || 'Proyecto', tasks.data || [], (bls.data || []));
    } catch (err) { body.textContent = 'Error cargando la línea base: ' + err; }
  }

  function renderPanel(body, pid, projName, tasks, baselines) {
    var head = '<div class="p360-bl-proj">' + projName + '</div>';
    if (!baselines.length) {
      body.innerHTML = head + '<p>Este proyecto todavía no tiene línea base.</p>' +
        '<p class="p360-bl-note">Al crearla, se congela el cronograma actual como "plan". Desde ahí, cuando muevas el fin o la duración de una tarea, vas a ver la variación.</p>' +
        '<button class="p360-bl-create">Crear línea base</button>';
      body.querySelector('.p360-bl-create').addEventListener('click', function () { createBaseline(pid, 1, body); });
      return;
    }
    var bl = baselines[0];
    var snap = Array.isArray(bl.snapshot) ? bl.snapshot : [];
    var baseEnd = {}; var maxBase = null;
    snap.forEach(function (s) { baseEnd[s.task_id] = s.end_date; if (s.end_date && (!maxBase || s.end_date > maxBase)) maxBase = s.end_date; });
    var maxCur = null, rows = [];
    tasks.forEach(function (t) {
      if (t.end_date && (!maxCur || t.end_date > maxCur)) maxCur = t.end_date;
      var be = baseEnd[t.id];
      if (be != null) { var v = diffDays(t.end_date, be); if (v && v !== 0) rows.push({ n: t.name, be: be, ce: t.end_date, v: v }); }
    });
    rows.sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); });
    var proj = diffDays(maxCur, maxBase) || 0;
    var msg = proj > 0 ? ('Su plan lleva un retraso de <b>' + proj + ' día' + (proj === 1 ? '' : 's') + '</b>')
      : proj < 0 ? ('Su plan está adelantado <b>' + (-proj) + ' día' + (proj === -1 ? '' : 's') + '</b>')
        : 'Su plan está <b>en fecha</b>';
    var cmp = 'En comparación con <b>' + (bl.name || 'Línea base') + '</b> (' + fmt(bl.created_at) + ')';
    var tbl = '';
    if (rows.length) {
      tbl = '<table class="p360-bl-tbl"><thead><tr><th>Tarea</th><th>Fin previsto</th><th>Fin actual</th><th>Variación</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var cls = r.v > 0 ? 'p360-bl-late' : 'p360-bl-early';
          var sign = r.v > 0 ? '↑ ' : '↓ ';
          return '<tr><td>' + esc(r.n) + '</td><td>' + fmt(r.be) + '</td><td>' + fmt(r.ce) + '</td><td class="' + cls + '">' + sign + Math.abs(r.v) + ' d</td></tr>';
        }).join('') + '</tbody></table>';
    } else {
      tbl = '<p class="p360-bl-note">Ninguna tarea se movió respecto de esta línea base todavía.</p>';
    }
    body.innerHTML = head +
      '<div class="p360-bl-cmp">' + cmp + '</div>' +
      '<div class="p360-bl-big">' + msg + '</div>' +
      '<div class="p360-bl-sub">Fin previsto ' + fmt(maxBase) + ' · Fin actual ' + fmt(maxCur) + '</div>' +
      tbl +
      '<button class="p360-bl-create">Crear nueva línea base</button>';
    body.querySelector('.p360-bl-create').addEventListener('click', function () { createBaseline(pid, baselines.length + 1, body); });
  }

  async function createBaseline(pid, n, body) {
    var name = window.prompt('Nombre de la línea base:', 'Línea base ' + n);
    if (name == null) return;
    body.innerHTML = '<div class="p360-bl-body">Creando…</div>';
    try {
      var res = await window._p360sb.rpc('create_baseline', { p_project_id: pid, p_name: name || ('Línea base ' + n) });
      if (res && res.error) { body.innerHTML = 'No se pudo crear: ' + res.error.message; return; }
      openBaselinePanel();   // recargar
    } catch (err) { body.innerHTML = 'Error creando la línea base: ' + err; }
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  /* ===================== estilos ===================== */
  function injectStyle() {
    if (document.getElementById('p360-clicks1-style')) return;
    var s = document.createElement('style'); s.id = 'p360-clicks1-style';
    s.textContent =
      '.' + OPEN + '{margin-left:auto;flex:0 0 auto;border:none;background:transparent;cursor:pointer;font-size:12px;line-height:1;padding:0 4px;color:var(--text-3);opacity:.55;}' +
      '.' + OPEN + ':hover{opacity:1;color:var(--brand);}.task-row:hover .' + OPEN + '{opacity:.85;}' +
      '.p360-name-input{flex:1;min-width:0;font:inherit;color:inherit;background:var(--surface-1,#fff);border:1px solid var(--brand,#f60);border-radius:4px;padding:1px 5px;outline:none;}' +
      '#p360-bl-btn{position:fixed;right:18px;bottom:18px;z-index:9998;background:var(--brand,#f60);color:#fff;border:none;border-radius:22px;padding:10px 16px;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.2);}' +
      '#p360-bl-btn:hover{filter:brightness(1.05);}' +
      '#p360-bl-ov{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.35);display:flex;justify-content:flex-end;}' +
      '.p360-bl-card{width:420px;max-width:92vw;height:100%;background:var(--surface-0,#fff);color:var(--text-1,#111);box-shadow:-4px 0 24px rgba(0,0,0,.2);display:flex;flex-direction:column;font:14px system-ui,sans-serif;}' +
      '.p360-bl-h{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;font-size:18px;font-weight:700;border-bottom:1px solid var(--border,#eee);}' +
      '.p360-bl-x{cursor:pointer;font-size:22px;line-height:1;color:var(--text-3,#888);}' +
      '.p360-bl-body{padding:16px 18px;overflow:auto;}' +
      '.p360-bl-proj{font-weight:600;color:var(--text-2,#555);margin-bottom:8px;}' +
      '.p360-bl-cmp{font-size:12px;color:var(--text-3,#888);border:1px solid var(--border,#eee);border-radius:8px;padding:8px 10px;}' +
      '.p360-bl-big{font-size:20px;margin:14px 0 2px;}.p360-bl-big b{color:var(--brand,#f60);}' +
      '.p360-bl-sub{font-size:12px;color:var(--text-3,#888);margin-bottom:12px;}' +
      '.p360-bl-note{font-size:12px;color:var(--text-3,#888);}' +
      '.p360-bl-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px;}' +
      '.p360-bl-tbl th,.p360-bl-tbl td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--border,#f0f0f0);}' +
      '.p360-bl-tbl th{color:var(--text-3,#888);font-weight:600;}' +
      '.p360-bl-late{color:#c0392b;font-weight:600;}.p360-bl-early{color:#1e8449;font-weight:600;}' +
      '.p360-bl-create{margin-top:16px;background:var(--brand,#f60);color:#fff;border:none;border-radius:8px;padding:10px 14px;font-weight:600;cursor:pointer;}';
    (document.head || document.documentElement).appendChild(s);
  }

  function init() {
    injectStyle(); syncButtons();
    try { new MutationObserver(scheduleSync).observe(document.getElementById('root') || document.body, { childList: true, subtree: true }); } catch (err) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
