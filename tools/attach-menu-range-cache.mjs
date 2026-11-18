import fs from 'node:fs';
import { createMenuRangeFetch } from '../runtime/collection/menu-range-cache.mjs';
import { collectMenuRangeGroups } from './menu-range-profile.mjs';

// Patch the two consumers in the collection package worker. Ordinary shell
// requests keep their existing authentication, caching and byte accounting.
export function attachMenuRangeCache(source, groups) {
  const seam = '    const jitIndexFetch=';
  const fetchSeam = '}}return fetch(input,init);};';
  const codecSeam = 'm.createCodecReconstructor({baseURL:';
  for (const anchor of [seam, fetchSeam, codecSeam]) {
    if (source.split(anchor).length !== 2) throw Error('Unexpected package worker integration point');
  }
  return source
    .replace(seam, '    const menuRangeFetch=(' + createMenuRangeFetch.toString() +
      ')({origin:self.location.origin,groups:' + JSON.stringify(groups) + '});\n' + seam)
    .replace(fetchSeam, '}}return menuRangeFetch(input,init);};')
    .replace(codecSeam, 'm.createCodecReconstructor({fetcher:menuRangeFetch,baseURL:');
}

if (import.meta.main) {
  const [worker, trace, phases, output] = process.argv.slice(2);
  if (!output) throw Error('Usage: attach-menu-range-cache.mjs WORKER REQUESTS PHASE_REPORT NEW_WORKER');
  const report = JSON.parse(fs.readFileSync(phases));
  if (!report.passed || !report.telemetryReadyVerified) throw Error('Unverified menu trace');
  const menu = report.phases.find(phase => phase.stage === 'menu');
  const { groups } = collectMenuRangeGroups(JSON.parse(fs.readFileSync(trace)), menu?.to);
  fs.writeFileSync(output, attachMenuRangeCache(fs.readFileSync(worker, 'utf8'), groups), { flag: 'wx' });
}
