import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, indent } from './utils.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');

const { i2: I2, i4: I4 } = indent;
const SEP = indent.i2;

function version() {
  return readJson(resolve(ROOT, 'package.json'))?.version ?? '?';
}

export function printStartup(features, protocols, port) {
  const adapters = features.filter(f => f.side === 'dsp' || f.side === 'ssp');
  const tools = features.filter(f => f.side === 'feature');
  const ok = adapters.filter(a => !a.error);
  const failed = adapters.filter(a => a.error);

  console.log(`\nxdd-smash v${version()}\n`);

  if (adapters.length === 0) {
    console.log(`${I2}adapters: none\n`);
  } else {
    console.log(`${I2}adapters (${ok.length}):`);
    for (const a of ok) {
      const scope = a.label.replace(`${a.side}/${a.bidder}/`, '').replace('.js', '');
      const bidder = a.bidder === '_' ? '*' : a.bidder;
      console.log(`${I4}${'ok'.padEnd(6)}${a.side.padEnd(4)}${SEP}${bidder.padEnd(14)}${SEP}${scope}`);
    }
    console.log();
  }

  if (tools.length > 0) {
    console.log(`${I2}features (${tools.length}):`);
    for (const f of tools) {
      const scope = f.label.replace(`tool/${f.bidder}/`, '').replace('.js', '');
      console.log(`${I4}${'ok'.padEnd(6)}${f.bidder.padEnd(14)}${SEP}${scope}`);
    }
    console.log();
  }

  if (failed.length > 0) {
    console.log(`${I2}failed:`);
    for (const a of failed) {
      console.log(`${I4}${'FAILED'.padEnd(6)}${a.label} - ${a.error}`);
    }
    console.log();
  }

  const cfg = readJson(resolve(ROOT, 'config.json'));
  if (cfg) {
    console.log(`${I2}config:`);
    const adaptersSection = cfg.adapters ?? {};
    for (const [name, val] of Object.entries(adaptersSection)) {
      const params = val.params ?? {};
      const filled = Object.entries(params).filter(([, v]) => v !== null && v !== '');
      const status = filled.length > 0 ? filled.map(([k]) => k).join(', ') : 'no params';
      console.log(`${I4}${'adapters.' + name.padEnd(12)}${SEP}${status}`);
    }
    const geoCfg = cfg.geoedge;
    if (geoCfg) {
      const geoStatus = geoCfg.enabled ? `enabled key=${geoCfg.key || '(empty)'}` : 'disabled';
      console.log(`${I4}${'geoedge'.padEnd(21)}${SEP}${geoStatus}`);
    }
    console.log();
  }

  console.log(`${I2}${'protocols:'.padEnd(10)} ${protocols.join(', ')}`);
  console.log(`${I2}${'port:'.padEnd(10)} ${port}`);
  console.log();
}
