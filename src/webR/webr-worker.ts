import { BASE_URL, PKG_BASE_URL } from './config';
import { loadScript } from './compat';
import { ChannelWorker } from './chan/channel';
import { Message,
         Request,
         newResponse } from './chan/message';
import { convertSEXP } from './sexp';
import { FSNode,
         WebROptions } from './webr-main'


let initialised = false;

self.onmessage = function(ev: MessageEvent) {
  if (!ev || !ev.data || !ev.data.type || ev.data.type != 'init') {
    return;
  }
  if (initialised) {
    throw `Can't initialise worker multiple times.`;
  }

  init(ev.data);
  initialised = true;
}


interface Module extends EmscriptenModule {
  ENV: { [key: string]: string };
  monitorRunDependencies: (n: number) => void;
  noImageDecoding: boolean;
  noAudioDecoding: boolean;
  setPrompt: (prompt: string) => void;
  canvasExec: (op: string) => void;
  downloadFileContent: (URL: string, headers: Array<string>) => XHRResponse;
  _evalRCode: (code: number, errPtr: number) => number;
  // TODO: Namespace all webR properties
  webr: {
    readConsole: () => number;
    resolveInit: () => void;
  };
}

type WebRConfig = {
  RArgs: string[];
  REnv: { [key: string]: string };
  WEBR_URL: string;
  PKG_URL: string;
  homedir: string;
};

type XHRResponse = {
  status: number;
  response: string | ArrayBuffer;
};

const defaultEnv = {
  R_HOME: '/usr/lib/R',
  R_ENABLE_JIT: '0',
};

const defaultOptions = {
  RArgs: [],
  REnv: defaultEnv,
  WEBR_URL: BASE_URL,
  PKG_URL: PKG_BASE_URL,
  homedir: '/home/web_user',
};

const Module = {} as Module;
let _config: WebRConfig;

function inputOrDispatch(chan: ChannelWorker): string {
  while (true) {
    // This blocks the thread until a response
    let msg: Message = chan.read();

    switch (msg.type) {
      case 'stdin':
        return msg.data;

      case 'request':
        let req = msg as unknown as Request;
        let reqMsg = req.data.msg;

        let write = (resp: any, transferables?: [Transferable]) =>
          chan.write(newResponse(req.data.uuid, resp, transferables));
        switch (reqMsg.type) {
          case 'putFileData':
            // FIXME: Use a replacer + reviver to transfer Uint8Array
            let data = Uint8Array.from(Object.values(reqMsg.data.data));
            write(putFileData(reqMsg.data.name, data))
            continue;
          case 'getFileData':
            let out = getFileData(reqMsg.data.name);
            write(out, [out.buffer]);
            continue;
          case 'getFSNode':
            write(getFSNode(reqMsg.data.path));
            continue;
          case 'evalRCode':
            const str = allocateUTF8(reqMsg.data.code);
            const err = allocate(1, 'i32' ,0);
            const resultptr = Module._evalRCode(str, err);
            const errValue = getValue(err, 'i32');
            if (errValue) {
              throw Error(`An error occured evaluating R code (${errValue})`);
            }
            Module._free(str);
            Module._free(err);
            write(convertSEXP(resultptr));
            continue;
          default:
            throw('Unknown event `' + reqMsg.type + '`');
        }

      default:
        throw('Unknown event `' + msg.type + '`');
    }
  }
}

function getFSNode(path: string): FSNode {
  const node = FS.lookupPath(path, {}).node;
  return copyFSNode(node as FSNode);
}

function copyFSNode(obj: FSNode): FSNode {
  const retObj = {
    id: obj.id,
    name: obj.name,
    mode: obj.mode,
    isFolder: obj.isFolder,
    contents: {},
  };
  if (obj.isFolder) {
    retObj.contents = Object.entries(obj.contents).map(([, node]) => copyFSNode(node));
  }
  return retObj;
}

function downloadFileContent(URL: string, headers: Array<string> = []): XHRResponse {
  const request = new XMLHttpRequest();
  request.open('GET', URL, false);
  request.responseType = 'arraybuffer';

  try {
    headers.forEach((header) => {
      const splitHeader = header.split(': ');
      request.setRequestHeader(splitHeader[0], splitHeader[1]);
    });
  } catch {
    const responseText = 'An error occured setting headers in XMLHttpRequest';
    console.error(responseText);
    return { status: 400, response: responseText };
  }

  try {
    request.send(null);
    if (request.status >= 200 && request.status < 300) {
      return { status: request.status, response: request.response as ArrayBuffer };
    } else {
      const responseText = new TextDecoder().decode(request.response as ArrayBuffer);
      console.error(`Error fetching ${URL} - ${responseText}`);
      return { status: request.status, response: responseText };
    }
  } catch {
    return { status: 400, response: 'An error occured in XMLHttpRequest' };
  }
}

function getFileData(name: string): Uint8Array {
  const size = FS.stat(name).size as number;
  const stream = FS.open(name, 'r');
  const buf = new Uint8Array(size);
  FS.read(stream, buf, 0, size, 0);
  FS.close(stream);
  return buf;
}

function putFileData(name: string, data: Uint8Array) {
  FS.createDataFile('/', name, data, true, true, true);
}

function init(options: WebROptions = {}) {
  _config = Object.assign(defaultOptions, options);

  Module.preRun = [];
  Module.arguments = _config.RArgs;
  Module.noExitRuntime = true;
  Module.noImageDecoding = true;
  Module.noAudioDecoding = true;

  Module.preRun.push(() => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: next-line
    FS.mkdirTree(_config.homedir);
    FS.chdir(_config.homedir);
    Module.ENV.HOME = _config.homedir;
    Module.ENV = Object.assign(Module.ENV, _config.REnv);
  });

  let chan = new ChannelWorker();

  Module.webr = {
    resolveInit: () => {
      chan.resolve();
    },

    // C code must call `free()` on the result
    readConsole: () => {
      let input = inputOrDispatch(chan);
      return allocateUTF8(input);
    }
  }

  Module.locateFile = (path: string) => _config.WEBR_URL + path;
  Module.downloadFileContent = downloadFileContent;

  Module.print = (text: string) => {
    chan.write({ type: 'stdout', data: text });
  };
  Module.printErr = async (text: string) => {
    chan.write({ type: 'stderr', data: text });
  };
  Module.setPrompt = (prompt: string) => {
    chan.write({ type: 'prompt', data: prompt });
  };
  Module.canvasExec = (op: string) => {
    chan.write({ type: 'canvasExec', data: op });
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  (globalThis as any).Module = Module;

  // At the next tick, launch the REPL. This never returns.
  setTimeout(() => {
    const scriptSrc = `${_config.WEBR_URL}R.bin.js`;
    loadScript(scriptSrc);
  });
}
