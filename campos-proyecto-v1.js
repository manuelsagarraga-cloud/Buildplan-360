/*
 * campos-proyecto-v1.js  —  BuildPlan360 / Pipeline360
 * ---------------------------------------------------------------------------
 * Agrega dos campos editables en el modal "Editar proyecto":
 *   - Ciudad (texto libre)
 *   - M² de obra (número)
 *
 * Columnas requeridas en la tabla projects (ya creadas vía migración):
 *   ciudad   TEXT
 *   m2_obra  NUMERIC(10,2)
 *
 * INSTALACION
 *  1) Copiar a /assets/ del repo (también via workflow: agregar al cp del deploy.yml)
 *  2) Agregar en index.html Y 404.html:
 *       <script src="./assets/campos-proyecto-v1.js"></script>
 *  3) Commit + push.
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  var PATCH     = "campos-proyecto-v1";
  var INJECTED  = "data-p360cp-injected";

  // ── Obtener cliente Supabase (espera a que fix-cliente-v1 lo cree) ──────────
  function getClient(cb) {
    if (window._p360sb) return cb(window._p360sb);
    window.addEventListener("p360sb-ready", function () { cb(window._p360sb); }, { once: true });
    // Fallback: polling por si el evento ya disparó
    var t = 0;
    var poll = setInterval(function () {
      if (window._p360sb) { clearInterval(poll); cb(window._p360sb); }
      if (++t > 50) clearInterval(poll);
    }, 200);
  }

  // ── Detectar el ID del proyecto actual ──────────────────────────────────────
  // El SPA actualiza window.location al navegar. Buscamos un UUID en la URL.
  function getProjectIdFromUrl() {
    var full = window.location.href + " " + window.location.hash;
    var m = full.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m ? m[0] : null;
  }

  // Fallback: recorrer fibers de React buscando un prop "id" con formato UUID
  function getProjectIdFromFibers() {
    var candidates = document.querySelectorAll(
      '[class*="project-header"],[class*="project-title"],[class*="project-detail"],h1,h2,.modal-title'
    );
    var uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var fiberKey = Object.keys(el).find(function (k) {
        return k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance");
      });
      if (!fiberKey) continue;
      var node = el[fiberKey];
      for (var d = 0; d < 40 && node; d++) {
        var props = node.memoizedProps || node.pendingProps || {};
        var id = (props.projectId) || (props.project_id) ||
                 (props.project && props.project.id) ||
                 (uuidRe.test(props.id) ? props.id : null);
        if (id && uuidRe.test(id)) return id;
        node = node.return;
      }
    }
    return null;
  }

  function getProjectId() {
    return getProjectIdFromUrl() || getProjectIdFromFibers();
  }

  // ── Inyectar los campos en el modal ─────────────────────────────────────────
  function injectFields(overlay, projectData) {
    // Evitar doble inyección
    if (overlay.querySelector("[" + INJECTED + "]")) return;

    var modalBody = overlay.querySelector(".modal-body");
    if (!modalBody) return;

    var hr = modalBody.querySelector("hr");
    if (!hr) return;

    // Crear fila Ciudad + M²
    var row = document.createElement("div");
    row.className = "form-row";
    row.setAttribute(INJECTED, "1");
    row.innerHTML =
      '<div class="form-group">' +
        '<label class="form-label">Ciudad</label>' +
        '<input type="text" class="form-control" data-p360-campo="ciudad"' +
          ' placeholder="Ej: Córdoba"' +
          ' value="' + escapeAttr(projectData.ciudad || "") + '">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">M² de obra</label>' +
        '<input type="number" class="form-control" data-p360-campo="m2_obra"' +
          ' placeholder="Ej: 250" min="0" step="0.01"' +
          ' value="' + escapeAttr(projectData.m2_obra != null ? String(projectData.m2_obra) : "") + '">' +
      '</div>';

    // Insertar antes del <hr> (entre los selects y "Campos personalizados")
    modalBody.insertBefore(row, hr);

    // Interceptar el botón Guardar del bundle para co-guardar nuestros campos
    var saveBtn = overlay.querySelector(".modal-footer .btn-primary");
    if (saveBtn && !saveBtn._p360cpPatched) {
      saveBtn._p360cpPatched = true;
      saveBtn.addEventListener("click", function () {
        var ciudadEl = overlay.querySelector('[data-p360-campo="ciudad"]');
        var m2El     = overlay.querySelector('[data-p360-campo="m2_obra"]');
        if (!ciudadEl || !m2El) return;

        var ciudad = ciudadEl.value.trim() || null;
        var m2Raw  = m2El.value.trim();
        var m2Val  = m2Raw !== "" ? parseFloat(m2Raw) : null;
        var pid    = projectData.id;

        if (!pid) {
          console.warn("[" + PATCH + "] No se encontró el ID del proyecto — campos no guardados.");
          return;
        }

        getClient(function (sb) {
          sb.from("projects")
            .update({ ciudad: ciudad, m2_obra: m2Val })
            .eq("id", pid)
            .then(function (res) {
              if (res.error) {
                console.error("[" + PATCH + "] Error al guardar:", res.error);
              } else {
                console.log("[" + PATCH + "] Ciudad y M² guardados para proyecto " + pid);
              }
            });
        });
      }, true); // capture: true para que corra antes del handler del bundle
    }
  }

  function escapeAttr(str) {
    return String(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ── Detectar apertura del modal "Editar proyecto" ───────────────────────────
  function handleModal(overlay) {
    var titleEl = overlay.querySelector(".modal-title");
    if (!titleEl || titleEl.textContent.trim() !== "Editar proyecto") return;

    var pid = getProjectId();

    if (!pid) {
      // Sin ID: inyectar igual pero sin valores ni guardar
      injectFields(overlay, {});
      console.warn("[" + PATCH + "] No se pudo detectar el ID del proyecto. Los campos se muestran pero no se guardarán.");
      return;
    }

    getClient(function (sb) {
      sb.from("projects")
        .select("id, ciudad, m2_obra")
        .eq("id", pid)
        .then(function (res) {
          var data = (res.data && res.data[0]) || { id: pid };
          injectFields(overlay, data);
        });
    });
  }

  // MutationObserver sobre body
  var obs = new MutationObserver(function (mutations) {
    mutations.forEach(function (mut) {
      mut.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.classList && node.classList.contains("modal-overlay")) {
          handleModal(node);
        } else if (node.querySelector) {
          var inner = node.querySelector(".modal-overlay");
          if (inner) handleModal(inner);
        }
      });
    });
  });

  obs.observe(document.body, { childList: true, subtree: true });
  console.log("[" + PATCH + "] Activo — monitoreando modal de edición de proyecto.");

})();

/* ─────────────────────────────────────────────────────────────────────────────
 * EXTENSIÓN: mostrar Ciudad, M² y Zona en el encabezado del proyecto
 * y agregar Zona al formulario de edición.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';
  var ATTR = 'data-p360-header-injected';

  function getClient(cb) {
    if (window._p360sb) return cb(window._p360sb);
    window.addEventListener('p360sb-ready', function () { cb(window._p360sb); }, { once: true });
  }

  function getProjectIdFromUrl() {
    var full = window.location.href + ' ' + window.location.hash;
    var m = full.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m ? m[0] : null;
  }

  // Inyectar fila de campos en el header del proyecto
  function injectHeaderFields(data) {
    // Buscar la zona con texto "Provincia" o "Ciclo" en el header del proyecto
    var rows = document.querySelectorAll('.project-meta, .project-info-row, [class*="project-detail"]');
    // Fallback: buscar el elemento que contiene "Córdoba" o valor de provincia
    var anchors = document.querySelectorAll('.project-province, [class*="province"], [class*="ciclo"]');

    // Buscar el contenedor principal del header por estructura
    var header = document.querySelector('.project-header, [class*="project-header"]');
    if (!header) return;
    if (header.querySelector('[' + ATTR + ']')) return;

    var chip = document.createElement('div');
    chip.setAttribute(ATTR, '1');
    chip.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;font-size:13px;color:var(--text-2,#666);';

    if (data.ciudad) {
      chip.innerHTML += '<span>🏙️ <strong>Ciudad:</strong> ' + data.ciudad + '</span>';
    }
    if (data.m2_obra != null) {
      chip.innerHTML += '<span>📐 <strong>M²:</strong> ' + Number(data.m2_obra).toLocaleString('es-AR') + ' m²</span>';
    }
    if (data.zona_nombre) {
      chip.innerHTML += '<span>📍 <strong>Zona:</strong> ' + data.zona_nombre + '</span>';
    }

    if (!chip.innerHTML) return; // nada que mostrar
    header.appendChild(chip);
  }

  // Agregar Zona al modal de edición
  function injectZonaField(overlay, projectData) {
    if (overlay.querySelector('[data-p360-campo="zona_id"]')) return;
    var modalBody = overlay.querySelector('.modal-body');
    if (!modalBody) return;
    var hr = modalBody.querySelector('hr');
    if (!hr) return;

    getClient(function (sb) {
      sb.from('zonas').select('id, nombre').eq('activo', true)
        .order('nombre', { ascending: true })
        .then(function (r) {
          var zonas = r.data || [];
          var row = document.createElement('div');
          row.className = 'form-row';
          var opts = '<option value="">— Sin zona —</option>';
          zonas.forEach(function (z) {
            var sel = (projectData.zona_id === z.id) ? ' selected' : '';
            opts += '<option value="' + z.id + '"' + sel + '>' + z.nombre + '</option>';
          });
          row.innerHTML =
            '<div class="form-group" style="grid-column:1/-1">' +
              '<label class="form-label">Zona</label>' +
              '<select class="form-control" data-p360-campo="zona_id">' + opts + '</select>' +
            '</div>';
          modalBody.insertBefore(row, hr);

          // Interceptar Guardar para zona_id
          var saveBtn = overlay.querySelector('.modal-footer .btn-primary');
          if (saveBtn && !saveBtn._p360zonaPatched) {
            saveBtn._p360zonaPatched = true;
            saveBtn.addEventListener('click', function () {
              var zonaEl = overlay.querySelector('[data-p360-campo="zona_id"]');
              if (!zonaEl || !projectData.id) return;
              var zonaVal = zonaEl.value || null;
              getClient(function (sb2) {
                sb2.from('projects').update({ zona_id: zonaVal }).eq('id', projectData.id)
                  .then(function (res) {
                    if (res.error) console.error('[campos-proyecto] zona_id error:', res.error);
                    else console.log('[campos-proyecto] zona_id guardado.');
                  });
              });
            }, true);
          }
        });
    });
  }

  // Cargar datos del proyecto e inyectar en header
  function tryInjectHeader() {
    var pid = getProjectIdFromUrl();
    if (!pid) return;
    var header = document.querySelector('.project-header, [class*="project-header"]');
    if (!header) return;
    if (header.querySelector('[' + ATTR + ']')) return;

    getClient(function (sb) {
      sb.from('projects')
        .select('id, ciudad, m2_obra, zona_id, zonas(nombre)')
        .eq('id', pid)
        .then(function (r) {
          var d = r.data && r.data[0];
          if (!d) return;
          injectHeaderFields({
            ciudad:     d.ciudad,
            m2_obra:    d.m2_obra,
            zona_nombre: d.zonas ? d.zonas.nombre : null
          });
        });
    });
  }

  // Escuchar apertura del modal de edición para agregar Zona
  var obsModal = new MutationObserver(function (mutations) {
    mutations.forEach(function (mut) {
      mut.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        var overlay = node.classList && node.classList.contains('modal-overlay')
          ? node : node.querySelector && node.querySelector('.modal-overlay');
        if (!overlay) return;
        var title = overlay.querySelector('.modal-title');
        if (!title || title.textContent.trim() !== 'Editar proyecto') return;
        var pid = getProjectIdFromUrl();
        if (!pid) return;
        getClient(function (sb) {
          sb.from('projects').select('id, zona_id').eq('id', pid)
            .then(function (r) {
              injectZonaField(overlay, (r.data && r.data[0]) || { id: pid });
            });
        });
      });
    });
  });
  obsModal.observe(document.body, { childList: true, subtree: true });

  // Detectar navegación SPA y reinyectar header
  var lastUrl = location.href;
  setInterval(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(tryInjectHeader, 600);
    }
  }, 500);

  setTimeout(tryInjectHeader, 1000);

})();
