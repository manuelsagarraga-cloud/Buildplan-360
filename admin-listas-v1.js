/*
 * admin-listas-v1.js  —  BuildPlan360 / Pipeline360
 * ─────────────────────────────────────────────────────────────────────────────
 * Panel de administración para Contratistas y Zonas.
 * Agrega un ítem "Listas" en el sidebar bajo Administración.
 * Permite crear, renombrar y activar/desactivar contratistas y zonas
 * sin necesidad de crear cuentas de usuario.
 *
 * INSTALACION
 *  1) Subir admin-listas-v1.js a la raíz del repo.
 *  2) Agregar en index.html y 404.html:
 *       <script src="./assets/admin-listas-v1.js"></script>
 *  3) Agregar en deploy.yml:
 *       cp admin-listas-v1.js dist/assets/admin-listas-v1.js
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';
  var PATCH   = 'admin-listas-v1';
  var PANEL_ID = 'p360-listas-panel';

  // ── Esperar cliente ────────────────────────────────────────────────────────
  function getClient(cb) {
    if (window._p360sb) return cb(window._p360sb);
    window.addEventListener('p360sb-ready', function () { cb(window._p360sb); }, { once: true });
    var t = 0, poll = setInterval(function () {
      if (window._p360sb) { clearInterval(poll); cb(window._p360sb); }
      if (++t > 50) clearInterval(poll);
    }, 200);
  }

  // ── Obtener company_id ─────────────────────────────────────────────────────
  function getCompanyId(cb) {
    getClient(function (sb) {
      sb.rpc('get_my_company_id', {}).then(function (r) { cb(r.data); });
    });
  }

  // ── Estilos ────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('p360-listas-styles')) return;
    var s = document.createElement('style');
    s.id  = 'p360-listas-styles';
    s.textContent = [
      '#' + PANEL_ID + '{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9000;',
        'background:var(--bg-1,#f5f6fa);display:flex;flex-direction:column;overflow:hidden;}',
      '#p360-listas-header{background:var(--bg-2,#fff);border-bottom:1px solid var(--border,#e5e7eb);',
        'padding:16px 28px;display:flex;align-items:center;justify-content:space-between;}',
      '#p360-listas-header h2{margin:0;font-size:18px;font-weight:700;color:var(--text-1,#111);}',
      '#p360-listas-tabs{display:flex;gap:4px;padding:16px 28px 0;}',
      '.p360-tab{padding:8px 20px;border-radius:8px 8px 0 0;border:1px solid transparent;',
        'cursor:pointer;font-size:13px;font-weight:600;background:transparent;',
        'color:var(--text-2,#666);}',
      '.p360-tab.active{background:var(--bg-2,#fff);border-color:var(--border,#e5e7eb);',
        'border-bottom-color:var(--bg-2,#fff);color:var(--text-1,#111);}',
      '#p360-listas-body{flex:1;overflow-y:auto;padding:0 28px 28px;}',
      '.p360-lista-card{background:var(--bg-2,#fff);border:1px solid var(--border,#e5e7eb);',
        'border-radius:12px;padding:20px;margin-top:16px;}',
      '.p360-lista-row{display:flex;align-items:center;gap:8px;padding:8px 0;',
        'border-bottom:1px solid var(--border,#e5e7eb);}',
      '.p360-lista-row:last-child{border-bottom:none;}',
      '.p360-lista-nombre{flex:1;font-size:14px;color:var(--text-1,#111);}',
      '.p360-lista-inactivo{color:var(--text-3,#aaa);text-decoration:line-through;}',
      '.p360-btn-sm{padding:4px 10px;border-radius:6px;border:1px solid var(--border,#e5e7eb);',
        'cursor:pointer;font-size:12px;background:var(--bg-1,#f5f6fa);color:var(--text-1,#111);}',
      '.p360-btn-sm:hover{background:var(--bg-3,#eee);}',
      '.p360-btn-primary{background:var(--accent,#2563eb);color:#fff;border-color:var(--accent,#2563eb);}',
      '.p360-btn-primary:hover{opacity:.88;}',
      '.p360-add-row{display:flex;gap:8px;margin-top:16px;}',
      '.p360-input{flex:1;padding:8px 12px;border:1px solid var(--border,#e5e7eb);',
        'border-radius:8px;font-size:14px;background:var(--bg-2,#fff);color:var(--text-1,#111);}',
      '.p360-badge-ok{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;',
        'background:#dcfce7;color:#166534;}',
      '.p360-badge-off{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;',
        'background:#f3f4f6;color:#6b7280;}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Renderizar lista (contratistas o zonas) ────────────────────────────────
  function renderLista(tabla, titulo, items, companyId) {
    var html = '<div class="p360-lista-card">';
    html += '<div style="font-size:13px;font-weight:700;color:var(--text-2,#666);',
            'text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px;">' + titulo + '</div>';

    if (items.length === 0) {
      html += '<div style="font-size:13px;color:var(--text-3,#aaa);padding:8px 0;">',
              'Sin registros aún.</div>';
    } else {
      items.forEach(function (item) {
        html += '<div class="p360-lista-row" data-id="' + item.id + '">';
        html += '<span class="p360-lista-nombre ' + (item.activo ? '' : 'p360-lista-inactivo') + '">',
                item.nombre, '</span>';
        html += '<span class="' + (item.activo ? 'p360-badge-ok' : 'p360-badge-off') + '">',
                (item.activo ? 'Activo' : 'Inactivo'), '</span>';
        html += '<button class="p360-btn-sm p360-btn-toggle" data-id="' + item.id + '" ',
                'data-activo="' + item.activo + '">' + (item.activo ? 'Desactivar' : 'Activar') + '</button>';
        html += '<button class="p360-btn-sm p360-btn-rename" data-id="' + item.id + '" ',
                'data-nombre="' + item.nombre.replace(/"/g,'&quot;') + '">Renombrar</button>';
        html += '</div>';
      });
    }

    // Fila para agregar
    html += '</div>';
    html += '<div class="p360-add-row">';
    html += '<input class="p360-input" id="p360-new-' + tabla + '" ',
            'placeholder="Nombre del nuevo ' + titulo.toLowerCase().slice(0,-1) + '..." />';
    html += '<button class="p360-btn-sm p360-btn-primary p360-btn-add" data-tabla="' + tabla + '">',
            '+ Agregar</button>';
    html += '</div>';

    return html;
  }

  // ── Cargar y mostrar panel ─────────────────────────────────────────────────
  function loadPanel(tab) {
    tab = tab || 'contratistas';
    var panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    var body = document.getElementById('p360-listas-body');
    body.innerHTML = '<div style="padding:20px 0;color:var(--text-3,#aaa);font-size:13px;">Cargando…</div>';

    getClient(function (sb) {
      getCompanyId(function (companyId) {
        sb.from(tab).select('id, nombre, activo').eq('company_id', companyId)
          .order('nombre', { ascending: true })
          .then(function (r) {
            var items = r.data || [];
            var titulo = tab === 'contratistas' ? 'Contratistas' : 'Zonas';
            body.innerHTML = renderLista(tab, titulo, items, companyId);

            // Eventos
            body.querySelectorAll('.p360-btn-toggle').forEach(function (btn) {
              btn.addEventListener('click', function () {
                var id     = btn.dataset.id;
                var activo = btn.dataset.activo === 'true';
                sb.from(tab).update({ activo: !activo }).eq('id', id)
                  .then(function () { loadPanel(tab); });
              });
            });

            body.querySelectorAll('.p360-btn-rename').forEach(function (btn) {
              btn.addEventListener('click', function () {
                var nuevo = prompt('Nuevo nombre:', btn.dataset.nombre);
                if (!nuevo || !nuevo.trim()) return;
                sb.from(tab).update({ nombre: nuevo.trim() }).eq('id', btn.dataset.id)
                  .then(function () { loadPanel(tab); });
              });
            });

            body.querySelectorAll('.p360-btn-add').forEach(function (btn) {
              btn.addEventListener('click', function () {
                var input  = document.getElementById('p360-new-' + tab);
                var nombre = input ? input.value.trim() : '';
                if (!nombre) return;
                sb.from(tab).insert({ nombre: nombre, company_id: companyId, activo: true })
                  .then(function (r) {
                    if (r.error) { alert('Error: ' + r.error.message); return; }
                    loadPanel(tab);
                  });
              });
              // Enter en el input
              var input = document.getElementById('p360-new-' + tab);
              if (input) input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') btn.click();
              });
            });
          });
      });
    });
  }

  // ── Crear panel ────────────────────────────────────────────────────────────
  function openPanel() {
    if (document.getElementById(PANEL_ID)) return;
    injectStyles();

    var panel = document.createElement('div');
    panel.id  = PANEL_ID;
    panel.innerHTML = [
      '<div id="p360-listas-header">',
        '<h2>⚙️ Listas de referencia</h2>',
        '<button class="btn" id="p360-listas-close">✕ Cerrar</button>',
      '</div>',
      '<div id="p360-listas-tabs">',
        '<button class="p360-tab active" data-tab="contratistas">🏗️ Contratistas</button>',
        '<button class="p360-tab" data-tab="zonas">📍 Zonas</button>',
      '</div>',
      '<div id="p360-listas-body"></div>',
    ].join('');
    document.body.appendChild(panel);

    document.getElementById('p360-listas-close').addEventListener('click', function () {
      panel.remove();
    });

    panel.querySelectorAll('.p360-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        panel.querySelectorAll('.p360-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        loadPanel(tab.dataset.tab);
      });
    });

    loadPanel('contratistas');
  }

  // ── Inyectar ítem en el sidebar ────────────────────────────────────────────
  function injectNavItem(sidebarNav) {
    if (sidebarNav.querySelector('[data-p360-listas]')) return;

    var btn = document.createElement('button');
    btn.className = 'sidebar-item';
    btn.setAttribute('data-p360-listas', '1');
    btn.innerHTML = '<span class="sidebar-item-icon">⚙️</span>Listas';
    btn.addEventListener('click', openPanel);

    // Insertar después de "Papelera"
    var items = sidebarNav.querySelectorAll('.sidebar-item');
    var papelera = null;
    items.forEach(function (el) {
      if (el.textContent.trim().includes('Papelera')) papelera = el;
    });

    if (papelera && papelera.nextSibling) {
      sidebarNav.insertBefore(btn, papelera.nextSibling);
    } else if (papelera) {
      papelera.parentElement.appendChild(btn);
    } else {
      sidebarNav.appendChild(btn);
    }

    console.log('[' + PATCH + '] Ítem "Listas" inyectado en el sidebar.');
  }

  // ── MutationObserver — espera a que Papelera esté en el sidebar ──────────
  // El sidebar-nav aparece antes que sus ítems; esperamos hasta que
  // el botón "Papelera" exista para insertar después de él.
  function tryInject() {
    var sidebarNav = document.querySelector('.sidebar-nav');
    if (!sidebarNav) return false;
    if (sidebarNav.querySelector('[data-p360-listas]')) return true; // ya inyectado
    // Intentar inyectar (si Papelera no está aún, igual agrega al final)
    injectNavItem(sidebarNav);
    return !!sidebarNav.querySelector('[data-p360-listas]');
  }

  var obs = new MutationObserver(function () {
    if (tryInject()) obs.disconnect();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // Reintento por polling (por si el observer ya no alcanza)
  var retries = 0;
  var retryTimer = setInterval(function () {
    if (tryInject() || ++retries > 30) clearInterval(retryTimer);
  }, 300);

})();
