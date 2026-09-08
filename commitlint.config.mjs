const conventionalHeader =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9][a-z0-9._/-]*\))?!?: \S/;

const imperativeHeader =
  /^(Add|Align|Build|Bump|Clean|Configure|Correct|Create|Disable|Document|Drop|Enable|Extract|Fix|Harden|Implement|Improve|Introduce|Migrate|Move|Pin|Polish|Prepare|Publish|Refactor|Release|Remove|Rename|Replace|Restore|Revert|Simplify|Split|Support|Test|Update|Upgrade|Use|Validate|Wire)\b/;

const forbiddenTrailer = /^(Co-Authored-By|Signed-off-by|Generated-by|Assisted-by):/im;

export default {
  ignores: [(message) => /^Merge\b/.test(message) || /^Revert "/.test(message)],
  plugins: [
    {
      rules: {
        "vellum-header-style": ({ header = "" }) => [
          conventionalHeader.test(header) || imperativeHeader.test(header),
          "start with an imperative verb or use a conventional commit prefix",
        ],
        "vellum-no-attribution": ({ raw = "" }) => [
          !forbiddenTrailer.test(raw),
          "do not add attribution or sign-off trailers",
        ],
      },
    },
  ],
  rules: {
    "header-max-length": [2, "always", 72],
    "header-min-length": [2, "always", 5],
    "vellum-header-style": [2, "always"],
    "vellum-no-attribution": [2, "always"],
  },
};
