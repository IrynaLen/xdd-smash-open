import { detect as detectCreative } from './creative/index.js';

export class BidResponse {
  // rawBid    — original bid object from DSP response (kept for proxy build)
  // seatIndex — position in seatbid[] (for proxy build)
  // bidIndex  — position in seatbid[seatIndex].bid[] (for proxy build)
  constructor(rawBid, seat, seatIndex, bidIndex) {
    this._rawBid = rawBid;
    this._seat = seat ?? null;
    this._seatIndex = seatIndex;
    this._bidIndex = bidIndex;
    this._patches = [];

    this.id = rawBid.id ?? null;
    this.impid = rawBid.impid ?? null;
    this.price = rawBid.price;
    this.crid = rawBid.crid ?? null;
    this.adomain = Array.isArray(rawBid.adomain) ? rawBid.adomain : [];
    this.nurl = rawBid.nurl ?? null;
    this.lurl = rawBid.lurl ?? null;
    this.w = rawBid.w ?? null;
    this.h = rawBid.h ?? null;

    this.creative = rawBid.adm ? detectCreative(rawBid.adm, rawBid.mtype ?? null) : null;
  }

  set(path, value) {
    this._patches.push({ path, value });
    return this;
  }
}
