/*
 * fix-cliente-v1.js  —  BuildPlan360 / Pipeline360
 * ---------------------------------------------------------------------------
 * PROBLEMAS QUE RESUELVE
 *
 * 1. window._p360sb (cliente Supabase compartido)
 *    Lee la anon key directamente del bundle compilado (está hardcodeada ahí,
 *    es pública por diseño en apps Supabase). No intercepta fetch ni depende
 *    de la estructura interna de React. Sobrevive a recompilaciones del bundle.
 *
 * 2. Keepalive de conexión ("Conectando..." recurrente)
 *    Los routers domésticos matan WebSockets inactivos cada ~30s.
 *    Este parche hace un ping liviano cada 20s para mantener la conexión viva.
 *    Evita que el import masivo de tareas se interrumpa a mitad.
 *
 * INSTALACION
 *  1) Copiar este archivo a /assets/ en el repo.
 *  2) En index.html Y 404.html, dentro del <head>,
 *     ANTES del <script type="module"> del bundle:
 *       <script src="./assets/fix-cliente-v1.js"></script>
 *  3) Commit + push → recargar con Ctrl+F5.
 *
 * VERIFICACION (consola, app logueada):
 *     typeof window._p360sb   // debe dar "object"
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  var REF    = "qpqoqrroplkyyelkqnxo";
  var SB_URL = "https://" + REF + ".supabase.co";

  // ── 1) Detectar la storageKey de sesión para heredar el login actual ──
  function detectStorageKey() {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (/^sb-.*-auth-token$/.test(k)) return k;
    }
    return "sb-" + REF + "-auth-token";
  }

  // ── 2) Extraer la anon key del bundle (está hardcodeada, es pública) ──
  function extractAnonKey() {
    return new Promise(function (resolve, reject) {
      // Buscar el script del bundle (type="module" con "index-" en el src)
      var bundleEl = document.querySelector('script[type="module"][src*="index-"]');
      if (!bundleEl) {
        return reject(new Error("No se encontró el script del bundle"));
      }

      var bundleUrl = bundleEl.src;
      console.log("[fix-cliente] Leyendo bundle:", bundleUrl);

      fetch(bundleUrl)
        .then(function (r) { return r.text(); })
        .then(function (code) {
          // La anon key es un JWT: empieza con eyJ y tiene 3 segmentos separados por .
          var matches = code.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g);
          if (!matches || matches.length === 0) {
            return reject(new Error("No se encontró ningún JWT en el bundle"));
          }

          // El token más largo que NO sea el access token de sesión es la anon key.
          // La anon key de Supabase tiene el role "anon" en su payload.
          var anonKey = null;
          for (var i = 0; i < matches.length; i++) {
            try {
              var payload = JSON.parse(atob(matches[i].split(".")[1]));
              if (payload.role === "anon") {
                anonKey = matches[i];
                break;
              }
            } catch (e) { /* continuar */ }
          }

          // Fallback: si no encontramos role=anon, tomar el JWT más largo
          if (!anonKey) {
            anonKey = matches.reduce(function (a, b) {
              return a.length >= b.length ? a : b;
            });
          }

          resolve(anonKey);
        })
        .catch(reject);
    });
  }

  // ── 3) Cargar supabase-js desde CDN ──
  function loadSupabaseJS() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) {
        return resolve(window.supabase);
      }
      var s     = document.createElement("script");
      s.src     = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
      s.onload  = function () { resolve(window.supabase); };
      s.onerror = function () { reject(new Error("No se pudo cargar supabase-js desde CDN")); };
      document.head.appendChild(s);
    });
  }

  // ── 4) Keepalive: ping cada 20s para que el router no mate el WebSocket ──
  function startKeepalive(anonKey) {
    setInterval(function () {
      fetch(SB_URL + "/rest/v1/system_settings?select=key&limit=1", {
        headers: {
          "apikey":        anonKey,
          "Authorization": "Bearer " + anonKey
        }
      }).catch(function () { /* silencioso — solo es un ping */ });
    }, 20000);
    console.log("[fix-cliente] Keepalive activo (ping cada 20s).");
  }

  // ── 5) Construir el cliente y guardarlo en window._p360sb ──
  function buildClient(anonKey) {
    return loadSupabaseJS().then(function (sb) {
      var client = sb.createClient(SB_URL, anonKey, {
        auth: {
          storageKey:         detectStorageKey(), // hereda la sesión logueada
          persistSession:     true,
          autoRefreshToken:   false,  // el bundle ya refresca; evitamos conflicto
          detectSessionInUrl: false
        }
      });

      window._p360sb = client;

      window._p360ensureSession = function () {
        return client.auth.getSession();
      };

      try { window.dispatchEvent(new Event("p360sb-ready")); } catch (e) {}

      console.log("[fix-cliente] window._p360sb LISTO. Escrituras de parches activas.");
      startKeepalive(anonKey);

      return client;
    });
  }

  // ── 6) Init (espera a que el DOM esté listo para leer el src del bundle) ──
  function init() {
    var run = function () {
      extractAnonKey()
        .then(buildClient)
        .catch(function (err) {
          console.error("[fix-cliente] Error:", err.message);
        });
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run);
    } else {
      run();
    }
  }

  init();

})();
