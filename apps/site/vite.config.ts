import { defineConfig } from "vite";
import type { Connect, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

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

function profileBootstrapEntry(): Plugin {
  return {
    name: "vellum-profile-bootstrap-entry",
    transformIndexHtml: {
      order: "post",
      handler(_html, context) {
        let source = "/src/profile-bootstrap.ts";
        if (context.bundle) {
          const entry = Object.values(context.bundle).find(
            (output) =>
              output.type === "chunk" && output.isEntry && output.name === "profile-bootstrap",
          );
          if (!entry) throw new Error("The public profile bootstrap entry was not emitted.");
          source = `/${entry.fileName}`;
        }

        return [
          {
            tag: "script",
            attrs: { type: "module", crossorigin: true, src: source },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  };
}

export default defineConfig({
  plugins: [profileBootstrapEntry(), avatarEndpoint(), react()],
  build: {
    rollupOptions: {
      input: {
        site: fileURLToPath(new URL("./index.html", import.meta.url)),
        "profile-bootstrap": fileURLToPath(new URL("./src/profile-bootstrap.ts", import.meta.url)),
      },
    },
  },
  server: {
    host: true,
    port: 8081,
  },
  preview: {
    host: true,
    port: 8081,
  },
});
