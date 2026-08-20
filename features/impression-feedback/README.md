# impression-feedback

Tags served creatives so a rendered impression calls back to us, and fans the
decoded context out to consumers.

- Stage: `postbid-ssp`
- Namespace: `impFeedback` (plus `tracking` for the service itself)

Injection is creative-type aware: a `<script>` on display, a VAST `<Impression>`
on video, an eventtracker or imptracker on native. The context travels as
AES-256-GCM ciphertext, so only the fleet can read it.
