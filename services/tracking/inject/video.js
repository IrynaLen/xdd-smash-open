import { cdataSafe } from './escape.js';

// Service-internal: the video (VAST) injection shape used by tracking.inject().
// Splices a tracking <Impression> pixel (the beacon URL carries the token in its
// query) before every </InLine> and </Wrapper>. VAST is a raw string here — no
// parser exists — so if neither closing tag is present (self-closing <VAST/>,
// empty, or non-VAST) the adm is returned untouched rather than corrupted.
export function injectVideo(adm, { url }) {
  if (!/<\/InLine>/i.test(adm) && !/<\/Wrapper>/i.test(adm)) return adm;

  const node = `<Impression><![CDATA[${cdataSafe(url)}]]></Impression>`;
  return adm
    .replace(/<\/InLine>/gi, m => node + m)
    .replace(/<\/Wrapper>/gi, m => node + m);
}
