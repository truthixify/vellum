import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { GOVERNANCE_STEPS, GovernanceSteps } from "@/components/governance/GovernanceSteps";

describe("GovernanceSteps", () => {
  test("marks prior stages complete and the current stage active", () => {
    const markup = renderToStaticMarkup(<GovernanceSteps activeStep={2} />);

    for (const label of GOVERNANCE_STEPS) expect(markup).toContain(label);
    expect(markup).not.toContain("Overview");
    expect(markup.match(/issuance-step--complete/g)).toHaveLength(2);
    expect(markup.match(/issuance-step--active/g)).toHaveLength(1);
    expect(markup).toContain('aria-current="step"');
  });

  test("marks the receipt stage complete after a vote is recorded", () => {
    const markup = renderToStaticMarkup(<GovernanceSteps activeStep={4} />);

    expect(markup.match(/issuance-step--complete/g)).toHaveLength(4);
    expect(markup).not.toContain("aria-current");
  });
});
