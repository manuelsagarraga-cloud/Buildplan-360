/*
 * fix-cliente-v1.js  —  BuildPlan360 / Pipeline360
 * ---------------------------------------------------------------------------
 * PROBLEMAS QUE RESUELVE
 *
 * 1. CLIENTE COMPARTIDO (window._p360sb)
 *    Tras recompilarse el bundle, el mecanismo que buscaba el cliente Supabase
 *    en los fibers de React deja de funcionar. Este parche crea un cliente
 *    independiente que NO depende de la estructura interna de React.
 *
 * 2. KEEPALIVE DE CONEXION ("Conectando..." recurrente)
 *    Los routers domésticos matan conexiones WebSocket inactivas cada ~30s.
 *    Supabase Realtime usa WebSocket; cuando cae, el bundle pausa/cancela
 *    escrituras en curso (import XML, asignar masivo). Este parche envía un
 *    ping liviano cada 20s para mantener la conexión viva durante operaciones
 *    largas.
 *
 * INSTALACION
 *  1) Copiar este archivo a /assets/ en el repo.
 *  2) Agregar en index.html Y en 404.html, dentro del <head>,
 *     ANTES del <script type="module"> del bundle:
 *       <script src="./assets/fix-cliente-v1.js"></script>
 *  3) Commit + push. Recargar con Ctrl+F5.
 *
 * VERIFICACION (consola, app logueada):
 *     typeof window._p360sb   // debe dar "object"
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  var REF     = "qpqoqrroplkyyelkqnxo";
  var SB_URL  = "https://" + REF + ".supabase.co";
  var anonKey = null;
  var origFetch = window.fetch;
  var keepaliveTimer = null;

  // ── 1) Interceptor de fetch: captura la anon key de las requests del bundle ──
  window.fetch = function () {
    try {
      var init    = arguments[1];
      var input   = arguments[0];
      var headers = (init && init.headers) || (input && input.headers);
      if (headers && !anonKey) {
        var get = function (h, k) {
          return h && h.get ? h.get(k) : (h ? (h[k] || h[k.toLowerCase()]) : null);
        };
        var k = get(headers, "apikey") || get(headers, "apiKey");
        if (k && k.length > 20) anonKey = k;
      }
    } catch (e) { /* nunca romper el fetch original */ }
    return origFetch.apply(this, arguments);
  };

  // ── 2) Keepalive: ping liviano cada 20s para que el router no mate el WebSocket ──
  function startKeepalive() {
    if (keepaliveTimer) return;
    keepaliveTimer = setInterval(function () {
      if (!anonKey) return;
      origFetch(SB_URL + "/rest/v1/system_settings?select=key&limit=1", {
        headers: {
          "apikey":        anonKey,
          "Authorization": "Bearer " + anonKey,
          "Content-Type":  "application/json"
        }
      }).catch(function () { /* silencioso — es solo un ping */ });
    }, 20000); // cada 20 segundos
    console.log("[fix-cliente] Keepalive activo (ping cada 20s). El 'Conectando...' deberia desaparecer.");
  }

  // ── 3) Cargar supabase-js desde CDN (UMD) ──
  function loadSupabaseJS() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) {
        return resolve(window.supabase);
      }
      var s    = document.createElement("script");
      s.src    = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
      s.onload  = function () { resolve(window.supabase); };
      s.onerror = function () { reject(new Error("No se pudo cargar supabase-js desde CDN")); };
      document.head.appendChild(s);
    });
  }

  // ── 4) Detectar la storageKey de sesión para heredar el login actual ──
  function detectStorageKey() {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (/^sb-.*-auth-token$/.test(k)) return k;
    }
    return "sb-" + REF + "-auth-token";
  }

  // ── 5) Construir window._p360sb en cuanto tengamos la anon key ──
  function buildClient() {
    loadSupabaseJS().then(function (sb) {
      var client = sb.createClient(SB_URL, anonKey, {
        auth: {
          storageKey:         detectStorageKey(),
          persistSession:     true,
          autoRefreshToken:   false,   // el bundle ya refresca; evitamos conflicto
          detectSessionInUrl: false
        }
      });

      window._p360sb = client;

      // Helper: garantizar sesión antes de escribir
      window._p360ensureSession = function () {
        return client.auth.getSession();
      };

      // Señal para parches que esperan el cliente
      try { window.dispatchEvent(new Event("p360sb-ready")); } catch (e) {}

      // Ya no necesitamos el interceptor de fetch
      window.fetch = origFetch;

      console.log("[fix-cliente] window._p360sb LISTO. Escrituras de parches activas.");
    }).catch(function (err) {
      console.error("[fix-cliente] Error creando cliente:", err);
      window.fetch = origFetch;
    });
  }

  // ── 6) Init: esperar la anon key (la app la emite en sus primeras requests) ──
  function init() {
    // Arrancar keepalive inmediatamente (no necesita anon key para el timer)
    startKeepalive();

    var tries     = 0;
    var waitTimer = setInterval(function () {
      tries++;
      if (anonKey) {
        clearInterval(waitTimer);
        buildClient();
      } else if (tries > 150) { // ~15s de espera máxima
        clearInterval(waitTimer);
        window.fetch = origFetch;
        console.warn("[fix-cliente] No se capturo la anon key en 15s. " +
          "Recarga la pagina logueado para activar el cliente compartido.");
      }
    }, 100);
  }

  init();

})();
