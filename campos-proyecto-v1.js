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
