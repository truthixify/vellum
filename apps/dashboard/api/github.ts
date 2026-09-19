import { handleGithubOAuthRequest } from "../server/verification/github-http";

export default {
  fetch: handleGithubOAuthRequest,
};
