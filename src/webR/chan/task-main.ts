// Original code from Synclink and Comlink. Released under Apache 2.0.

import { Endpoint, SZ_BUF_FITS_IDX, SZ_BUF_SIZE_IDX, generateUUID } from './task-common';

import { sleep } from '../utils';
import { SyncRequestData } from './message';

const encoder = new TextEncoder();

/**
 * Respond to a blocking request. Most of the work has already been done in
 * asynclink, we are just responsible here for getting the return value back to
 * the requester through this slightly convoluted Atomics protocol.
 *
 * @param {Endpoint} endpoint  A message port to receive messages from. Other
 *        thread is blocked, so we can't send messages back.
 * @param {SyncRequestData} data The message that was recieved. We will use it
 *        to read out the buffers to write the answer into. NOTE: requester
 *        owns buffers.
 * @param {any} response The value we want to send back to the requester. We
 *        have to encode it into data_buffer.
 */
export async function syncResponse(endpoint: Endpoint, data: SyncRequestData, response: any) {
  try {
    let { taskId, sizeBuffer, dataBuffer, signalBuffer } = data;
    // console.warn(msg);

    const bytes = encoder.encode(JSON.stringify(response));
    const fits = bytes.length <= dataBuffer.length;

    Atomics.store(sizeBuffer, SZ_BUF_SIZE_IDX, bytes.length);
    Atomics.store(sizeBuffer, SZ_BUF_FITS_IDX, +fits);
    if (!fits) {
      // console.log("      need larger buffer", taskId)
      // Request larger buffer
      const [uuid, dataPromise] = requestResponseMessage(endpoint);

      // Write UUID into dataBuffer so syncRequest knows where to respond to.
      dataBuffer.set(encoder.encode(uuid));
      await signalRequester(signalBuffer, taskId!);

      // Wait for response with new bigger dataBuffer
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      dataBuffer = (await dataPromise).dataBuffer;
    }

    // Encode result into dataBuffer
    dataBuffer.set(bytes);
    Atomics.store(sizeBuffer, SZ_BUF_FITS_IDX, +true);

    // console.log("       signaling completion", taskId)
    await signalRequester(signalBuffer, taskId as number);
  } catch (e) {
    console.warn(e);
  }
}

function requestResponseMessage(ep: Endpoint): [string, Promise<any>] {
  const id = generateUUID();
  return [
    id,
    new Promise((resolve) => {
      ep.addEventListener('message', function l(ev: MessageEvent) {
        if (!ev.data || !ev.data.id || ev.data.id !== id) {
          return;
        }
        ep.removeEventListener('message', l as EventListenerOrEventListenerObject);
        resolve(ev.data);
      } as EventListenerOrEventListenerObject);
      if (ep.start) {
        ep.start();
      }
    }),
  ];
}

async function signalRequester(signalBuffer: Int32Array, taskId: number) {
  const index = (taskId >> 1) % 32;
  let sleepTime = 1;
  while (Atomics.compareExchange(signalBuffer, index + 1, 0, taskId) !== 0) {
    // No Atomics.asyncWait except on Chrome =(
    await sleep(sleepTime);
    if (sleepTime < 32) {
      // exponential backoff
      sleepTime *= 2;
    }
  }
  Atomics.or(signalBuffer, 0, 1 << index);
  Atomics.notify(signalBuffer, 0);
}
