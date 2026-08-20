// Escaping helpers for the two injection surfaces.

// For an HTML attribute value (the display <script data-...>).
export function attrEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// For a value placed inside a VAST CDATA section. base64url tokens never
// contain "]]>", but split it defensively so a URL can never break out.
export function cdataSafe(s) {
  return String(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>');
}
