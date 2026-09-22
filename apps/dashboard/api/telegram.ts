import { handleTelegramOAuthRequest } from "../server/verification/telegram-http.js";

export default {
  fetch(request: Request): Response | Promise<Response> {
    return handleTelegramOAuthRequest(request);
  },
};
