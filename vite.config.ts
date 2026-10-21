import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';

export default defineConfig({
  plugins: [react(), {
    name: 'offline-shell',
    generateBundle(_options, bundle) {
      const files = ['/', '/index.html', ...Object.keys(bundle).map(name => '/' + name)];
      const hash = createHash('sha256');
      for (const name of Object.keys(bundle).sort()) {
        const output = bundle[name];
        hash.update(name).update(output.type === 'chunk' ? output.code : output.source);
      }
      const version = hash.digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = 'epub-reader-${version}';
const ASSETS = ${JSON.stringify(files)};
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('epub-reader-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => (await cache.match(e.request, { ignoreVary: true })) || fetch(e.request).catch(async () => e.request.mode === 'navigate' ? (await cache.match('/index.html')) || Response.error() : Response.error())));
});` });
    },
  }],
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup.ts'] },
});
