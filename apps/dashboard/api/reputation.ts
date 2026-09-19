import { handleReputationRequest } from "../server/reputation/http.js";

export default {
  fetch(request: Request): Response | Promise<Response> {
    return handleReputationRequest(request);
  },
};
