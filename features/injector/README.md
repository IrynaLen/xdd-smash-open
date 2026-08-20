# injector

The adapter framework: discovers DSP and SSP hooks from the filesystem at
startup, so adding an adapter is dropping a file.

Filename encodes the stage and any targeting: `seat-333.prebid-dsp.js` under
`dsp/appnexus/` runs for Appnexus on seat 333. `_/` matches any bidder.

Each adapter directory carries a `config.json` with its endpoint and declared
capabilities. See `docs/framework.md`.
