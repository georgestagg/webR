// Original code from Synclink and Comlink. Released under Apache 2.0.

export const SZ_BUF_DOESNT_FIT = 0;
export const SZ_BUF_FITS_IDX = 1;
export const SZ_BUF_SIZE_IDX = 0;

export interface Endpoint extends EventSource {
  postMessage(message: any, transfer?: Transferable[]): void;
  start?: () => void;
}

export interface EventSource {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: {}): void;

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: {}
  ): void;
}

export function toWireValue(value: any): [any, Transferable[]] {
  return [value, transferCache.get(value) || []];
}

const transferCache = new WeakMap<any, Transferable[]>();
export function transfer<T>(obj: T, transfers: Transferable[]): T {
  transferCache.set(obj, transfers);
  return obj;
}

export type UUID = string;

export const UUID_LENGTH = 63;

export function generateUUID(): UUID {
  const result = Array.from({ length: 4 }, randomSegment).join('-');
  if (result.length !== UUID_LENGTH) {
    throw new Error('comlink internal error: UUID has the wrong length');
  }
  return result;
}

function randomSegment() {
  let result = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16);
  const pad = 15 - result.length;
  if (pad > 0) {
    result = Array.from({ length: pad }, () => 0).join('') + result;
  }
  return result;
}
