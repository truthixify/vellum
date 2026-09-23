import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { GithubIssuedClaims, githubSubmissionReferences } from "./GithubIssuedClaims";
import type { GithubSubmission } from "@/lib/github-verification";

const identityOnly: GithubSubmission = {
  subject: "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp",
  transactionHash: `0x${"11".repeat(32)}`,
  claimId: `0x${"22".repeat(32)}`,
  outputIndex: 1,
  login: "truthixify",
};

describe("GitHub issued claim presentation", () => {
  test("renders an honest identity-only result", () => {
    expect(githubSubmissionReferences(identityOnly)).toHaveLength(1);
    const markup = renderToStaticMarkup(<GithubIssuedClaims submission={identityOnly} />);

    expect(markup).toContain("vellum.social.github.v1");
    expect(markup).toContain("1 Claim Cell");
    expect(markup).not.toContain("vellum.contribution.github.v1");
  });

  test("renders both references from a dual-output result", () => {
    const submission: GithubSubmission = {
      ...identityOnly,
      contribution: {
        claimId: `0x${"33".repeat(32)}`,
        outputIndex: 2,
      },
    };
    expect(githubSubmissionReferences(submission)).toHaveLength(2);
    const markup = renderToStaticMarkup(<GithubIssuedClaims submission={submission} />);

    expect(markup).toContain("vellum.social.github.v1");
    expect(markup).toContain("vellum.contribution.github.v1");
    expect(markup).toContain("2 Claim Cells");
    expect(markup).toContain(submission.claimId);
    expect(markup).toContain(submission.contribution?.claimId ?? "missing");
  });
});
