/**
 * Pipeline360 — p360-fixes-v4.js
 *
 *  Ordena el comportamiento del clic en la vista base del Gantt:
 *    · Clic simple  → SELECCIONAR la fila (resaltado). No abre modal ni editor.
 *    · Doble clic   → EDITAR inline. Ya está cableado en el núcleo vía onDoubleClick
 *                     (_p360inlineEditName / _p360inlineEdit / _p360inlineEditResp / *Option).
 *                     Este parche no lo toca; solo evita que el clic simple se interponga.
 *    · Botón ✎      → ABRIR la ficha completa de la tarea (comportamiento nativo, sin cambios).
 *
 *  No modifica el bundle. Neutraliza el "clic simple = editar" que intentaba
 *  p360-ux-suite.js (cancelando su timer) y frena, de forma defensiva y en fase de
 *  captura, cualquier apertura de modal por clic simple sobre la fila — salvo los
 *  controles nativos (✎, checkbox, expandir, enlaces), que se dejan pasar intactos.
 *
 *  Cargar SIEMPRE ÚLTIMO (después de patch-v488167.js, calendario-v1.js y
 *  p360-ux-suite.js), tanto en index.html como en 404.html.
 */
(function () {
  'use strict';
  if (window._p360fixes4) return;
  window._p360fixes4 = true;

  var ACTIVE = 'p360-row-active';

  // Controles nativos de la fila que deben conservar su comportamiento:
  //  button  = ✎ (abrir ficha)   input = checkbox de selección
  //  .expand-toggle = ▸/▾         a / .ph-link-chip = enlaces
  var PASS = 'button, a, input, select, textarea, .expand-toggle, .ph-link-chip';

  /* ── Resaltado de la fila seleccionada ── */
  function injectStyle() {
    if (document.getElementById('p360-fixes4-style')) return;
    var s = document.createElement('style');
    s.id = 'p360-fixes4-style';
    s.textContent =
      '.task-row.' + ACTIVE + '{position:relative;background:rgba(255,138,0,.06);}' +
      '@supports (background:color-mix(in srgb,red,blue)){' +
      '.task-row.' + ACTIVE + '{background:color-mix(in srgb,var(--brand-orange) 8%,transparent);}}' +
      '.task-row.' + ACTIVE + '::before{content:"";position:absolute;left:0;top:0;bottom:0;' +
      'width:3px;background:var(--brand-orange);z-index:5;pointer-events:none;}';
    (document.head || document.documentElement).appendChild(s);
  }

  function clearUxTimer(cell) {
    if (cell && cell._clickTimer) { clearTimeout(cell._clickTimer); cell._clickTimer = null; }
  }

  function selectRow(row) {
    var prev = document.querySelectorAll('.task-row.' + ACTIVE);
    for (var i = 0; i < prev.length; i++) {
      if (prev[i] !== row) prev[i].classList.remove(ACTIVE);
    }
    row.classList.add(ACTIVE);
  }

  /* ── Clic simple = seleccionar (captura: gana a cualquier otro handler) ── */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var row = t.closest('.task-row');
    if (!row) return;

    // Dejar intactos los controles nativos (✎, checkbox, expandir, enlaces).
    if (t.closest(PASS)) return;

    // Cancelar el "clic simple = editar" de p360-ux-suite.js. Lo hacemos ahora y
    // también en el próximo tick, por si su listener se registró/ejecuta después.
    var cie = t.closest('.cell-ie');
    clearUxTimer(cie);
    setTimeout(function () { clearUxTimer(cie); }, 0);

    // Seleccionar esta fila.
    selectRow(row);

    // Defensa: que un clic simple sobre la fila no dispare el modal (ni ahora ni
    // por parches futuros). El evento "dblclick" es independiente y NO se ve
    // afectado, así que la edición inline sigue funcionando con doble clic.
    e.stopPropagation();
  }, true);

  /* ── El doble clic no se intercepta: el núcleo ya invoca los editores inline. ── */

  function init() { injectStyle(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
