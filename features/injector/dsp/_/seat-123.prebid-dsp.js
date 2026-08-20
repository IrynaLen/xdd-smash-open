// Seat 123. Requires MRAID API (api=7).
export default function(ctx) {
  if (!ctx.impression.api?.includes(7)) return null;
  return ctx;
}
