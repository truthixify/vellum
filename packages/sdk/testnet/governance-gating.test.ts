import { expect, test } from "bun:test";

import {
  GITHUB_SCHEMA_HASH,
  LIVE_GITHUB_SUBJECT,
  VELLUM_ISSUER_DID,
} from "../examples/governance/config";
import { checkGithubEligibility } from "../examples/governance/client";
import { GET } from "../examples/governance/server";

test("client and server examples accept the live Testnet GitHub claim", async () => {
  const evaluationTime = BigInt(Math.floor(Date.now() / 1_000));
  expect(await checkGithubEligibility(LIVE_GITHUB_SUBJECT, evaluationTime)).toBe(true);

  const response = await GET(
    new Request(`http://localhost/api/eligibility?did=${encodeURIComponent(LIVE_GITHUB_SUBJECT)}`),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    subjectDid: LIVE_GITHUB_SUBJECT,
    eligible: true,
  });

  expect(VELLUM_ISSUER_DID).toBe("did:ckb:hlvxrdt3e7iwvuxdmbvejp6hc4yoo3no");
  expect(GITHUB_SCHEMA_HASH).toBe(
    "0x25980dec7f198c7b228a621c61b911b8a20c55b340f398e495c4be65aa399f3c",
  );
}, 60_000);

test("server example rejects missing and malformed subjects without a chain read", async () => {
  const missing = await GET(new Request("http://localhost/api/eligibility"));
  const malformed = await GET(new Request("http://localhost/api/eligibility?did=invalid"));

  expect(missing.status).toBe(400);
  expect(await missing.json()).toEqual({ eligible: false, error: "A subject DID is required" });
  expect(malformed.status).toBe(400);
  expect(await malformed.json()).toEqual({ eligible: false, error: "The subject DID is invalid" });
});
