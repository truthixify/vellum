export const GITHUB_REPOSITORY_REGISTRY_VERSION = "ckb.public-contributions.v1" as const;

export type TrustedGithubRepository = {
  id: string;
  name: string;
};

export const TRUSTED_GITHUB_REPOSITORIES = Object.freeze(
  [
    { id: "R_kgDOLw3gsg", name: "ckb-devrel/ccc" },
    { id: "R_kgDOLWvJtg", name: "ckb-devrel/offckb" },
    { id: "R_kgDONRIkCg", name: "ckb-devrel/create-ccc-app" },
    { id: "R_kgDOQUEfHg", name: "ckb-devrel/known-scripts" },
    { id: "R_kgDOMUwF9g", name: "ckb-devrel/ccc-locks" },
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
    { id: "MDEwOlJlcG9zaXRvcnkxNjQzODQ1Nzc=", name: "ckb-js/ckb-sdk-js" },
    { id: "MDEwOlJlcG9zaXRvcnkyNTM2NzMyMjY=", name: "ckb-js/lumos" },
    { id: "R_kgDOIKaShg", name: "ckb-js/kuai" },
    { id: "MDEwOlJlcG9zaXRvcnkzODYxOTQ2MTE=", name: "ckb-js/ckit" },
    { id: "R_kgDOIifJvg", name: "ckb-js/nexus" },
  ].map((repository) => Object.freeze(repository)),
) as readonly TrustedGithubRepository[];

const TRUSTED_GITHUB_REPOSITORY_IDS = new Set(
  TRUSTED_GITHUB_REPOSITORIES.map((repository) => repository.id),
);

export function isTrustedGithubRepositoryId(value: string): boolean {
  return TRUSTED_GITHUB_REPOSITORY_IDS.has(value);
}
