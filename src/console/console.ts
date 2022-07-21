import { WebR } from '../webR/webr-main';

(async () => {
  const webR = new WebR();
  (globalThis as any).webR = webR;

  for (;;) {
    const output = await webR.read();
    if (output.type === 'stdout') {
      console.log(output.data);
    } else if (output.type === 'stderr') {
      console.error(output.data);
    }
  }
})();
