# user-dedup

Drops repeat requests for the same device within a TTL window.

- Stage: `prebid-dsp`
- Namespace: `userDedup`

Keyed per DSP on the IFA, using a Redis `SET NX PX`. Fails open: no IFA, no
target match or no Redis and the request passes untouched.
