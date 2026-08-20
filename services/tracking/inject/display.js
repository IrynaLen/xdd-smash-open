import { attrEscape } from './escape.js';

// Service-internal: the display/banner injection shape used by tracking.inject().
// Appends a <script> that loads the CDN client and carries the opaque context
// token + the callback endpoint as data-attributes; the client reads them and
// fires the beacon. Full JS runs in the render frame, so no URL-length pressure.
export function injectDisplay(adm, { token, endpointUrl, cdnScriptUrl }) {
  const tag =
    `<script src="${attrEscape(cdnScriptUrl)}"` +
    ` data-smash-ep="${attrEscape(endpointUrl)}"` +
    ` data-smash-ctx="${attrEscape(token)}" async></script>`;
  return adm + tag;
}
