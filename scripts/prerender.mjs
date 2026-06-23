// Post-build prerender of the public marketing routes.
//
// Runs after the client build (dist/) and the SSR build (dist-server/). It
// injects the server-rendered HTML for /, /terms and /about into the built
// index.html template, flags those documents so the client hydrates them, and
// writes an unflagged app.html shell that every other (interactive/auth) route
// falls back to for plain client rendering.
import { readFile, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const dist = path.join(root, 'dist');
const serverDir = path.join(root, 'dist-server');

const serverFiles = await readdir(serverDir);
const entryName = serverFiles.find(f => /^entry-server\.(m?js)$/.test(f));
if (!entryName) {
  throw new Error(`prerender: could not find entry-server.* in ${serverDir}`);
}
const { render } = await import(pathToFileURL(path.join(serverDir, entryName)).href);

const template = await readFile(path.join(dist, 'index.html'), 'utf8');
if (!template.includes('<div id="root"></div>')) {
  throw new Error('prerender: index.html template is missing <div id="root"></div>');
}

// SPA shell for non-prerendered routes (booking, confirmation, login, admin…).
await writeFile(path.join(dist, 'app.html'), template);

const ROUTES = [
  { url: '/', file: 'index.html' },
  { url: '/terms', file: 'terms.html' },
  { url: '/about', file: 'about.html' },
];

for (const r of ROUTES) {
  const appHtml = await render(r.url);
  const html = template
    .replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)
    .replace('</head>', '    <script>window.__SSG__=true</script>\n  </head>');
  await writeFile(path.join(dist, r.file), html);
  console.log(`prerendered ${r.url} -> dist/${r.file} (${appHtml.length} bytes of HTML)`);
}

// The SSR bundle is a build artifact only.
await rm(serverDir, { recursive: true, force: true });
console.log('prerender: done');
