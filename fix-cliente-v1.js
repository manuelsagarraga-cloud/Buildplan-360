/*
 * fix-cliente-v1.js  —  BuildPlan360 / Pipeline360
 * ---------------------------------------------------------------------------
 * PROBLEMAS QUE RESUELVE
 *
 * 1. window._p360sb — cliente Supabase compartido
 *    Construye un cliente REST mínimo con fetch puro. Sin dependencias de CDN,
 *    sin interceptar fetch, sin depender de fibers de React.
 *    Sobrevive a recompilaciones del bundle.
 *
 * 2. Keepalive de conexión ("Conectando..." recurrente)
 *    Ping liviano cada 20s para que el router no mate el WebSocket de Realtime.
 *    Evita que el import masivo de tareas se interrumpa a mitad.
 *
 * INSTALACION
 *  1) Copiar a /assets/ en el repo.
 *  2) En index.html Y 404.html, dentro del <head>,
 *     ANTES del <script type="module"> del bundle:
 *       <script src="./assets/fix-cliente-v1.js"></script>
 *  3) Commit + push → recargar con Ctrl+F5.
 *
 * VERIFICACION (consola, app logueada):
 *     typeof window._p360sb              // "object"
 *     window._p360sb._isP360Client       // true
 * ---------------------------------------------------------------------------
 */
(function () {
  "use strict";

  var REF    = "qpqoqrroplkyyelkqnxo";
  var SB_URL = "https://" + REF + ".supabase.co";

  // ── Leer el JWT de sesión del usuario logueado desde localStorage ──
  function getSessionToken() {
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (/^sb-.*-auth-token$/.test(k)) {
        try {
          var data = JSON.parse(localStorage.getItem(k));
          return (data && data.access_token) ? data.access_token : null;
        } catch (e) { return null; }
      }
    }
    return null;
  }

  // ── Construir headers para cada request ──
  function makeHeaders(anonKey) {
    var token   = getSessionToken() || anonKey;
    var headers = {
      "apikey":        anonKey,
      "Authorization": "Bearer " + token,
      "Content-Type":  "application/json",
      "Accept":        "application/json"
    };
    return headers;
  }

  // ── Cliente REST mínimo (replica la interfaz que usan los parches) ──
  function createMinimalClient(anonKey) {

    function query(table) {
      var _url     = SB_URL + "/rest/v1/" + table;
      var _filters = [];
      var _select  = null;
      var _order   = null;
      var _limit   = null;

      function buildUrl(extra) {
        var params = [];
        if (_select) params.push("select=" + encodeURIComponent(_select));
        _filters.forEach(function (f) { params.push(f); });
        if (_order) params.push("order=" + encodeURIComponent(_order));
        if (_limit) params.push("limit=" + _limit);
        if (extra)  params = params.concat(extra);
        return _url + (params.length ? "?" + params.join("&") : "");
      }

      function run(method, body, urlExtra, prefer) {
        var h = makeHeaders(anonKey);
        if (prefer) h["Prefer"] = prefer;
        return fetch(buildUrl(urlExtra), {
          method:  method,
          headers: h,
          body:    body ? JSON.stringify(body) : undefined
        }).then(function (r) {
          if (!r.ok) {
            return r.text().then(function (t) {
              return { data: null, error: { message: t, status: r.status } };
            });
          }
          var ct = r.headers.get("content-type") || "";
          if (ct.indexOf("json") > -1) {
            return r.json().then(function (d) { return { data: d, error: null }; });
          }
          return { data: null, error: null };
        }).catch(function (e) {
          return { data: null, error: { message: e.message } };
        });
      }

      var builder = {
        select: function (cols) { _select = cols || "*"; return builder; },
        eq:     function (col, val) {
          _filters.push(encodeURIComponent(col) + "=eq." + encodeURIComponent(val));
          return builder;
        },
        in:     function (col, vals) {
          _filters.push(encodeURIComponent(col) + "=in.(" + vals.map(encodeURIComponent).join(",") + ")");
          return builder;
        },
        order:  function (col, opts) {
          _order = col + (opts && opts.ascending === false ? ".desc" : ".asc");
          return builder;
        },
        limit:  function (n) { _limit = n; return builder; },

        // Lecturas
        then: function (resolve, reject) {
          if (!_select) _select = "*";
          return run("GET").then(resolve, reject);
        },

        // Escrituras
        insert: function (body, opts) {
          var prefer = "return=representation";
          if (opts && opts.returning === "minimal") prefer = "return=minimal";
          return run("POST", body, null, prefer);
        },
        update: function (body) {
          return {
            eq: function (col, val) {
              _filters.push(encodeURIComponent(col) + "=eq." + encodeURIComponent(val));
              return run("PATCH", body, null, "return=representation");
            },
            in: function (col, vals) {
              _filters.push(encodeURIComponent(col) + "=in.(" + vals.map(encodeURIComponent).join(",") + ")");
              return run("PATCH", body, null, "return=representation");
            }
          };
        },
        delete: function () {
          return {
            eq: function (col, val) {
              _filters.push(encodeURIComponent(col) + "=eq." + encodeURIComponent(val));
              return run("DELETE", null, null, "return=minimal");
            }
          };
        },

        // RPC
        rpc: function (fn, params) {
          return fetch(SB_URL + "/rest/v1/rpc/" + fn, {
            method:  "POST",
            headers: makeHeaders(anonKey),
            body:    JSON.stringify(params || {})
          }).then(function (r) {
            return r.json().then(function (d) {
              return r.ok
                ? { data: d, error: null }
                : { data: null, error: d };
            });
          }).catch(function (e) {
            return { data: null, error: { message: e.message } };
          });
        }
      };

      return builder;
    }

    return {
      _isP360Client: true,
      from:  query,
      rpc:   function (fn, params) { return query("").rpc(fn, params); },
      auth: {
        getSession: function () {
          var token = getSessionToken();
          return Promise.resolve({
            data:  { session: token ? { access_token: token } : null },
            error: null
          });
        }
      }
    };
  }

  // ── Extraer anon key del bundle compilado ──
  function extractAnonKey() {
    return new Promise(function (resolve, reject) {
      var bundleEl = document.querySelector('script[type="module"][src*="index-"]');
      if (!bundleEl) return reject(new Error("Bundle no encontrado en el DOM"));

      fetch(bundleEl.src)
        .then(function (r) { return r.text(); })
        .then(function (code) {
          var matches = code.match(
            /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g
          );
          if (!matches || matches.length === 0) {
            return reject(new Error("No se encontraron JWTs en el bundle"));
          }

          for (var i = 0; i < matches.length; i++) {
            try {
              var payload = JSON.parse(atob(matches[i].split(".")[1]));
              if (payload.role === "anon") return resolve(matches[i]);
            } catch (e) { /* continuar */ }
          }
          // fallback: JWT más largo
          resolve(matches.reduce(function (a, b) {
            return a.length >= b.length ? a : b;
          }));
        })
        .catch(reject);
    });
  }

  // ── Keepalive: ping cada 20s ──
  function startKeepalive(anonKey) {
    setInterval(function () {
      fetch(SB_URL + "/rest/v1/company_holidays?select=id&limit=1", {
        headers: makeHeaders(anonKey)
      }).catch(function () { /* silencioso */ });
    }, 20000);
    console.log("[fix-cliente] Keepalive activo (ping cada 20s). Adiós 'Conectando...'");
  }

  // ── Init ──
  function init() {
    var run = function () {
      extractAnonKey()
        .then(function (anonKey) {
          window._p360sb = createMinimalClient(anonKey);
          window._p360ensureSession = function () {
            return window._p360sb.auth.getSession();
          };
          try { window.dispatchEvent(new Event("p360sb-ready")); } catch (e) {}
          startKeepalive(anonKey);
          console.log(
            "[fix-cliente] window._p360sb LISTO (cliente REST mínimo, sin CDN). " +
            "Escrituras de parches activas."
          );
        })
        .catch(function (err) {
          console.error("[fix-cliente] No se pudo inicializar:", err.message);
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
