import fs from 'node:fs'; import { build } from 'esbuild'; import { STATIC } from '../server.mjs';
const assets = Object.fromEntries(STATIC.map(p => [p, fs.readFileSync('.' + p, 'utf8')]));
fs.writeFileSync('worker/assets.gen.mjs', 'export default ' + JSON.stringify(assets) + ';\n');
await build({ entryPoints: ['worker/index.mjs'], bundle: true, format: 'esm', platform: 'neutral', minify: true, outfile: 'dist/worker.mjs' });
console.log('dist/worker.mjs', fs.statSync('dist/worker.mjs').size, 'bytes');
