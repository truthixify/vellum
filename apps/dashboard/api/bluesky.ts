import { handleBlueskyRequest } from "../server/verification/bluesky-http.js";

export default {
  fetch(request: Request): Response | Promise<Response> {
    return handleBlueskyRequest(request);
  },
};
