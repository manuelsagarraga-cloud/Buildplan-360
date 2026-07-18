/*
 * fix-cliente-v1.js  —  BuildPlan360 / Pipeline360
 * ---------------------------------------------------------------------------
 * PROBLEMA QUE RESUELVE
 * Tras recompilarse el bundle (index-DjIPflYO -> index-CCPu5O...), el mecanismo
 * que buscaba el cliente Supabase recorriendo los fibers de React dejo de
 * funcionar. Resultado: window._p360sb queda undefined, las LECTURAS siguen
 * andando (las hace el bundle) pero las ESCRITURAS de los parches (crear
 * proyecto, asignar responsable en masa, importar XML) nunca se disparan ->
 * el boton queda en "Guardando..." y al recargar no se guardo nada.
 *
 * SOLUCION (Camino B)
 * Creamos un cliente Supabase INDEPENDIENTE, que NO depende de la estructura
 * interna de React. Asi sobrevive a futuras recompilaciones del bundle.
 *  - La URL se deriva del ref del proyecto (publica).
 *  - La anon key NO se hardcodea: se captura de las propias peticiones que la
 *    app ya hace (la anon key es publica por diseno en apps Supabase).
 *  - La sesion logueada se HEREDA del localStorage (misma storageKey), asi el
 *    cliente escribe como el usuario actual y RLS lo acepta.
 *
 * INSTALACION
 *  1) Copiar este archivo al repo (junto a los demas parches).
 *  2) Agregar la etiqueta <script> en index.html Y en 404.html:
 *       <script src="./assets/fix-cliente-v1.js"></script>
 *     Conviene que sea de los PRIMEROS scripts, para instalar el interceptor
 *     de fetch cuanto antes (igual la app hace requests en loop, asi que
 *     tambien funciona si se carga tarde).
 *  3) Recargar con Ctrl+F5.
 *
 * VERIFICACION (en la consola, con la app logueada):
 *     typeof window._p360sb   // debe dar "object"
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  var REF = "qpqoqrroplkyyelkqnxo";              // ref del proyecto Supabase
  var URL = "https://" + REF + ".supabase.co";
  var anonKey = null;
  var origFetch = window.fetch;

  // -- 1) Interceptor de fetch: captura la anon key de las requests de la app --
  window.fetch = function () {
    try {
      var input = arguments[0];
      var init = arguments[1];
      var headers = (init && init.headers) || (input && input.headers);
      if (headers && !anonKey) {
        var read = function (h, k) { return h && h.get ? h.get(k) : (h ? h[k] : null); };
        var k = read(headers, "apikey") || read(headers, "apiKey");
        if (k) anonKey = k;
      }
    } catch (e) { /* no romper nunca el fetch original */ }
    return origFetch.apply(this, arguments);
  };

  // -- 2) Cargar supabase-js (UMD) desde CDN una sola vez --
  function loadSupabase() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve(window.supabase);
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";
      s.onload = function () { resolve(window.supabase); };
      s.onerror = function () { reject(new Error("No se pudo cargar supabase-js desde el CDN")); };
      document.head.appendChild(s);
    });
  }

  // -- Detectar la storageKey de la sesion para heredar el login del usuario --
  function detectStorageKey() {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (/^sb-.*-auth-token$/.test(key)) return key;
    }
    return "sb-" + REF + "-auth-token"; // fallback: storageKey por defecto de supabase-js
  }

  // -- 3) Inicializar el cliente compartido --
  function init() {
    var tries = 0;
    var waitKey = setInterval(function () {
      tries++;
      if (anonKey) {
        clearInterval(waitKey);
        build();
      } else if (tries > 100) { // ~10s
        clearInterval(waitKey);
        console.error("[fix-cliente] No se pudo capturar la anon key. " +
          "Interactua con la app (que haga alguna consulta) y recarga.");
      }
    }, 100);

    function build() {
      loadSupabase().then(function (sb) {
        var client = sb.createClient(URL, anonKey, {
          auth: {
            storageKey: detectStorageKey(), // hereda la sesion logueada
            persistSession: true,
            autoRefreshToken: false,        // el bundle original ya refresca el token;
                                            // evitamos que dos clientes peleen por el refresh
            detectSessionInUrl: false
          }
        });

        window._p360sb = client;

        // Helper opcional: garantizar sesion antes de escribir (mata el "cold start")
        window._p360ensureSession = function () {
          return client.auth.getSession();
        };

        // Avisar a quien quiera esperar a que el cliente este listo
        try { window.dispatchEvent(new Event("p360sb-ready")); } catch (e) {}

        // Restaurar el fetch original (ya no necesitamos el interceptor)
        window.fetch = origFetch;

        console.log("[fix-cliente] window._p360sb LISTO. Las escrituras de los parches vuelven a funcionar.");
      }).catch(function (err) {
        console.error("[fix-cliente] Error creando el cliente:", err);
        window.fetch = origFetch;
      });
    }
  }

  init();
})();
