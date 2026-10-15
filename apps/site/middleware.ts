import { applyProfileMetadata, profileMetadataFromPath } from "./src/lib/profile-metadata";

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function renderProfileShell(
  request: Request,
  fetchImplementation: FetchImplementation = globalThis.fetch,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }

  const requestUrl = new URL(request.url);
  const shellResponse = await fetchImplementation(new URL("/index.html", requestUrl));
  if (!shellResponse.ok) return shellResponse;

  const html = applyProfileMetadata(
    await shellResponse.text(),
    profileMetadataFromPath(requestUrl.pathname),
  );
  const headers = new Headers(shellResponse.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("etag");
  headers.delete("last-modified");
  headers.set("content-type", "text/html; charset=utf-8");

  return new Response(request.method === "HEAD" ? null : html, {
    status: shellResponse.status,
    headers,
  });
}

export default function middleware(request: Request): Promise<Response> {
  return renderProfileShell(request);
}

export const config = {
  matcher: ["/profile", "/profile/:path*"],
};
