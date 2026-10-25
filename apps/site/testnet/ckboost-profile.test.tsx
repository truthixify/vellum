import { expect, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";
import { ckboostQuestSchema, parseCkboostQuestClaimPayload } from "@vellum/schemas";
import {
  CKBOOST_VERIFIED_PARTNER,
  scoreReputation,
  VELLUM_REPUTATION_POLICY_V7,
} from "@vellum/scoring";
import { renderToStaticMarkup } from "react-dom/server";

import { ClaimPayloadRenderer } from "../src/components/ClaimRenderer";
import { profilePath } from "../src/lib/profile-route";
import { loadPublicProfile } from "../src/lib/public-profile";

const FIXTURE = {
  subjectDid: "did:ckb:omdrzidnxy3lrdrwc6bo4sll6zljhuar",
  issuerDid: "did:ckb:tlitdhrdn7wdzmktk3kzhfua3ivpgiq2",
  schemaHash: "0x6f0fe424320c73627ac544d6666841623c2b15b88ffc93818dc9f78752dd8fae",
  subjectLockHash: "0x109c250d0eb41bb5956b2031bb6f1aa7194b83d3e0bc158f36181908059fe608",
  transactionHash: "0x83f547f606bce2d6163e997eff45463f09956725e9217c88c1e97a52e7c3e1f2",
  blockNumber: 22_851_420n,
  outputIndex: 0n,
  claimId: "0x015f760b79be6f81444e7338a306db9b0dcb814052740e3fc33eaf79c06d226e",
  nonce: "0x662ddc61e6a4950a79be3667d41211508f6130d76f8ce1c50795cc3e95c63a50",
  issuedAt: 1_792_878_452n,
  capacity: 73_800_000_000n,
  transactionFee: 44_219n,
  completionKey:
    "0x3aee953b010d5861b521017839e9f137047756b81bbc1ac78d13d5c6e9f5c9ad:1:0x6c148f1b1a6f989a66550357bd922bf5279be427dd6d909ba917dd62ed1b0f8d",
  issuerIdentityOutPoint: {
    txHash: "0x7b848e46846536c837b9840c52b76de1e5d6cabdd92e59cf0acc21d17fcba2a0",
    index: 0n,
  },
  payload: {
    quest_id: 1,
    quest_title: "Send the Vellum Dashboard Link",
    completed_at: 1_792_878_362,
    campaign_title: "Vellum Test Campaign",
    points_awarded: "10",
    approval_tx_hash: "0x2cf616b312036b6daeec1426123900be80eb1b5293ca57fcff58dad632ef9331",
    campaign_type_id: "0x3aee953b010d5861b521017839e9f137047756b81bbc1ac78d13d5c6e9f5c9ad",
    ckboost_user_type_id: "0x6c148f1b1a6f989a66550357bd922bf5279be427dd6d909ba917dd62ed1b0f8d",
    reward_claim_tx_hash: "0x3349c6bae7a6776036840bf5cb0cf026287ac0af8872e343dd3327b1d4704110",
  },
} as const;

const CKB_RPC_URL = process.env.CKB_RPC_URL ?? "https://testnet.ckbapp.dev";
const PROFILE_ORIGIN = (process.env.VELLUM_PROFILE_ORIGIN ?? "https://usevellum.xyz").replace(
  /\/+$/,
  "",
);

test("serves the confirmed CKBoost subject through a direct profile load", async () => {
  const path = profilePath(FIXTURE.subjectDid);
  const response = await fetch(`${PROFILE_ORIGIN}${path}`);

  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain("<title>Public did:ckb profile | Vellum</title>");
  expect(html).toContain(`<link rel="canonical" href="https://usevellum.xyz${path}" />`);
}, 30_000);

test("reads, renders, and scores the confirmed CKBoost Claim Cell exactly once", async () => {
  const client = new ccc.ClientPublicTestnet({
    url: CKB_RPC_URL,
    fallbacks: [],
    timeout: 20_000,
  });
  const profile = await loadPublicProfile(FIXTURE.subjectDid, {
    createClient: () => client,
    timeoutMs: 30_000,
  });

  expect(profile.status).toBe("available");
  if (profile.status !== "available") throw new Error("Testnet profile is unavailable");
  expect(profile.identity.did).toBe(FIXTURE.subjectDid);
  expect(profile.claims.status).toBe("available");
  if (profile.claims.status !== "available") throw new Error(profile.claims.message);
  expect(profile.claims.value.invalid).toEqual([]);

  const claim = profile.claims.value.claims.find(
    ({ cell }) =>
      cell.outPoint.txHash === FIXTURE.transactionHash &&
      cell.outPoint.index === FIXTURE.outputIndex,
  );
  expect(CKBOOST_VERIFIED_PARTNER.issuerDid).toBe(FIXTURE.issuerDid);
  expect(ckboostQuestSchema.hash).toBe(FIXTURE.schemaHash);
  expect(claim).toBeDefined();
  expect(claim).toMatchObject({
    claimId: FIXTURE.claimId,
    issuerDid: FIXTURE.issuerDid,
    schemaHash: FIXTURE.schemaHash,
    subjectLockHash: FIXTURE.subjectLockHash,
    nonce: FIXTURE.nonce,
    issuedAt: FIXTURE.issuedAt,
    payload: FIXTURE.payload,
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
    },
  });
  expect(claim?.duplicateCells).toEqual([]);
  expect(claim?.issuerState.status).toBe("active");
  if (!claim || claim.issuerState.status !== "active") {
    throw new Error("Confirmed CKBoost claim or issuer is unavailable");
  }
  expect(claim.issuerState.cell.outPoint).toEqual(
    ccc.OutPoint.from(FIXTURE.issuerIdentityOutPoint),
  );
  expect(parseCkboostQuestClaimPayload(claim.payload)).toEqual(FIXTURE.payload);

  const completionKey = [
    FIXTURE.payload.campaign_type_id,
    FIXTURE.payload.quest_id,
    FIXTURE.payload.ckboost_user_type_id,
  ].join(":");
  expect(completionKey).toBe(FIXTURE.completionKey);
  expect(
    profile.claims.value.claims.filter(({ issuerDid, schemaHash, payload }) => {
      if (issuerDid !== FIXTURE.issuerDid || schemaHash !== FIXTURE.schemaHash) return false;
      const completion = parseCkboostQuestClaimPayload(payload);
      return (
        [completion.campaign_type_id, completion.quest_id, completion.ckboost_user_type_id].join(
          ":",
        ) === FIXTURE.completionKey
      );
    }),
  ).toHaveLength(1);

  const transaction = await client.getTransaction(FIXTURE.transactionHash);
  expect(transaction?.status).toBe("committed");
  expect(transaction?.blockNumber).toBe(FIXTURE.blockNumber);
  if (!transaction || transaction.status !== "committed") {
    throw new Error("Confirmed CKBoost transaction is unavailable");
  }
  const claimOutput = transaction.transaction.outputs[Number(FIXTURE.outputIndex)];
  const claimData = transaction.transaction.outputsData[Number(FIXTURE.outputIndex)];
  expect(claimOutput.capacity).toBe(FIXTURE.capacity);
  expect(
    ccc.CellOutput.from({ capacity: 0n, lock: claimOutput.lock, type: claimOutput.type }, claimData)
      .capacity,
  ).toBe(FIXTURE.capacity);

  const inputCapacity = (
    await Promise.all(
      transaction.transaction.inputs.map(async ({ previousOutput }) => {
        const previous = await client.getTransaction(previousOutput.txHash);
        if (!previous || previous.status !== "committed") {
          throw new Error(`Claim input ${previousOutput.txHash} is unavailable`);
        }
        return previous.transaction.outputs[Number(previousOutput.index)].capacity;
      }),
    )
  ).reduce((total, capacity) => total + capacity, 0n);
  expect(inputCapacity - transaction.transaction.getOutputsCapacity()).toBe(FIXTURE.transactionFee);

  const rendered = renderToStaticMarkup(<ClaimPayloadRenderer claim={claim} />);
  expect(rendered).toContain(FIXTURE.payload.quest_title);
  expect(rendered).toContain(FIXTURE.payload.campaign_title);
  expect(rendered).toContain(FIXTURE.payload.points_awarded);
  expect(rendered).toContain(FIXTURE.payload.approval_tx_hash);
  expect(rendered).toContain(FIXTURE.payload.reward_claim_tx_hash);

  const reputation = scoreReputation({
    claims: profile.claims.value,
    evaluatedAt: Math.floor(Date.now() / 1_000),
  });
  expect(reputation).toMatchObject({
    status: "available",
    policyVersion: VELLUM_REPUTATION_POLICY_V7.version,
    overall: { score: 20 },
    evidence: [
      {
        claim: {
          claimId: FIXTURE.claimId,
          transactionHash: FIXTURE.transactionHash,
          outputIndex: Number(FIXTURE.outputIndex),
        },
        issuerDid: FIXTURE.issuerDid,
        schemaHash: FIXTURE.schemaHash,
        ckboostQuest: {
          registryVersion: "ckboost.eligible-quests.v2",
          campaignTypeId: FIXTURE.payload.campaign_type_id,
          campaignTitle: FIXTURE.payload.campaign_title,
          questId: FIXTURE.payload.quest_id,
          questTitle: FIXTURE.payload.quest_title,
          ckboostUserTypeId: FIXTURE.payload.ckboost_user_type_id,
          classification: "contribution",
          completionUnits: 1,
          completedAt: FIXTURE.payload.completed_at,
          approvalTransactionHash: FIXTURE.payload.approval_tx_hash,
          rewardClaimTransactionHash: FIXTURE.payload.reward_claim_tx_hash,
          pointsAwarded: FIXTURE.payload.points_awarded,
        },
        contributions: [
          {
            category: "contribution",
            points: 20,
            ruleId: "ckboost-completion-history.v7",
          },
        ],
      },
    ],
    excludedEvidence: [],
  });
  expect(reputation.status).toBe("available");
  if (reputation.status !== "available") throw new Error(reputation.error.message);
  expect(reputation.categories.find(({ id }) => id === "contribution")?.score).toBe(20);
  expect(reputation.evidence).toHaveLength(1);
}, 60_000);
