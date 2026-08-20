const BLOCKED_CRIDS = new Set([
  'democrid1234qwerty:16',
]);

export default function(ctx) {
  ctx.responses = ctx.responses.filter(r => !BLOCKED_CRIDS.has(r.crid));
  return ctx;
}
