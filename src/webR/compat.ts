interface Process {
  browser: string | undefined;
  release: { [key: string]: string };
}
declare let process: Process;

export const IN_NODE =
  typeof process !== 'undefined' &&
  process.release &&
  process.release.name === 'node' &&
  typeof process.browser === 'undefined';

// Adapted from https://github.com/pyodide/pyodide/blob/main/src/js/compat.ts
export let loadScript: (url: string) => Promise<void>;
if (globalThis.document) {
  loadScript = (url) =>
    new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    });
} else if (globalThis.importScripts) {
  loadScript = async (url) => {
    try {
      if (url.startsWith('http')) {
        const req = new XMLHttpRequest();
        req.open('get', url, true);
        req.onload = function () {
          globalThis.importScripts(URL.createObjectURL(new Blob([req.responseText])));
        };
        req.send();
      } else {
        globalThis.importScripts(url);
      }
    } catch (e) {
      if (e instanceof TypeError) {
        await import(url);
      } else {
        throw e;
      }
    }
  };
} else if (IN_NODE) {
  loadScript = async (url: string) => {
    const nodePathMod = (await import('path')).default;
    await import(nodePathMod.resolve(url));
  };
} else {
  throw new Error('Cannot determine runtime environment');
}
