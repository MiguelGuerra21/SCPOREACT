// build-worker.js
const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: [path.resolve(__dirname, 'src/workers/exportWorker-src.js')],
  bundle: true,
  platform: 'browser',
  target: ['es2020'],
  outfile: path.resolve(__dirname, 'public', 'workers', 'exportWorker.js'),
  minify: false,
  sourcemap: true,
  inject: [path.resolve(__dirname, 'src/workers/polyfill-buffer.js')]
}).catch(() => process.exit(1));
