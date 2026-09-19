import { handleGithubOAuthRequest } from "../server/verification/github-http.js";

export default {
  fetch(request: Request): Response | Promise<Response> {
    return handleGithubOAuthRequest(request);
  },
};
