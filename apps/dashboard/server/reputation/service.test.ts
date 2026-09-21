import { describe, expect, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";
import type { ReadClaimsProps, ReadClaimsResult } from "@vellum/sdk";

import {
  InvalidReputationSubjectError,
  ReputationSubjectNotFoundError,
  scoreSubjectReputation,
  validateReputationSubject,
  type ReputationServiceDependencies,
} from "./service";

const SUBJECT_DID = "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc";
const CLIENT = {} as ccc.Client;

function dependencies(
  overrides: Partial<ReputationServiceDependencies> = {},
): ReputationServiceDependencies {
  return {
    createClient: () => CLIENT,
    now: () => 2_000_000_000,
    readClaims: async (): Promise<ReadClaimsResult> => ({ claims: [], invalid: [] }),
    resolveDid: async () => ({}),
    ...overrides,
  };
}

describe("reputation service", () => {
  test("resolves a Testnet DID and scores its complete claim scan", async () => {
    let rpcUrl: string | undefined;
    let readProps: ReadClaimsProps | undefined;
    const result = await scoreSubjectReputation(
      SUBJECT_DID,
      { CKB_RPC_URL: "https://rpc.example.test" },
      dependencies({
        createClient: (url) => {
          rpcUrl = url;
          return CLIENT;
        },
        readClaims: async (props) => {
          readProps = props;
          return { claims: [], invalid: [] };
        },
      }),
    );

    expect(rpcUrl).toBe("https://rpc.example.test/");
    expect(readProps).toMatchObject({
      client: CLIENT,
      filter: {
        subject: { did: SUBJECT_DID },
        evaluationTime: 2_000_000_000,
        order: "asc",
      },
    });
    expect(result).toMatchObject({
      status: "available",
      policyVersion: "vellum.reputation.v1",
      evaluatedAt: 2_000_000_000,
      overall: { score: 0, maximum: 1_000 },
    });
  });

  test("rejects malformed and inactive subject identifiers", async () => {
    expect(() => validateReputationSubject("did:ckb:not-valid")).toThrow(
      InvalidReputationSubjectError,
    );
    await expect(
      scoreSubjectReputation(SUBJECT_DID, {}, dependencies({ resolveDid: async () => null })),
    ).rejects.toBeInstanceOf(ReputationSubjectNotFoundError);
  });

  test("returns unavailable instead of a partial score when chain reads fail", async () => {
    const readFailure = await scoreSubjectReputation(
      SUBJECT_DID,
      {},
      dependencies({
        readClaims: async () => {
          throw new Error("partial indexer page");
        },
      }),
    );
    const resolutionFailure = await scoreSubjectReputation(
      SUBJECT_DID,
      {},
      dependencies({
        resolveDid: async () => {
          throw new Error("RPC timeout");
        },
      }),
    );

    expect(readFailure).toEqual(resolutionFailure);
    expect(readFailure).toEqual({
      status: "unavailable",
      policyVersion: "vellum.reputation.v1",
      evaluatedAt: 2_000_000_000,
      error: {
        code: "claim-read-unavailable",
        message: "The complete Testnet claim record could not be read.",
      },
    });
  });
});
