// MCP's client transport over a TCP socket: the newline-delimited JSON-RPC of its stdio transport (the SDK's own
// ReadBuffer and serializer), one connection for the client's life. A message past the buffer's bound ends it, with
// the buffer's own error, as the stdio transport does.
import { connect, type Socket } from "node:net";
import { ReadBuffer, serializeMessage, type JSONRPCMessage, type Transport } from "@modelcontextprotocol/client";

export interface Address {
  readonly host: string;
  readonly port: number;
}

export class SocketTransport implements Transport {
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?: ((message: JSONRPCMessage) => void) | undefined;
  readonly #address: Address;
  readonly #buffer: ReadBuffer;
  readonly #connectMs: number;
  #socket: Socket | undefined;

  constructor(address: Address, options: { maxBufferSize: number; connectMs: number }) {
    this.#address = address;
    this.#buffer = new ReadBuffer({ maxBufferSize: options.maxBufferSize });
    this.#connectMs = options.connectMs;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.#address.port, this.#address.host);
      this.#socket = socket;
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 30_000);
      socket.setTimeout(this.#connectMs, () => {
        socket.destroy(new Error("connect timeout"));
      });
      socket.once("connect", () => {
        socket.setTimeout(0);
        resolve();
      });
      socket.on("error", (error) => {
        reject(error);
        this.onerror?.(error);
      });
      socket.on("close", () => {
        this.#socket = undefined;
        this.#buffer.clear();
        this.onclose?.();
      });
      socket.on("data", (chunk: Buffer) => {
        try {
          this.#buffer.append(chunk);
        } catch (error) {
          this.onerror?.(error instanceof Error ? error : new Error(String(error)));
          socket.destroy();
          return;
        }
        this.#drain();
      });
    });
  }

  #drain(): void {
    for (;;) {
      try {
        const message = this.#buffer.readMessage();
        if (message === null) return;
        this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.#socket;
      if (socket === undefined) {
        reject(new Error("Not connected"));
        return;
      }
      if (socket.write(serializeMessage(message))) resolve();
      else socket.once("drain", resolve);
    });
  }

  close(): Promise<void> {
    this.#socket?.destroy();
    return Promise.resolve();
  }
}
