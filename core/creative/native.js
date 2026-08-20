import { Creative } from './base.js';

// adm is a JSON string carrying an OpenRTB Native Ad Response, in either the
// wrapped ({"native":{...}}) or the bare ({...}) shape — both are in the wild.
//
// inject() still takes a raw string transform. mutate() is the native-aware
// path: it takes the parsed response object instead, and every queued mutation
// shares a single parse/stringify round-trip at serialize() time, so N
// injectors cost one parse, not N.
export class NativeCreative extends Creative {
  constructor(adm) {
    super(adm);
    this._mutations = [];
  }

  // fn receives the Native Ad Response object (unwrapped) and mutates in place.
  mutate(fn) {
    this._mutations.push(fn);
    this._dirty = true;
  }

  serialize() {
    const adm = super.serialize();
    if (!this._mutations.length) return adm;

    let doc;
    try {
      doc = JSON.parse(adm);
    } catch {
      return adm; // not JSON after the string transforms — never corrupt the adm
    }
    if (!doc || typeof doc !== 'object') return adm;

    // Mutations see the response object itself; the wrapper (if any) is kept.
    const root = doc.native ?? doc;
    for (const fn of this._mutations) fn(root);

    return JSON.stringify(doc);
  }
}
