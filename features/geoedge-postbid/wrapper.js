// Geoedge creative wrapper — wraps a banner ADM with Geoedge scanning JS.
//
// The wrapper initializes window.grumi, hides the original ADM in a <template>,
// and the Geoedge footer script renders it after scanning/passing it.
//
// Reference: https://geoedge.com — prebid server integration pattern.

// Long footer script provided by Geoedge — not modified.
const GE_FOOTER = '</xmp></template><script type="text/javascript"nonce="!footerNonce!">!function (n) { var e = window.grumi.key,t = window.grumi,o = t && t.wtype && "gpt" === t.wtype,r = window.onerror,i = +new Date,a = navigator.userAgent && navigator.userAgent.match(/(MSIE)|(Trident)|(Edg)/),w = o && !a,o = t.to,o = parseInt(o,10) || 5e3; function u() { var n = function () { for (var n,e = document.getElementsByTagName("template"),t = e.length - 1; 0 <= t; t--)if ("template0" === e[t].id) { n = e[t]; break } return n }(); return n.content ? n.content.getElementById ? n.content.getElementById("xmp0") : n.content.childNodes[0] : n.getElementsByTagName("xmp")[0] } function d() { var n = u(); return n && n.innerHTML } function c(n,e) { e = e || !1,top.postMessage && top.postMessage({ evType: n || "",key: t.key,adup: t.meta.adup,html: window.grumi ? window.grumi.tag : "",el: t.meta.adElId,refresh: e },"*") } var m = !1; function g(n,e) { var t,o; !m && (m = !0,t = "",o = a && "complete" === document.readyState,window.grumi && (window.grumi.fsRan = !0,t = window.grumi.tag),o || (t = t || d(),w && window.document.open(),window.document.write(t),window.document.close()),(e = e || !1) || o) && c(n,o) } function s(n,t) { return function () { var e = setTimeout(function () { var n = document.getElementById(i); n && null === function (n) { if (void 0 !== n.nextElementSibling) return n.nextElementSibling; for (var e = n.nextSibling; e && 1 !== e.nodeType;)e = e.nextSibling; return e }(n) && t && t(),clearTimeout(e) },n) } } s(o,function () { g() })(),s(2e3,function () { c("slwCl") })(),window.grumi.tag = d(),window.grumi.scriptHost = n,window.grumi.pbGlobal = window.grumi.cfg && window.grumi.cfg.pbGlobal || "pbjs",window.grumi.onerror = r,window.parent && window.parent.postMessage && window.parent.postMessage({ iw: !0,key: t.key,adup: t.meta.adup,el: t.meta.adElId },"*"),window.grumiInstance = function () { for (var n = window,e = 0; e < 10; e++) { try { if (n.grumiInstance) return n.grumiInstance } catch (n) { } n = n.parent } }() || { q: [] }; var p = JSON.parse(JSON.stringify(window.grumi)); if (grumiInstance.q.push(function () { grumiInstance.createInstance(window,document,p) }),!grumiInstance.loaded) { o = document.createElement("script"),n = (o.type = "text/javascript",o.src = n + e + "/grumi.js",o.className = "rm",o.id = i,w && (o.async = !0),"_" + +new Date); window[n] = function () { g("netErr",!0) },window.grumi.start = +new Date; try { window.document.write(o.outerHTML.replace(\'class="rm"\',\'onerror="\' + n + \'();"\')); } catch (n) { g() } } window.onerror = function (n) { "function" == typeof r && r.apply(this,arguments),s(0,g)(),window.onerror = r } }(("http" === window.location.protocol.substr(0,4) ? window.location.protocol : "https:") + "//rumcdn.geoedge.be/");</script></div>';

// Wrap a banner ADM with the Geoedge scanning wrapper.
//
// params:
//   key    — Geoedge customer key (UUID)
//   dspId  — DSP seat ID
//   crid   — creative ID from the bid
//   sspId  — SSP seat ID
//   w, h   — ad dimensions
export function wrapAdm(adm, { key, dspId, crid, sspId, w, h }) {
  const safeKey = String(key ?? '');
  const safeDspId = String(dspId ?? '');
  const safeCrid = String(crid ?? '').replace(/"/g, '');
  const safeSspId = String(sspId ?? '');
  const safeW = String(w ?? '');
  const safeH = String(h ?? '');

  const header = (
    `<div id="grumi-container">` +
    `<script type="text/javascript" nonce="!headerNonce!">` +
    `window.grumi={` +
    `wver:"1.1.6",wtype:"dfp",` +
    `key:"${safeKey}",` +
    `meta:{` +
    `adup:"${safeDspId}/${safeCrid}",` +
    `w:"${safeW}",h:"${safeH}",` +
    `di:"${safeDspId}",dcid:"${safeCrid}",` +
    `pid:"${safeSspId}",adElId:"",topUrl:""},` +
    `sp:"dfp",cfg:{advs:""},to:"1500"};` +
    `</script>` +
    `<template style="display:none;" id="template0">` +
    `<xmp style="display:none;" id="xmp0">`
  );

  return header + adm + GE_FOOTER;
}
