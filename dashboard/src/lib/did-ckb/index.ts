export {
  DID_CKB_MAINNET,
  DID_CKB_TESTNET,
  deploymentForClient,
  didCkbCellDep,
  didCkbTypeScript,
  type DidCkbDeployment,
} from "./deployment";

export { base32Decode, base32Encode } from "./base32";

export {
  argsToDid,
  computeDidArgs,
  didToArgs,
  isDidCkb,
} from "./identifier";

export {
  DidCkbData,
  DidCkbDataV1,
  DidCkbWitness,
  PlcAuthorization,
} from "./molecule";

export {
  buildDocument,
  decodeDocument,
  encodeDocument,
  extractProfile,
  PROFILE_SERVICE_KEY,
  PROFILE_SERVICE_TYPE,
  type DidDocument,
  type Services,
  type VellumProfile,
  type VerificationMethods,
} from "./profile";

export {
  buildCreateTx,
  buildDeactivateTx,
  buildUpdateTx,
  type CreateTxInput,
  type CreateTxResult,
  type UpdateTxInput,
} from "./transactions";

export {
  findDidCell,
  listDidsByLock,
  resolveDid,
  type DidRecord,
} from "./resolver";
