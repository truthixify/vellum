import { describe, expect, test } from "bun:test";

import {
  BUDGET_ALLOCATIONS,
  GRANT_STAGES,
  GRANT_TOTAL_USD,
  PUBLICLY_RECORDED_PAID_USD,
  RECORDED_PAYMENT_COUNT,
  REMAINING_GRANT_USD,
} from "./grant-transparency";

describe("grant transparency record", () => {
  test("reconciles every stage and allocation to the approved award", () => {
    expect(GRANT_STAGES.reduce((total, stage) => total + stage.allocationUsd, 0)).toBe(
      GRANT_TOTAL_USD,
    );
    expect(BUDGET_ALLOCATIONS.reduce((total, item) => total + item.amountUsd, 0)).toBe(
      GRANT_TOTAL_USD,
    );
    expect(PUBLICLY_RECORDED_PAID_USD).toBe(5_250);
    expect(REMAINING_GRANT_USD).toBe(1_750);
    expect(RECORDED_PAYMENT_COUNT).toBe(3);
  });

  test("keeps milestone and payment evidence public", () => {
    expect(GRANT_STAGES.map((stage) => stage.status)).toEqual([
      "Paid",
      "Paid",
      "Paid",
      "In progress",
    ]);

    for (const stage of GRANT_STAGES) {
      expect(stage.evidence.length).toBeGreaterThan(0);
      expect(stage.evidence.every((item) => item.href.startsWith("https://"))).toBe(true);
    }

    const paidStages = GRANT_STAGES.filter((stage) => stage.status === "Paid");
    expect(paidStages).toHaveLength(RECORDED_PAYMENT_COUNT);

    const paymentTransactions = new Set<string>();
    for (const stage of paidStages) {
      expect(stage.evidence.some((item) => item.label === "Payment record")).toBe(true);
      expect(stage.evidence.some((item) => item.label === "Payment transaction")).toBe(true);
      paymentTransactions.add(
        stage.evidence.find((item) => item.label === "Payment transaction")?.href ?? "",
      );
    }
    expect(paymentTransactions.size).toBe(RECORDED_PAYMENT_COUNT);
  });
});
