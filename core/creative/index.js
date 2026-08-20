import { DisplayCreative } from './display.js';
import { VideoCreative } from './video.js';
import { NativeCreative } from './native.js';

// OpenRTB 2.5 bid.mtype values
const MTYPE_BANNER = 1;
const MTYPE_VIDEO = 2;
const MTYPE_NATIVE = 4;

export function detect(adm, mtype) {
  if (!adm) return null;

  if (mtype === MTYPE_VIDEO) return new VideoCreative(adm);
  if (mtype === MTYPE_NATIVE) return new NativeCreative(adm);
  if (mtype === MTYPE_BANNER) return new DisplayCreative(adm);

  // mtype absent or unknown — sniff by content
  const trimmed = adm.trimStart();
  if (/^[{[]/.test(trimmed)) return new NativeCreative(adm);
  if (/<VAST/i.test(trimmed)) return new VideoCreative(adm);
  return new DisplayCreative(adm);
}

export { DisplayCreative, VideoCreative, NativeCreative };
