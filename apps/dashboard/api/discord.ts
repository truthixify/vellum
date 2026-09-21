import { handleDiscordOAuthRequest } from "../server/verification/discord-http.js";

export default {
  fetch(request: Request): Response | Promise<Response> {
    return handleDiscordOAuthRequest(request);
  },
};
