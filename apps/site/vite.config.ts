import { defineConfig } from "vite";
import type { Connect, Plugin } from "vite";
import react from "@vitejs/plugin-react";

import { handleAvatarRequest } from "./server/avatar";

function installAvatarEndpoint(middlewares: Connect.Server) {
  middlewares.use((incoming, outgoing, next) => {
    const url = new URL(incoming.url ?? "/", "http://localhost:8081");
    if (url.pathname !== "/api/avatar") {
      next();
      return;
    }

    const request = new Request(url, { method: incoming.method });
    void handleAvatarRequest(request)
      .then(async (response) => {
        response.headers.forEach((value, name) => outgoing.setHeader(name, value));
        outgoing.statusCode = response.status;
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      })
      .catch(next);
  });
}

function avatarEndpoint(): Plugin {
  return {
    name: "vellum-avatar-endpoint",
    configureServer(server) {
      installAvatarEndpoint(server.middlewares);
    },
    configurePreviewServer(server) {
      installAvatarEndpoint(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [avatarEndpoint(), react()],
  server: {
    host: true,
    port: 8081,
  },
  preview: {
    host: true,
    port: 8081,
  },
});
