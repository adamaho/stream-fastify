import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "stream";
import * as jsonpatch from "fast-json-patch";
import { Http2ServerRequest, Http2ServerResponse } from "node:http2";

const DEFAULT_MAX_LISTENERS = 10;

type RealtimeResponse<T> = {
  data: T;
};

/**
 *
 * Formats the data into the desired response form
 *
 * @param d Data to format
 * @returns An object of data
 */
function formatData(d: any) {
  return { data: d };
}

/**
 * Formats data as json
 *
 * @param d Data to format into json
 * @returns json
 */
function json(d: RealtimeResponse<any[]> | jsonpatch.Operation[]) {
  return `${JSON.stringify(d)}\n`;
}

export class Realtime<RealtimeData = any[]> {
  private data: RealtimeData;
  private emitter: EventEmitter;
  private topic: string;

  constructor(topic: string) {
    this.data = [] as RealtimeData;
    this.emitter = new EventEmitter();
    this.topic = topic;
  }

  /**
   * Increments the max listener count on the event emitter
   */
  private incrementListeners = () => {
    const listeners = this.emitter.listenerCount(this.topic);
    this.emitter.setMaxListeners(
      listeners <= 0 ? DEFAULT_MAX_LISTENERS : listeners + 1
    );
  };

  /**
   * Decrements the max listener count on the event emitter
   */
  private decrementListeners = () => {
    const listeners = this.emitter.listenerCount(this.topic);
    this.emitter.setMaxListeners(
      listeners <= 0 ? DEFAULT_MAX_LISTENERS : listeners - 1
    );
  };

  /**
   * Subscribes to event emitter and streams events to connected client
   *
   * @param req Fastify request object
   * @param res Fastify response object
   */
  public subscribe = async (
    req: Http2ServerRequest,
    res: Http2ServerResponse,
    getData: () => Promise<RealtimeData>
  ) => {
    /**
     * Writes new events to the response stream
     *
     * @param d Data emitted by the event emitter
     */
    const onEvent = (d: jsonpatch.Operation[]) => {
      res.write(json(d));
    };

    /**
     * Closes the client connection and removes the event listener
     */
    const onClose = () => {
      this.decrementListeners();
      this.emitter.removeListener(this.topic, onEvent);
      res.end();
    };

    /**
     * Increments the max listeners
     */
    this.incrementListeners();

    /**
     * Adds a new listener to the topic
     */
    this.emitter.addListener(this.topic, onEvent);

    /**
     * Subscribe to request end event
     */
    req.on("end", () => {
      onClose();
    });

    /**
     * Subscribe to request close event
     */
    req.on("close", () => {
      onClose();
    });

    const data = await getData();

    res.setHeader("Content-Type", "application/json+ndjsonpatch");
    res.setHeader("x-content-type-options", "nosniff");
    res.statusCode = 200;
    res.write(json(formatData(data)));
  };

  /**
   *
   * Publishes data to all subscribers
   *
   * @param d Data to publish
   */
  public publish = (d: RealtimeData) => {
    const patch = jsonpatch.compare(formatData(this.data), formatData(d));
    this.emitter.emit(this.topic, patch);
    this.data = d;
  };
}
