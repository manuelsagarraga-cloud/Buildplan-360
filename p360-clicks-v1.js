/**
 * Pipeline360 v2 — p360-clicks-v1.js  (v2.0 — solo Línea Base)
 *
 *  Panel "📊 Línea base": crear línea base del proyecto y ver variación.
 *  El manejo de clic, ✎ y edición inline ya están en la fuente (GanttView.jsx).
 */
(function () {
  'use strict';
  if (window._p360clicks1) return;
  window._p360clicks1 = true;

  var raf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function (f) { return setTimeout(f, 50); };

  /* ===================== LÍNEA BASE ===================== */
  function fmt(d) { if (!d) return '—'; var p = String(d).slice(0, 10).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d; }
  function diffDays(a, b) { if (!a || !b) return null; var x = new Date(a), y = new Date(b); return Math.round((x - y) / 86400000); }

  function taskIdOf(row) {
    try {
      var key = Object.keys(row).find(function (k) { return k.indexOf('__reactFiber$') === 0; });
      var f = key ? row[key] : null;
      return f && f.key != null ? f.key : null;
    } catch (e) { return null; }
  }

  var pending = false;
  function scheduleSync() { if (pending) return; pending = true; raf(function () { pending = false; ensureBaselineBtn(); }); }

  function ensureBaselineBtn() {
    if (document.getElementById('p360-bl-btn')) return;
    if (!document.querySelector('.task-row')) return;
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
      var one = await sb.from('tasks').select('project_id').eq('id', tid);
      if (one.error || !one.data || !one.data[0]) { body.textContent = 'No pude identificar el proyecto.'; return; }
      var pid = one.data[0].project_id;
      var proj = await sb.from('projects').select('name').eq('id', pid);
      var projName = (proj.data && proj.data[0] && proj.data[0].name) || 'Proyecto';
      var tasks = await sb.from('tasks').select('id,name,start_date,end_date,order_index').eq('project_id', pid);
      var bls = await sb.from('project_baselines').select('*').eq('project_id', pid).order('created_at', { ascending: false });
      renderPanel(body, pid, projName, tasks.data || [], (bls.data || []));
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
      openBaselinePanel();
    } catch (err) { body.innerHTML = 'Error creando la línea base: ' + err; }
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  /* ===================== estilos ===================== */
  function injectStyle() {
    if (document.getElementById('p360-bl-style')) return;
    var s = document.createElement('style'); s.id = 'p360-bl-style';
    s.textContent =
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
    injectStyle(); ensureBaselineBtn();
    try { new MutationObserver(scheduleSync).observe(document.getElementById('root') || document.body, { childList: true, subtree: true }); } catch (err) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
