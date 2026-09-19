import { handleGithubOAuthRequest } from "../server/verification/github-http.js";

export default {
  fetch: handleGithubOAuthRequest,
};
