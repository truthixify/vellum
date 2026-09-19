import { defineConfig } from "vite";
import type { Connect, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { handleReputationRequest } from "./server/reputation/http";
import { handleIssuerRequest } from "./server/verification/http";

function installIssuerEndpoint(middlewares: Connect.Server) {
  middlewares.use("/api/issuer", (incoming, outgoing, next) => {
    const request = new Request("http://localhost/api/issuer", {
      method: incoming.method,
    });
    const response = handleIssuerRequest(request);

    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    outgoing.statusCode = response.status;
    void response
      .text()
      .then((body) => outgoing.end(body))
      .catch(next);
  });
}

function installReputationEndpoint(middlewares: Connect.Server) {
  middlewares.use((incoming, outgoing, next) => {
    const url = new URL(incoming.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/reputation" && !url.pathname.startsWith("/api/reputation/")) {
      next();
      return;
    }

    const request = new Request(url, { method: incoming.method });
    void handleReputationRequest(request)
      .then(async (response) => {
        response.headers.forEach((value, name) => outgoing.setHeader(name, value));
        outgoing.statusCode = response.status;
        outgoing.end(await response.text());
      })
      .catch(next);
  });
}

function issuerEndpoint(): Plugin {
  return {
    name: "vellum-issuer-endpoint",
    configureServer(server) {
      installIssuerEndpoint(server.middlewares);
      installReputationEndpoint(server.middlewares);
    },
    configurePreviewServer(server) {
      installIssuerEndpoint(server.middlewares);
      installReputationEndpoint(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [
    issuerEndpoint(),
    tsconfigPaths(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 8080,
    host: true,
  },
  preview: {
    port: 8080,
    host: true,
  },
});
