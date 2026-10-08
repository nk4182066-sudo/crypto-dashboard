/**
 * Feature 5 — minimal RFC 6455 WebSocket server.
 *
 * Implemented directly on Node's http upgrade event instead of adding a
 * dependency, so the app keeps its existing dependency footprint. Only the
 * parts the price stream needs are supported: text frames, ping/pong, close,
 * and fragmentation-safe payload assembly.
 */
import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import type { Duplex } from "node:stream";

const GUID = "258EAFA5-E914-47DA-95CA-5AB0DC85B11A";

export interface PriceClient {
  id: number;
  socket: Duplex;
  /** Symbols this client asked to watch. */
  subscriptions: Set<string>;
  alive: boolean;
  send(payload: unknown): void;
  close(code?: number): void;
}

const clients = new Map<number, PriceClient>();
let nextId = 1;

export function clientCount(): number {
  return clients.size;
}

export function allClients(): PriceClient[] {
  return [...clients.values()];
}

/** A detached upgrade socket is a net.Socket; the cast is safe post-handshake. */
function toSocket(socket: Duplex): Socket {
  return socket as Socket;
}

/** Completes the opening handshake. Returns null when the request is not a valid WS upgrade. */
export function acceptUpgrade(request: IncomingMessage, socket: Duplex): PriceClient | null {
  const key = request.headers["sec-websocket-key"];
  // RFC 6455 requires this header on any real upgrade request.
  if (typeof key !== "string" || !key) return null;

  const accept = createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n"),
  );
  toSocket(socket).setNoDelay(true);

  const id = nextId++;
  const client: PriceClient = {
    id,
    socket,
    subscriptions: new Set<string>(),
    alive: true,
    send(payload) {
      const body = Buffer.from(JSON.stringify(payload), "utf8");
      socket.write(encodeFrame(0x1, body));
    },
    close(code = 1000) {
      try {
        const reason = Buffer.alloc(2);
        reason.writeUInt16BE(code, 0);
        socket.write(encodeFrame(0x8, reason));
      } catch {
        // Socket already gone; nothing to signal.
      }
      socket.end();
      clients.delete(id);
    },
  };

  clients.set(id, client);
  socket.on("close", () => clients.delete(id));
  socket.on("error", () => {
    clients.delete(id);
    socket.destroy();
  });

  let buffer = Buffer.alloc(0);
  let fragments: Buffer[] = [];

  socket.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    // A frame may arrive split across TCP packets, so drain only whole frames.
    while (true) {
      const frame = decodeFrame(buffer);
      if (!frame) break;
      buffer = buffer.subarray(frame.consumed);

      if (frame.opcode === 0x8) {
        client.close(frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 1000);
        return;
      }
      if (frame.opcode === 0x9) {
        socket.write(encodeFrame(0xA, frame.payload));
        continue;
      }
      if (frame.opcode === 0xA) {
        client.alive = true;
        continue;
      }

      if (frame.opcode === 0x0) fragments.push(frame.payload);
      else fragments = [frame.payload];

      if (frame.fin) {
        const text = Buffer.concat(fragments).toString("utf8");
        fragments = [];
        handleClientMessage(client, text);
      }
    }
  });

  return client;
}

function handleClientMessage(client: PriceClient, raw: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    client.send({ type: "error", message: "Invalid JSON" });
    return;
  }
  if (!parsed || typeof parsed !== "object") return;
  const message = parsed as { type?: string; symbols?: unknown };

  if (message.type === "subscribe" && Array.isArray(message.symbols)) {
    for (const symbol of message.symbols) {
      if (typeof symbol === "string" && symbol.trim()) client.subscriptions.add(symbol.trim().toUpperCase());
    }
    client.send({ type: "subscribed", symbols: [...client.subscriptions] });
    return;
  }

  if (message.type === "unsubscribe") {
    client.subscriptions.clear();
    client.send({ type: "subscribed", symbols: [] });
    return;
  }

  if (message.type === "ping") {
    client.send({ type: "pong", at: Date.now() });
  }
}

/** Broadcasts a payload to every client watching at least one of the symbols. */
export function broadcast(symbols: readonly string[], payload: unknown): number {
  const keys = new Set(symbols.map((symbol) => symbol.toUpperCase()));
  let sent = 0;
  for (const client of allClients()) {
    if (![...client.subscriptions].some((symbol) => keys.has(symbol))) continue;
    client.send(payload);
    sent += 1;
  }
  return sent;
}

/** Drops sockets that stopped answering pings, so dead clients do not pile up. */
export function heartbeat(): void {
  for (const client of allClients()) {
    if (!client.alive) {
      client.close(1001);
      continue;
    }
    client.alive = false;
    try {
      client.socket.write(encodeFrame(0x9, Buffer.alloc(0)));
    } catch {
      clients.delete(client.id);
      client.socket.destroy();
    }
  }
}

/** Encodes one server-to-client frame (never masked, per spec). */
function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length;
  let header: Buffer;

  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  header[0] = 0x80 | opcode; // FIN + opcode
  return Buffer.concat([header, payload]);
}

interface DecodedFrame {
  fin: boolean;
  opcode: number;
  payload: Buffer;
  consumed: number;
}

/** Decodes one client-to-server frame, or null when more bytes are needed. */
function decodeFrame(buffer: Buffer): DecodedFrame | null {
  if (buffer.length < 2) return null;

  const first = buffer[0];
  const second = buffer[1];
  const fin = (first & 0x80) !== 0;
  const opcode = first & 0x0f;
  const masked = (second & 0x80) !== 0;
  let length = second & 0x7f;
  let offset = 2;

  if (length === 126) {
    if (buffer.length < offset + 2) return null;
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) return null;
    length = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }

  let mask: Buffer | null = null;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    mask = buffer.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + length) return null;

  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (mask) {
    for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
  }

  return { fin, opcode, payload, consumed: offset + length };
}