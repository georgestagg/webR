import { ChannelMain } from './chan/channel';
import { Message } from './chan/message';
import { FSNode, WebROptions } from './utils';
import { createRProxy, RProxy, isRProxy } from './proxy';
import { RTargetType, RCodeObj } from './sexp';

export class WebR {
  #chan;

  constructor(options: WebROptions = {}) {
    this.#chan = new ChannelMain('./webr-worker.js', options);
  }

  async init() {
    return await this.#chan.initialised;
  }

  async read(): Promise<Message> {
    return await this.#chan.read();
  }

  write(msg: Message) {
    this.#chan.write(msg);
  }
  writeConsole(input: string) {
    this.write({ type: 'stdin', data: input });
  }

  async putFileData(name: string, data: Uint8Array) {
    const msg = { type: 'putFileData', data: { name: name, data: data } };
    await this.#chan.request(msg);
  }
  async getFileData(name: string): Promise<Uint8Array> {
    return (await this.#chan.request({ type: 'getFileData', data: { name: name } })) as Uint8Array;
  }
  async getFSNode(path: string): Promise<FSNode> {
    return (await this.#chan.request({ type: 'getFSNode', data: { path: path } })) as FSNode;
  }

  evalRCode(code: string, envProxy?: RProxy): RProxy {
    if (envProxy && !isRProxy(envProxy)) {
      throw new Error('The envProxy object passed to evalRCode is not an RProxy object');
    }
    const RObj: RCodeObj = {
      obj: {
        code: code,
        env: envProxy ? envProxy._target : undefined,
      },
      type: RTargetType.CODE,
    };
    return createRProxy(this.#chan, RObj);
  }
}
