/**
 * Browser extensions (password managers, form fillers, crypto wallets) modify
 * the page before React hydrates or throw errors from their own scripts.
 * Neither is a CampusConnect bug, but both pollute the console and the
 * Next.js dev error overlay. This tiny inline script runs first in <head>:
 *
 *  1. Strips attributes that extensions inject into form controls
 *     (e.g. `fdprocessedid`) until hydration has finished, so React never sees
 *     a server/client attribute mismatch.
 *  2. Swallows errors / promise rejections that originate from
 *     chrome-extension:// or moz-extension:// code. Errors from the app
 *     itself are never touched.
 */
const SCRIPT = `(function () {
  var ATTRS = ["fdprocessedid", "bis_skin_checked", "bis_register", "__processed_"];
  var SELECTOR = ATTRS.map(function (a) { return "[" + a + "]"; }).join(",");
  function clean(el) {
    if (!el || el.nodeType !== 1) return;
    for (var i = 0; i < ATTRS.length; i++) if (el.hasAttribute(ATTRS[i])) el.removeAttribute(ATTRS[i]);
  }
  try {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "attributes") { clean(m.target); continue; }
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          clean(n);
          if (n.querySelectorAll) n.querySelectorAll(SELECTOR).forEach(clean);
        }
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRS });
    // Hydration is long finished by then; stop watching.
    setTimeout(function () { observer.disconnect(); }, 15000);
  } catch (e) {}

  var EXT = /(chrome|moz|safari-web)-extension:\\/\\//;
  function fromExtension(ev) {
    var parts = [ev.filename, ev.error && ev.error.stack, ev.reason && ev.reason.stack, ev.reason && ev.reason.message];
    try { if (ev.reason && typeof ev.reason !== "object") parts.push(String(ev.reason)); } catch (e) {}
    return EXT.test(parts.filter(Boolean).join(" "));
  }
  function swallow(ev) {
    if (fromExtension(ev)) { ev.stopImmediatePropagation(); ev.preventDefault(); }
  }
  window.addEventListener("error", swallow, true);
  window.addEventListener("unhandledrejection", swallow, true);
})();`;

export function ExtensionGuard() {
  return <script id="extension-guard" dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
