import { expect, test } from "bun:test";

test("uses a Vellum focus ring without duplicating invalid borders", async () => {
  const styles = await Bun.file(
    new URL("../../../../packages/ui/src/styles.css", import.meta.url),
  ).text();

  expect(styles.match(/--focus: var\(--primary\);/g)).toHaveLength(2);
  expect(styles).toContain(':where(input, select, textarea)[aria-invalid="true"]');
  expect(styles).toContain("--focus: transparent;");
  expect(styles).toContain("--color-ring: transparent;");
  expect(styles).toContain("border-color: var(--danger);");
});
