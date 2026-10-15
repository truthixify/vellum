import { handleAvatarRequest } from "../server/avatar.js";

export default {
  fetch(request: Request): Promise<Response> {
    return handleAvatarRequest(request);
  },
};
