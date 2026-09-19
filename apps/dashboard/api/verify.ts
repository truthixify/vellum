import { handleVerificationRequest } from "../server/verification/http.js";

export default {
  fetch(request: Request): Response | Promise<Response> {
    return handleVerificationRequest(request);
  },
};
