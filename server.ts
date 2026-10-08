import { createServer } from "node:http";
import next from "next";
import { startPriceStream } from "./src/socket/stream.ts";
import { acceptUpgrade, clientCount } from "./src/socket/ws.ts";

/**
 * Custom server that lets Next handle normal HTTP while `/api/stream` is
 * upgraded to a WebSocket. Next's app router cannot bind its own upgrade
 * socket, so the server owns that path and forwards everything else.
 */

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "localhost";
const port = Number(process.env.PORT ?? 3000);

const app = next({ dev, hostname, port, // Match the previous `next dev --webpack` behaviour; the custom
  // server does not pick up the CLI flag on its own.
  turbopack: false });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();
  // Next owns its own upgrade paths (the dev HMR websocket). We forward to it
  // instead of destroying the socket, which is what made hot-reload drop.
  // Must be read after prepare(), otherwise Next throws.
  const handleUpgrade = app.getUpgradeHandler();

  const server = createServer((request, response) => {
    void handle(request, response);
  });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    if (pathname !== "/api/stream") {
      // Not ours — hand it back to Next (dev HMR websocket lives here).
      // Destroying the socket here caused the connection to drop repeatedly
      // on localhost.
      handleUpgrade(request, socket, head);
      return;
    }

    const client = acceptUpgrade(request, socket);
    if (!client) {
      socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    // Feature 5 — greet the client so the UI can confirm it is live.
    client.send({ type: "connected", clientId: client.id, at: Date.now(), clients: clientCount() });
  });

  // Bind explicitly rather than relying on the implicit all-interfaces default,
  // so localhost connections resolve predictably and are not dropped.
  server.listen(port, hostname === "localhost" ? "0.0.0.0" : hostname, () => {
    startPriceStream();
    console.log(`> ready on http://${hostname}:${port} (ws://${hostname}:${port}/api/stream)`);
    if (dev) {
      console.log(`> dev HMR websocket forwarded to Next on this server`);
    }
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});