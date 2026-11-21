import { Check } from "lucide-react";

export const GOVERNANCE_STEPS = ["Identity", "Ballot", "Review", "Receipt"] as const;

export function GovernanceSteps({ activeStep }: { activeStep: number }) {
  return (
    <ol className="issuance-steps governance-steps" aria-label="Vote progress">
      {GOVERNANCE_STEPS.map((label, index) => {
        const complete = index < activeStep;
        const active = index === activeStep;
        return (
          <li
            className={`issuance-step${active ? " issuance-step--active" : ""}${complete ? " issuance-step--complete" : ""}`}
            key={label}
            aria-current={active ? "step" : undefined}
          >
            <span>{complete ? <Check size={13} aria-hidden="true" /> : index + 1}</span>
            <strong>{label}</strong>
          </li>
        );
      })}
    </ol>
  );
}
