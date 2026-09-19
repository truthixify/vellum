import { describe, expect, test } from "bun:test";
import type { ReputationResult } from "@vellum/scoring";

import { handleReputationRequest, reputationSubjectFromUrl } from "./http";
import { InvalidReputationSubjectError, ReputationSubjectNotFoundError } from "./service";

const SUBJECT_DID = "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc";

const available: ReputationResult = {
  status: "available",
  policyVersion: "vellum.reputation.v1",
  evaluatedAt: 2_000_000_000,
  overall: { score: 0, maximum: 1_000 },
  categories: [],
  evidence: [],
  excludedEvidence: [],
};

describe("reputation HTTP boundary", () => {
  test("returns a public cacheable score for a path subject", async () => {
    const response = await handleReputationRequest(
      new Request(`https://dashboard.usevellum.xyz/api/reputation/${SUBJECT_DID}`),
      { scoreSubject: async () => available },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    expect(await response.json()).toEqual({
      ok: true,
      version: "1",
      network: "ckb_testnet",
      subject: SUBJECT_DID,
      ...available,
    });
  });

  test("returns an unavailable result with no partial score", async () => {
    const unavailable: ReputationResult = {
      status: "unavailable",
      policyVersion: "vellum.reputation.v1",
      evaluatedAt: 2_000_000_000,
      error: {
        code: "claim-read-unavailable",
        message: "The complete Testnet claim record could not be read.",
      },
    };
    const response = await handleReputationRequest(
      new Request(`https://dashboard.usevellum.xyz/api/reputation?did=${SUBJECT_DID}`),
      { scoreSubject: async () => unavailable },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      ok: false,
      subject: SUBJECT_DID,
      status: "unavailable",
      error: { code: "claim-read-unavailable" },
    });
  });

  test("handles methods, preflight, and malformed routes deterministically", async () => {
    const method = await handleReputationRequest(
      new Request(`https://dashboard.usevellum.xyz/api/reputation/${SUBJECT_DID}`, {
        method: "POST",
      }),
    );
    const preflight = await handleReputationRequest(
      new Request("https://dashboard.usevellum.xyz/api/reputation", { method: "OPTIONS" }),
    );
    const missing = await handleReputationRequest(
      new Request("https://dashboard.usevellum.xyz/api/reputation"),
    );
    const repeated = await handleReputationRequest(
      new Request(
        `https://dashboard.usevellum.xyz/api/reputation?did=${SUBJECT_DID}&did=${SUBJECT_DID}`,
      ),
    );

    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("GET, OPTIONS");
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(missing.status).toBe(400);
    expect(repeated.status).toBe(400);
  });

  test("maps invalid, missing, and unexpected service failures without leaking details", async () => {
    const request = new Request(`https://dashboard.usevellum.xyz/api/reputation/${SUBJECT_DID}`);
    const invalid = await handleReputationRequest(request, {
      scoreSubject: async () => {
        throw new InvalidReputationSubjectError("Use a canonical did:ckb identifier.");
      },
    });
    const missing = await handleReputationRequest(request, {
      scoreSubject: async () => {
        throw new ReputationSubjectNotFoundError("The identity is not active.");
      },
    });
    const failed = await handleReputationRequest(request, {
      scoreSubject: async () => {
        throw new Error("private RPC detail");
      },
    });

    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("private RPC detail");
  });

  test("extracts only one complete reputation subject", () => {
    expect(
      reputationSubjectFromUrl(
        new Request(`https://dashboard.usevellum.xyz/api/reputation/${SUBJECT_DID}`),
      ),
    ).toBe(SUBJECT_DID);
    expect(
      reputationSubjectFromUrl(
        new Request(`https://dashboard.usevellum.xyz/api/reputation/${SUBJECT_DID}/extra`),
      ),
    ).toBeUndefined();
  });
});
