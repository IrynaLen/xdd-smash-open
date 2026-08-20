export class Creative {
  constructor(adm) {
    this._adm = adm;
    this._fns = [];
    this._dirty = false;
  }

  // Override in subclass to declare HTML-based creatives (eligible for HTML wrapping).
  get isHtml() { return false; }

  inject(fn) {
    this._fns.push(fn);
    this._dirty = true;
  }

  serialize() {
    return this._fns.reduce((adm, fn) => fn(adm), this._adm);
  }
}
