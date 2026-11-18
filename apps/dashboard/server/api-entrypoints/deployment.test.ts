import { readdirSync } from "node:fs";

import { expect, test } from "bun:test";

test("keeps the Vercel API directory within the serverless function limit", () => {
  const sourceFiles = readdirSync(new URL("../../api/", import.meta.url), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name);

  expect(sourceFiles).not.toContainEqual(expect.stringMatching(/\.test\.ts$/));
  expect(sourceFiles.length).toBeLessThanOrEqual(12);
});
