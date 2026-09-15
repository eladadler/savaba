// build.js — extracts JSX from src.html, compiles it, outputs app.js + index.html (production)
// Edit src.html; run `npm run build` before pushing.
const fs   = require('fs');
const crypto = require('crypto');
const babel = require('@babel/core');

const html = fs.readFileSync('src.html', 'utf8');

// Split on the babel script tag
const OPEN_TAG  = '<script type="text/babel">';
const CLOSE_TAG = '</script>';
const openIdx   = html.indexOf(OPEN_TAG);
if (openIdx === -1) { console.error('No <script type="text/babel"> found'); process.exit(1); }

const afterOpen   = html.slice(openIdx + OPEN_TAG.length);
const closeIdx    = afterOpen.lastIndexOf(CLOSE_TAG);
const jsxCode     = afterOpen.slice(0, closeIdx);
const afterScript = afterOpen.slice(closeIdx + CLOSE_TAG.length);

console.log(`Compiling ${Math.round(jsxCode.length / 1024)}KB of JSX...`);

// Stamp image assets with their own content hash — they keep their filename across
// edits, so without this a replaced file stays cached in browsers that already have it.
const ASSET_STAMPS = { __LOGO_V__: 'logo.png', __LOGO3_V__: 'logo3.png' };
let stampedJsx = jsxCode;
for (const [placeholder, file] of Object.entries(ASSET_STAMPS)) {
  const v = fs.existsSync(file)
    ? crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex').slice(0, 10)
    : '0';
  stampedJsx = stampedJsx.split(placeholder).join(v);
}

const result = babel.transformSync(stampedJsx, {
  presets: [
    ['@babel/preset-react', { runtime: 'classic' }],
  ],
  filename: 'app.js',
  sourceType: 'script',
});

fs.writeFileSync('app.js', result.code, 'utf8');
console.log(`app.js written (${Math.round(result.code.length / 1024)}KB)`);

// Build dist/index.html — no Babel CDN, references app.js instead
if (!fs.existsSync('dist')) fs.mkdirSync('dist');

const BABEL_CDN = '<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" crossorigin></script>';

// Cache-bust app.js so browsers/CDNs always fetch the latest build after each deploy
const version = crypto.createHash('md5').update(result.code).digest('hex').slice(0, 10);

const beforeScript = html.slice(0, openIdx);
const distHtml = beforeScript
  .replace(BABEL_CDN + '\n', '')
  .replace(BABEL_CDN, '')
  + `<script src="app.js?v=${version}"></script>`
  + afterScript;

// Swap React development → production minified
const prodHtml = distHtml
  .replace('react@18.3.1/umd/react.development.js', 'react@18.3.1/umd/react.production.min.js')
  .replace('react-dom@18.3.1/umd/react-dom.development.js', 'react-dom@18.3.1/umd/react-dom.production.min.js');

// Overwrite root index.html (the file GitHub Pages serves)
fs.writeFileSync('index.html', prodHtml, 'utf8');
console.log('index.html (production) written');
console.log('Done.');
