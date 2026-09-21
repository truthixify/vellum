import { defineConfig } from "vite";
import type { Connect, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { handleReputationRequest } from "./server/reputation/http";
import { handleDiscordOAuthRequest } from "./server/verification/discord-http";
import { handleGithubOAuthRequest } from "./server/verification/github-http";
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

function installOAuthEndpoints(middlewares: Connect.Server) {
  middlewares.use((incoming, outgoing, next) => {
    const url = new URL(incoming.url ?? "/", "http://localhost:8080");
    const handler = url.pathname.startsWith("/api/verify/github/")
      ? handleGithubOAuthRequest
      : url.pathname.startsWith("/api/verify/discord/")
        ? handleDiscordOAuthRequest
        : undefined;
    if (!handler) {
      next();
      return;
    }

    const chunks: Uint8Array[] = [];
    incoming.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    incoming.on("end", () => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
        else if (value !== undefined) headers.set(name, value);
      }
      const method = incoming.method ?? "GET";
      const body = method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks);
      const request = new Request(url, { method, headers, body });

      void handler(request)
        .then(async (response) => {
          response.headers.forEach((value, name) => outgoing.setHeader(name, value));
          outgoing.statusCode = response.status;
          outgoing.end(await response.text());
        })
        .catch(next);
    });
    incoming.on("error", next);
  });
}

function issuerEndpoint(): Plugin {
  return {
    name: "vellum-issuer-endpoint",
    configureServer(server) {
      installIssuerEndpoint(server.middlewares);
      installReputationEndpoint(server.middlewares);
      installOAuthEndpoints(server.middlewares);
    },
    configurePreviewServer(server) {
      installIssuerEndpoint(server.middlewares);
      installReputationEndpoint(server.middlewares);
      installOAuthEndpoints(server.middlewares);
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
