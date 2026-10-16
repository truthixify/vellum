export type CkboostQuestClassification = "participation" | "contribution" | "delivery";

export type CkboostEligibleQuest = {
  campaignTypeId: `0x${string}`;
  campaignTitle: string;
  questId: number;
  questTitle: string;
  classification: CkboostQuestClassification;
};

const CKBOOST_CONTROLLER_SNAPSHOT = Object.freeze({
  codeHash: "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb",
  hashType: "type" as const,
  args: "0x12e432ac2d3d5ad95157dca7c85be7865047baa79000",
});

export const CKBOOST_VERIFIED_PARTNER = Object.freeze({
  id: "ckboost",
  name: "CKBoost",
  network: "ckb_testnet" as const,
  issuerDid: "did:ckb:tlitdhrdn7wdzmktk3kzhfua3ivpgiq2",
  controllerPolicy: "resolve-live-did" as const,
  verificationSnapshot: Object.freeze({
    didOutput: Object.freeze({
      transactionHash: "0x7b848e46846536c837b9840c52b76de1e5d6cabdd92e59cf0acc21d17fcba2a0",
      outputIndex: 0,
    }),
    controllerLock: CKBOOST_CONTROLLER_SNAPSHOT,
  }),
});

export const VERIFIED_REPUTATION_PARTNERS = Object.freeze([CKBOOST_VERIFIED_PARTNER]);

function quest(entry: CkboostEligibleQuest): Readonly<CkboostEligibleQuest> {
  return Object.freeze(entry);
}

export const CKBOOST_QUEST_REGISTRY = Object.freeze({
  version: "ckboost.eligible-quests.v1",
  quests: Object.freeze([
    quest({
      campaignTypeId: "0x775802a38a6d67ab1351ae5d676adeb6e72e041d39c041dff4e901d0ae27f0bc",
      campaignTitle: "Claw & Order: CKB AI Agent Hackathon",
      questId: 1,
      questTitle: "Register",
      classification: "participation",
    }),
    quest({
      campaignTypeId: "0x775802a38a6d67ab1351ae5d676adeb6e72e041d39c041dff4e901d0ae27f0bc",
      campaignTitle: "Claw & Order: CKB AI Agent Hackathon",
      questId: 2,
      questTitle: "Share project details",
      classification: "contribution",
    }),
    quest({
      campaignTypeId: "0x775802a38a6d67ab1351ae5d676adeb6e72e041d39c041dff4e901d0ae27f0bc",
      campaignTitle: "Claw & Order: CKB AI Agent Hackathon",
      questId: 3,
      questTitle: "Project submission",
      classification: "delivery",
    }),
    quest({
      campaignTypeId: "0x8d559528984762ea54f7b6f7286921399d71e63f71d9d32847d5a59b17f5c6ab",
      campaignTitle: "Build on CKB: Campaign #01",
      questId: 1,
      questTitle: "Campaign submission",
      classification: "contribution",
    }),
    quest({
      campaignTypeId: "0xad214311b31743725c1e459f40d26a101cc99d35922cb16e663d117927896402",
      campaignTitle: "Build on CKB: Campaign #02",
      questId: 1,
      questTitle: "Campaign submission",
      classification: "contribution",
    }),
    quest({
      campaignTypeId: "0x3ba194e011b30817dfaf38bab946f55357a8bb32ef7dd1bbcf0608a59a132e6d",
      campaignTitle: "Gone in 60ms: Fiber Network Infrastructure Hackathon",
      questId: 1,
      questTitle: "Registration",
      classification: "participation",
    }),
    quest({
      campaignTypeId: "0x3ba194e011b30817dfaf38bab946f55357a8bb32ef7dd1bbcf0608a59a132e6d",
      campaignTitle: "Gone in 60ms: Fiber Network Infrastructure Hackathon",
      questId: 2,
      questTitle: "Share project details",
      classification: "contribution",
    }),
    quest({
      campaignTypeId: "0x3ba194e011b30817dfaf38bab946f55357a8bb32ef7dd1bbcf0608a59a132e6d",
      campaignTitle: "Gone in 60ms: Fiber Network Infrastructure Hackathon",
      questId: 3,
      questTitle: "Project submission",
      classification: "delivery",
    }),
    quest({
      campaignTypeId: "0x50cc9ec8607c176fe39b20e6f73be4921180eccb2ffa761c4bdab0762e279e7c",
      campaignTitle: "Build on CKB: Campaign #03",
      questId: 1,
      questTitle: "Campaign submission",
      classification: "contribution",
    }),
    quest({
      campaignTypeId: "0xee1929c3e98173b66daa995959488cbe1538e9105c6924c1d25167037e555ff4",
      campaignTitle: "Build on CKB: Campaign #04",
      questId: 1,
      questTitle: "Campaign submission",
      classification: "contribution",
    }),
    quest({
      campaignTypeId: "0x73a64f3b6478f8d99d58cce7d4addba63a5ba313db592871b0860925135b1d34",
      campaignTitle: "Build on CKB: Campaign #05",
      questId: 1,
      questTitle: "Campaign submission",
      classification: "contribution",
    }),
    quest({
      campaignTypeId: "0x17b5544a75dd27942ef41af3bfe151f0fe55a67d1cbc45b3f4c3acaf94e0a607",
      campaignTitle: "Build on CKB: Campaign #06",
      questId: 1,
      questTitle: "Campaign submission",
      classification: "contribution",
    }),
  ]),
});

export const CKBOOST_HISTORY_SCORING = Object.freeze({
  completionUnits: Object.freeze({
    participation: 0,
    contribution: 1,
    delivery: 2,
  }),
  depthPointsPerUnit: 10,
  depthUnitCap: 5,
  breadthPointsPerCampaign: 10,
  breadthCampaignCap: 5,
  maximum: 100,
});

export function scoreCkboostQuestHistory(
  totalCompletionUnits: number,
  distinctCampaigns: number,
): number {
  if (
    !Number.isSafeInteger(totalCompletionUnits) ||
    totalCompletionUnits < 0 ||
    !Number.isSafeInteger(distinctCampaigns) ||
    distinctCampaigns < 0
  ) {
    throw new TypeError("CKBoost history inputs must be non-negative safe integers");
  }
  return (
    CKBOOST_HISTORY_SCORING.depthPointsPerUnit *
      Math.min(totalCompletionUnits, CKBOOST_HISTORY_SCORING.depthUnitCap) +
    CKBOOST_HISTORY_SCORING.breadthPointsPerCampaign *
      Math.min(distinctCampaigns, CKBOOST_HISTORY_SCORING.breadthCampaignCap)
  );
}

export function ckboostQuestKey(campaignTypeId: string, questId: number): string {
  return `${campaignTypeId}:${questId}`;
}
