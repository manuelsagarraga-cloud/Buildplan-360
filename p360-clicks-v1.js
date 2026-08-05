/**
 * Pipeline360 v2 — p360-clicks-v1.js
 *
 *  Comportamiento del clic en la grilla del Gantt (vista base):
 *    · Clic simple en una fila → SELECCIONAR (marca el checkbox de la fila). NO abre la ficha.
 *    · Botón ✎ (visible en Modo Edición) → ABRIR la ficha completa de la tarea.
 *    · Los editores inline de celda (responsable, %, etc.) y el checkbox siguen igual.
 *
 *  Es un parche: corre sobre el bundle ya cargado, no toca el código fuente.
 *  Defensivo: si algo falla, no rompe la app (todo va en try/catch).
 *  Cargar DESPUÉS del bundle. Sumarlo en index.html y 404.html, y copiarlo en deploy.yml.
 */
(function () {
  'use strict';
  if (window._p360clicks1) return;
  window._p360clicks1 = true;

  var OPEN = 'p360-open-btn';
  var bypass = false;

  var raf = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : function (f) { return setTimeout(f, 50); };

  // ¿Modo Edición activo? El bundle muestra editores inline (select/input) solo en edición.
  function editModeOn() {
    return !!document.querySelector('.assignee-cell select, .inline-select, .inline-pct');
  }

  // Controles de la fila que conservan su comportamiento nativo.
  var PASS = 'input, select, textarea, a, button, .expand-toggle, .assignee-cell, .inline-select, .inline-pct';

  // ── Clic (captura): decide seleccionar vs abrir ficha, y le gana al onClick del bundle ──
  document.addEventListener('click', function (e) {
    try {
      var t = e.target;
      if (!t || !t.closest) return;

      // Clic en el ✎ → abrir la ficha (deja pasar un clic de fila hacia React)
      var btn = t.closest('.' + OPEN);
      if (btn) {
        e.stopPropagation();
        var r0 = btn.closest('.task-row');
        if (r0) { bypass = true; r0.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }
        return;
      }

      var row = t.closest('.task-row');
      if (!row) return;

      // Clic "de paso" originado por el ✎ → dejar que el bundle abra la ficha
      if (bypass) { bypass = false; return; }

      // Dejar intactos checkbox, expandir, editores inline y enlaces
      if (t.closest(PASS)) return;

      // Clic simple sobre la fila → SELECCIONAR (marcar checkbox) y NO abrir la ficha
      e.stopPropagation();
      var cb = row.querySelector('input[type="checkbox"]');
      if (cb) cb.click();
    } catch (err) { /* nunca romper la app */ }
  }, true);

  // ── Inyección del ✎ en cada fila (solo en Modo Edición) ──
  var pending = false;
  function scheduleSync() { if (pending) return; pending = true; raf(function () { pending = false; syncButtons(); }); }

  function syncButtons() {
    try {
      var on = editModeOn();
      var cells = document.querySelectorAll('.task-name-cell');
      for (var i = 0; i < cells.length; i++) {
        var cell = cells[i];
        var has = cell.querySelector('.' + OPEN);
        if (on && !has) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = OPEN;
          b.title = 'Abrir ficha de la tarea';
          b.textContent = '✎';
          cell.appendChild(b);
        } else if (!on && has) {
          has.remove();
        }
      }
    } catch (err) {}
  }

  function injectStyle() {
    if (document.getElementById('p360-clicks1-style')) return;
    var s = document.createElement('style');
    s.id = 'p360-clicks1-style';
    s.textContent =
      '.' + OPEN + '{margin-left:auto;flex:0 0 auto;border:none;background:transparent;cursor:pointer;' +
      'font-size:12px;line-height:1;padding:0 4px;color:var(--text-3);opacity:.55;}' +
      '.' + OPEN + ':hover{opacity:1;color:var(--brand);}' +
      '.task-row:hover .' + OPEN + '{opacity:.85;}';
    (document.head || document.documentElement).appendChild(s);
  }

  function init() {
    injectStyle();
    syncButtons();
    try {
      var host = document.getElementById('root') || document.body;
      new MutationObserver(scheduleSync).observe(host, { childList: true, subtree: true });
    } catch (err) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
