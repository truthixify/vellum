import { z } from "zod";

import { GOVERNANCE_API_VERSION, GOVERNANCE_CHOICES } from "../../src/lib/governance-contracts.js";
import { didVerificationSubjectSchema, subjectProofSchema } from "../verification/contracts.js";

const voteIntentSchema = z
  .object({
    version: z.literal(GOVERNANCE_API_VERSION),
    proposalId: z.string().min(1).max(128),
    choice: z.enum(GOVERNANCE_CHOICES),
    subject: didVerificationSubjectSchema,
  })
  .strict();

export const governanceChallengeRequestSchema = voteIntentSchema;
export const governanceVoteRequestSchema = voteIntentSchema
  .extend({ proof: subjectProofSchema })
  .strict();

export type GovernanceChallengeRequest = z.infer<typeof governanceChallengeRequestSchema>;
export type GovernanceVoteRequest = z.infer<typeof governanceVoteRequestSchema>;
