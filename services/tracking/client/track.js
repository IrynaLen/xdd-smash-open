(function () {
  try {
    var s = document.currentScript;
    if (!s) return;
    var ep = s.getAttribute('data-smash-ep');
    var ctx = s.getAttribute('data-smash-ctx');
    if (!ep || !ctx) return;

    if (navigator.sendBeacon && navigator.sendBeacon(ep, ctx)) return;
    if (window.fetch) { fetch(ep, { method: 'POST', keepalive: true, body: ctx, mode: 'no-cors' }); return; }
    new Image().src = ep + (ep.indexOf('?') === -1 ? '?' : '&') + 'c=' + encodeURIComponent(ctx);
  } catch (e) {}
})();
