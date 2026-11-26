import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ClaimPayloadFields } from "./ClaimPayloadFields";

test("renders integer identifiers as exact text instead of number steppers", () => {
  const markup = renderToStaticMarkup(
    <ClaimPayloadFields
      schema={{
        type: "object",
        properties: { user_id: { type: "integer", minimum: 1 } },
        required: ["user_id"],
      }}
      value={{ user_id: "9000000001" }}
      errors={{}}
      onChange={() => undefined}
    />,
  );

  expect(markup).toContain('id="claim-user_id"');
  expect(markup).toContain('type="text"');
  expect(markup).toContain('inputMode="numeric"');
  expect(markup).toContain('pattern="-?[0-9]*"');
  expect(markup).toContain('value="9000000001"');
  expect(markup).not.toContain('type="number"');
});

test("renders numeric schema constants as read-only text", () => {
  const markup = renderToStaticMarkup(
    <ClaimPayloadFields
      schema={{
        type: "object",
        properties: { anchor_version: { const: 2, type: "integer" } },
        required: ["anchor_version"],
      }}
      value={{ anchor_version: "2" }}
      errors={{}}
      onChange={() => undefined}
    />,
  );

  expect(markup).toContain('id="claim-anchor_version"');
  expect(markup).toContain('value="2"');
  expect(markup).toContain('readOnly=""');
});
