import { handleGovernanceRequest } from "../server/governance/http.js";

export default {
  fetch(request: Request): Response | Promise<Response> {
    return handleGovernanceRequest(request);
  },
};
