// zipfsmmd-sw.js
importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

let ZIP_PATH = null;

function swLog(msg) {
  console.log('[PMX-ZIP SW]', msg);
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'SW_LOG', text: msg });
    });
  });
}

self.addEventListener('install', event => {
  swLog('Install event fired');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  swLog('Activate event fired');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SET_ZIP_PATH') {
    ZIP_PATH = event.data.zipPath;
    swLog(`ZIP path set to: ${ZIP_PATH}`);
    zipCache.clear();
  }
});

const zipCache = new Map();

self.addEventListener('fetch', event => {
  if (!ZIP_PATH) return; // ZIP path not set, fallback to normal fetch

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const relPath = url.pathname;

  if (zipCache.has(relPath)) {
    swLog(`Serving from cache: ${relPath}`);
    event.respondWith(zipCache.get(relPath).clone());
    return;
  }

  event.respondWith(
    (async () => {
      try {
        if (zipCache.size === 0) {
          swLog(`Fetching ZIP from ${ZIP_PATH}`);
          const res = await fetch(ZIP_PATH);
          if (!res.ok) throw new Error(`Failed to fetch ZIP: ${res.status}`);
          const arrayBuffer = await res.arrayBuffer();

          const zip = await JSZip.loadAsync(arrayBuffer);
          for (const filename of Object.keys(zip.files)) {
            const file = zip.files[filename];
            if (file.dir) continue;
            const fileData = await file.async('arraybuffer');
            zipCache.set('/' + filename, new Response(fileData));
            swLog(`Extracted: /${filename} (${fileData.byteLength} bytes)`);
          }
          swLog('Unzip complete');
        }

        if (zipCache.has(relPath)) {
          return zipCache.get(relPath).clone();
        }

        return fetch(event.request);
      } catch (e) {
        swLog(`ZIP fetch/unzip error: ${e}`);
        return fetch(event.request);
      }
    })()
  );
});
