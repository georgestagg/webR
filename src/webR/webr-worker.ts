import { BASE_URL, PKG_BASE_URL } from './config';
import { loadScript } from './compat';
import { ChannelWorker } from './chan/channel';
import { Message, Request, newResponse } from './chan/message';
import { FSNode, WebROptions, Module, XHRResponse } from './utils';
import { RawTypes, RSexp, RTargetObj, RTargetType, RRawObj, RSexpPtr, SexpType } from './sexp';
import { IN_NODE } from './compat';

let initialised = false;

const onmessage = function (ev: MessageEvent) {
  let msg = ev.data as Message;
  if (IN_NODE) {
    msg = ev;
  }
  if (!msg || !msg.data || !msg.type || msg.type !== 'init') {
    return;
  }
  if (initialised) {
    throw new Error("Can't initialise worker multiple times.");
  }

  init(msg.data as WebROptions);
  initialised = true;
};

if (IN_NODE) {
  require('worker_threads').parentPort.on('message', onmessage);
} else {
  globalThis.onmessage = onmessage;
}

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
let _config: Required<WebROptions>;

function inputOrDispatch(chan: ChannelWorker): string {
  for (;;) {
    // This blocks the thread until a response
    const msg: Message = chan.read();

    switch (msg.type) {
      case 'stdin':
        return msg.data as string;

      case 'request': {
        const req = msg as Request;
        const reqMsg = req.data.msg;

        const write = (resp: any, transferables?: [Transferable]) =>
          chan.write(newResponse(req.data.uuid, resp, transferables));
        switch (reqMsg.type) {
          case 'putFileData': {
            // FIXME: Use a replacer + reviver to transfer Uint8Array
            const data = Uint8Array.from(Object.values(reqMsg.data.data as ArrayLike<number>));
            write(putFileData(reqMsg.data.name as string, data));
            continue;
          }
          case 'getFileData': {
            const out = getFileData(reqMsg.data.name as string);
            write(out, [out.buffer]);
            continue;
          }
          case 'getFSNode':
            write(getFSNode(reqMsg.data.path as string));
            continue;
          case 'getRObj': {
            const data = reqMsg.data as {
              target: RTargetObj;
              path: string[];
              args: RTargetObj[];
            };
            write(getRObj(wrapRTargetObj(data.target), data.path, data.args));
            continue;
          }
          case 'setRObj': {
            const data = reqMsg.data as {
              target: RTargetObj;
              path: string[];
              value: RTargetObj;
            };
            write(setRObj(wrapRTargetObj(data.target), data.path, wrapRTargetObj(data.value)));
            continue;
          }
          default:
            throw new Error('Unknown event `' + reqMsg.type + '`');
        }
      }

      default:
        throw new Error('Unknown event `' + msg.type + '`');
    }
  }
}

function isRSexp(value: any): value is RSexp {
  return typeof value === 'object' && 'convertImplicitly' in value && 'type' in value;
}

/**
 * Given a root RSexp object, return the result of walking the given path of
 * properties, optionally calling a function at the end of the path.
 *
 * Returns a RTargetObj containing either a reference to the resulting SEXP
 * object in WASM memory, or the object represented in an equivalent raw
 * JS form.
 *
 * @param {RSexp}  root The root R RSexp object
 * @param {string[]} [path] List of properties to iteratively navigate
 * @param {RTargetObj[]} [args] List of arguments to call with
 * @return {RTargetObj} The resulting R object
 */
function getRObj(root: RSexp, path: string[], args?: RTargetObj[]): RTargetObj {
  const getProp = (obj: RSexp, prop: string) => {
    if (!isNaN(Number(prop))) {
      return obj.getIdx(Number(prop));
    } else if (prop.startsWith('$')) {
      prop = prop.slice(1);
      if (prop === '') return undefined;
      return obj.getDollar(prop);
    }
    // @ts-expect-error ts(7053)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return obj[prop];
  };

  let ret: RSexpPtr | RRawObj = { obj: undefined, type: RTargetType.RAW };
  try {
    // Navigate the property array and grab the requested RSexp objects
    let res = path.reduce(getProp, root) as RawTypes | RSexp | Function;
    const parent = path.slice(0, -1).reduce(getProp, root) as RawTypes | RSexp;

    // If requested, call the resulting object with the provided arguments
    if (typeof res === 'function' && args) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      res = res.apply(parent, args);
    } else if (isRSexp(res) && args) {
      res = res._call.call(
        parent,
        Array.from({ length: args.length }, (_, idx) => wrapRTargetObj(args[idx]))
      );
    }

    // Return a RSexpPtr reference, or otherwise a raw JS object where
    // implicit conversion is enabled
    if (isRSexp(res) && res.convertImplicitly) {
      ret = { obj: res.toJs(), type: RTargetType.RAW };
    } else if (isRSexp(res)) {
      ret = { obj: res.ptr, type: RTargetType.SEXPPTR };
    } else if (!(typeof res === 'function')) {
      ret = { obj: res, type: RTargetType.RAW };
    } else {
      throw Error('Resulting object cannot be transferred to main thread');
    }
  } catch (e) {
    if (e instanceof Error) {
      console.error(e);
    }
  }
  return ret;
}

/**
 * Given a root RSexp object, walk the given path of properties and set
 * the value of the result, if possible.
 *
 * @param {RSexp}  root The root R RSexp object
 * @param {string[]} [path] List of properties to iteratively navigate
 * @param {RSexp} [value] The R RSexp object to set the value to
 */
function setRObj(root: RSexp, path: string[], value: RSexp) {
  const getProp = (obj: RSexp, prop: string) => {
    if (!isNaN(Number(prop))) {
      return obj.getIdx(Number(prop));
    } else if (prop.startsWith('$')) {
      prop = prop.slice(1);
      return obj.getDollar(prop);
    }
    // @ts-expect-error ts(7053)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return obj[prop];
  };

  try {
    const parent = path.slice(0, -1).reduce(getProp, root);
    let prop = path[path.length - 1];
    if (prop.startsWith('$')) {
      prop = prop.slice(1);
    }
    parent._set(prop, value);
  } catch (e) {
    console.error(e);
  }
}

function evalRCode(code: string, env: RTargetObj | undefined): RSexpPtr {
  const str = Module.allocateUTF8(code);
  const err = Module.allocate(1, 'i32', 0);

  let envObj = RSexp.wrap(RSexp.R_GlobalEnv);
  if (env && env.type === RTargetType.CODE) {
    envObj = wrapRTargetObj(env);
  } else if (env && env.type === RTargetType.SEXPPTR) {
    envObj = RSexp.wrap(env.obj);
  } else if (env) {
    throw new Error('Attempted to eval R code with an invalid raw env argument');
  }
  if (envObj.type !== SexpType.ENVSXP) {
    throw new Error('Attempted to eval R code with an env argument with invalid SEXP type');
  }
  const resultPtr = Module._evalRCode(str, envObj.ptr, err);
  const errValue = getValue(err, 'i32');
  if (errValue) {
    throw Error(`An error occured evaluating R code (${errValue})`);
  }
  Module._free(str);
  Module._free(err);
  return { obj: resultPtr, type: RTargetType.SEXPPTR };
}

function wrapRTargetObj(target: RTargetObj): RSexp {
  try {
    if (target.type === RTargetType.SEXPPTR) {
      return RSexp.wrap(target.obj);
    } else if (target.type === RTargetType.CODE) {
      const res: RSexpPtr = evalRCode(target.obj.code, target.obj.env);
      return RSexp.wrap(res.obj);
    } else if (target.type === RTargetType.RAW) {
      return new RSexp(target);
    }
  } catch (e) {
    if (e instanceof Error) {
      console.error(e);
    }
  }
  return RSexp.wrap(RSexp.R_NilValue);
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
    if (IN_NODE) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      globalThis.FS = Module.FS;
    }

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: next-line
    FS.mkdirTree(_config.homedir);
    FS.chdir(_config.homedir);
    Module.ENV.HOME = _config.homedir;
    Module.ENV = Object.assign(Module.ENV, _config.REnv);
  });

  const chan = new ChannelWorker();

  Module.webr = {
    resolveInit: () => {
      chan.resolve();
    },

    exit: () => {
      chan.write({ type: 'exit' });
    },

    // C code must call `free()` on the result
    readConsole: () => {
      const input = inputOrDispatch(chan);
      return Module.allocateUTF8(input);
    },
  };

  Module.locateFile = (path: string) => _config.WEBR_URL + path;
  Module.downloadFileContent = downloadFileContent;

  Module.print = (text: string) => {
    chan.write({ type: 'stdout', data: text });
  };
  Module.printErr = (text: string) => {
    chan.write({ type: 'stderr', data: text });
  };
  Module.setPrompt = (prompt: string) => {
    chan.write({ type: 'prompt', data: prompt });
  };
  Module.canvasExec = (op: string) => {
    chan.write({ type: 'canvasExec', data: op });
  };

  (globalThis as any).Module = Module;

  // At the next tick, launch the REPL. This never returns.
  setTimeout(() => {
    const scriptSrc = `${_config.WEBR_URL}R.bin.js`;
    loadScript(scriptSrc);
  });
}
