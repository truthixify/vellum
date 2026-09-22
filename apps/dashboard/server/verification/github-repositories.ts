export const GITHUB_REPOSITORY_REGISTRY_VERSION = "ckb.public-contributions.v1" as const;

export type TrustedGithubRepository = {
  id: string;
  name: string;
  allowFork?: true;
};

export const TRUSTED_GITHUB_REPOSITORIES = Object.freeze(
  [
    { id: "R_kgDOLw3gsg", name: "ckb-devrel/ccc" },
    { id: "R_kgDOLWvJtg", name: "ckb-devrel/offckb" },
    { id: "R_kgDONRIkCg", name: "ckb-devrel/create-ccc-app" },
    { id: "R_kgDOQUEfHg", name: "ckb-devrel/known-scripts" },
    { id: "R_kgDOMUwF9g", name: "ckb-devrel/ccc-locks" },
    { id: "R_kgDOL3KtKA", name: "ckb-devrel/CKB-Developer-Resource" },
    { id: "R_kgDOMYTTzw", name: "ckb-devrel/ssri-server" },
    { id: "R_kgDOMoZMmw", name: "ckb-devrel/ccc-schedule-send" },
    { id: "R_kgDOM3dfJQ", name: "ckb-devrel/nervdao", allowFork: true },
    { id: "MDEwOlJlcG9zaXRvcnkxNTgyMjUwODg=", name: "nervosnetwork/ckb" },
    { id: "MDEwOlJlcG9zaXRvcnkxNTgzMDM0NTA=", name: "nervosnetwork/ckb-vm" },
    { id: "MDEwOlJlcG9zaXRvcnkyMzEwNjc3MjM=", name: "nervosnetwork/ckb-std" },
    { id: "R_kgDOL8uzRw", name: "nervosnetwork/ckb-testtool" },
    { id: "MDEwOlJlcG9zaXRvcnkxNTIxNzY1NDA=", name: "nervosnetwork/ckb-system-scripts" },
    { id: "MDEwOlJlcG9zaXRvcnkyMTk0Mzk1MTk=", name: "nervosnetwork/ckb-c-stdlib" },
    { id: "MDEwOlJlcG9zaXRvcnkxNTgzMzk0MzY=", name: "nervosnetwork/ckb-cli" },
    { id: "R_kgDOG-lkfA", name: "nervosnetwork/ckb-light-client" },
    { id: "R_kgDOG4ycNg", name: "nervosnetwork/ckb-sdk-rust" },
    { id: "MDEwOlJlcG9zaXRvcnkyMjUwMjM3ODk=", name: "nervosnetwork/ckb-sdk-go" },
    { id: "MDEwOlJlcG9zaXRvcnkxNjI2NTc4MzA=", name: "nervosnetwork/ckb-sdk-java" },
    { id: "MDEwOlJlcG9zaXRvcnkxNjU3NzAxMzc=", name: "nervosnetwork/neuron" },
    { id: "MDEwOlJlcG9zaXRvcnkxOTM0NzU3MjI=", name: "nervosnetwork/molecule" },
    { id: "MDEwOlJlcG9zaXRvcnkzODIyNTI2NDE=", name: "nervosnetwork/sparse-merkle-tree" },
    { id: "MDEwOlJlcG9zaXRvcnkxMjI5MjU0NDc=", name: "nervosnetwork/rfcs" },
    { id: "MDEwOlJlcG9zaXRvcnkyNTQ1NzUwNTc=", name: "nervosnetwork/docs.nervos.org" },
    { id: "R_kgDOLfBviw", name: "nervosnetwork/fiber" },
    { id: "R_kgDOLD1Ywg", name: "nervosnetwork/omnilock" },
    { id: "R_kgDOO4bnhA", name: "nervosnetwork/fiber-docs" },
    { id: "R_kgDOQBTq8Q", name: "nervosnetwork/fiber-py-integration-test" },
    { id: "R_kgDOPT9Rrg", name: "nervosnetwork/fiber-dashboard" },
    { id: "R_kgDOLjcPAQ", name: "nervosnetwork/fiber-scripts" },
    { id: "R_kgDOMoQt3g", name: "nervosnetwork/fiber-sphinx" },
    { id: "R_kgDOJvMJGw", name: "nervosnetwork/ckb-py-integration-test" },
    { id: "R_kgDOOmbyYA", name: "nervosnetwork/ckb-vm-contrib" },
    {
      id: "MDEwOlJlcG9zaXRvcnkyMDc0MzE1ODE=",
      name: "nervosnetwork/ckb-standalone-debugger",
    },
    { id: "R_kgDOLCcj4Q", name: "nervosnetwork/ckb-script-templates" },
    { id: "MDEwOlJlcG9zaXRvcnkxNTk0NTY2MzE=", name: "nervosnetwork/ckb-explorer" },
    {
      id: "MDEwOlJlcG9zaXRvcnkxOTIwNjI3Nzc=",
      name: "nervosnetwork/ckb-explorer-frontend",
    },
    { id: "R_kgDOPo4T-Q", name: "nervosnetwork/ckb-tui" },
    { id: "R_kgDOKPVbdQ", name: "nervosnetwork/ckb-discovery" },
    { id: "R_kgDOLb0J3Q", name: "nervosnetwork/ckb-sync" },
    { id: "R_kgDOKfV5fg", name: "nervosnetwork/ckb-rpc-resources" },
    { id: "R_kgDOK4r0RA", name: "nervosnetwork/ckb-vm-fuzzing-test" },
    { id: "R_kgDOMqX5aQ", name: "nervosnetwork/ckb-contract-tests" },
    { id: "R_kgDOTLRlhA", name: "nervosnetwork/ckb-treasury-lab" },
    { id: "R_kgDOInNUGg", name: "nervosnetwork/CkbGuardian" },
    { id: "R_kgDOKetauA", name: "nervosnetwork/ckb-js-vm" },
    {
      id: "MDEwOlJlcG9zaXRvcnkyNDg0MTAwODI=",
      name: "nervosnetwork/ckb-production-scripts",
    },
    {
      id: "MDEwOlJlcG9zaXRvcnkyMTg3NjA3OTU=",
      name: "nervosnetwork/ckb-miscellaneous-scripts",
    },
    { id: "MDEwOlJlcG9zaXRvcnkyNTMxNjY0MTE=", name: "nervosnetwork/capsule" },
    { id: "R_kgDOLI6YPA", name: "nervosnetwork/anyone-can-pay" },
    { id: "R_kgDOI4vQdg", name: "nervosnetwork/quantum-resistant-lock-script" },
    { id: "MDEwOlJlcG9zaXRvcnkxNzY4NTQxMzI=", name: "nervosnetwork/ckb-sdk-ruby" },
    { id: "R_kgDOH6UBiw", name: "nervosnetwork/ckb-light-test" },
    { id: "MDEwOlJlcG9zaXRvcnkzMzcxNTUyMjk=", name: "nervosnetwork/force-bridge" },
    {
      id: "MDEwOlJlcG9zaXRvcnkyODY5MzEyNTU=",
      name: "nervosnetwork/force-bridge-btc",
    },
    {
      id: "MDEwOlJlcG9zaXRvcnkzMDU2NjI5NTQ=",
      name: "nervosnetwork/force-bridge-eth",
    },
    { id: "MDEwOlJlcG9zaXRvcnkxNjI5OTIyOTE=", name: "nervosnetwork/tentacle", allowFork: true },
    { id: "R_kgDOJ1JJHg", name: "nervosnetwork/ckb-auth", allowFork: true },
    { id: "MDEwOlJlcG9zaXRvcnkxNjQzODQ1Nzc=", name: "ckb-js/ckb-sdk-js" },
    { id: "MDEwOlJlcG9zaXRvcnkyNTM2NzMyMjY=", name: "ckb-js/lumos" },
    { id: "R_kgDOIKaShg", name: "ckb-js/kuai" },
    { id: "MDEwOlJlcG9zaXRvcnkzODYxOTQ2MTE=", name: "ckb-js/ckit" },
    { id: "R_kgDOIifJvg", name: "ckb-js/nexus" },
    { id: "R_kgDOOVoRfw", name: "RGBPlusPlus/rgbpp-sdk", allowFork: true },
    { id: "R_kgDOOVoUbw", name: "RGBPlusPlus/btc-assets-api", allowFork: true },
    { id: "R_kgDONWZKCA", name: "RGBPlusPlus/rgbpp-explorer", allowFork: true },
    { id: "R_kgDOOVoqmQ", name: "RGBPlusPlus/ckb-bitcoin-spv", allowFork: true },
    {
      id: "R_kgDOOVop1g",
      name: "RGBPlusPlus/ckb-bitcoin-spv-contracts",
      allowFork: true,
    },
  ].map((repository) => Object.freeze(repository)),
) as readonly TrustedGithubRepository[];

const TRUSTED_GITHUB_REPOSITORIES_BY_ID = new Map(
  TRUSTED_GITHUB_REPOSITORIES.map((repository) => [repository.id, repository]),
);

export function getTrustedGithubRepository(value: string): TrustedGithubRepository | undefined {
  return TRUSTED_GITHUB_REPOSITORIES_BY_ID.get(value);
}
