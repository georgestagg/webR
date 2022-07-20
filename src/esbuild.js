const esbuild = require('esbuild');
const cssModulesPlugin = require('esbuild-css-modules-plugin');

function build({ input, output, platform, minify }) {
  esbuild.build({
    entryPoints: [`${input}`],
    bundle: true,
    target: ['es2020','node12'],
    minify: minify,
    sourcemap: true,
    outfile: `../dist/${output}`,
    logLevel: 'info',
    platform: platform,
    mainFields: ['main', 'module'],
    external: ['worker_threads', 'path', 'fs'],
    assetNames: 'assets/[name]-[hash]',
    loader: {
      '.jpg': 'file',
      '.png': 'file',
      '.gif': 'file',
    },
    plugins: [
    	cssModulesPlugin({
    		inject: (cssContent, digest) => `console.log("${cssContent}", "${digest}")`,
    	})
    ],
  }).catch(() => process.exit(1));
}

[
  {
    input: "webR/webr-worker.ts",
    output: "../dist/webr-worker.js",
    platform: 'node',
    minify: false,
  },
  {
    input: "webR/webr-main.ts",
    output: "webr.mjs",
    platform: 'neutral',
    minify: false,
  },
  {
    input: "repl/repl.ts",
    output: "../dist/repl.mjs",
    platform: 'neutral',
    minify: true,
  },
  {
    input: "console/console.ts",
    output: "../dist/console.mjs",
    platform: 'neutral',
    minify: true,
  },
].map(build);
