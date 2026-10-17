import { defineConfig } from 'vite';

// The cache-busting query, stripped for the BUILD only.
//
// The site is served as bare ES modules straight from the repository, so
// main.js has no hash in its URL and a browser is free to keep serving the
// copy it already has. index.html therefore references it with a version
// query - "?v=20261017-nohost" - which the browser treats as a different URL.
//
// That query is a problem for the BUNDLED build. Vite resolves a module src
// with a query as its own module id, so "./main.js?v=..." is bundled as
// something other than the entry, and the shared modules it pulls in get
// duplicated: the bundle grew by 29 KB (430 KB -> 459 KB) for no reason other
// than the query.
//
// So the query is stripped from the HTML before Vite resolves the tags, and
// the bundled output is byte-for-byte what it was before the query existed.
// The source index.html - the one the repository serves - keeps the query,
// which is the whole point of it.
//
// `order: 'pre'` is what makes this work: the hook has to run BEFORE Vite
// processes the script tags, not after.
function stripCacheBustQuery() {
    return {
        name: 'strip-cache-bust-query',
        transformIndexHtml: {
            order: 'pre',
            handler(html) {
                return html.replace(/(\.(?:js|css))\?v=[A-Za-z0-9._-]+/g, '$1');
            },
        },
    };
}

export default defineConfig({
    root: '.',
    base: './',
    plugins: [stripCacheBustQuery()],
    build: {
        outDir: 'dist',
        copyPublicDir: true,
        rollupOptions: {
            input: {
                main: 'index.html',
                raw: 'raw.html',
                reward: 'reward.html',
                checkpoint: 'checkpoint.html',
            },
        },
    },
    server: {
        port: 5173,
        host: true,
    },
});
