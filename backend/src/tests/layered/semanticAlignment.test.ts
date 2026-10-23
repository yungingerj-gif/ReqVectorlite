import { describe, expect, it } from "vitest";
import {
  buildSemanticsMap,
  obligationSemanticAlignment,
  semanticsStrongEnoughToGate,
} from "../../engine/layered/setLevel/semanticAlignment";
import type { CanonicalRequirement } from "../../engine/layered/types";

function req(id: string, text: string): CanonicalRequirement {
  return {
    id,
    source_text: text,
    normalized_text: text.toLowerCase(),
    explicit_id: true,
    type: "Functional",
  };
}

describe("obligation semantic alignment (beyond lexical overlap)", () => {
  it("scores high when obligations are parallel (same action family)", () => {
    const reqs = [
      req(
        "A",
        "The system shall authenticate users validate sessions using oauth tokens and enforce security policies."
      ),
      req(
        "B",
        "The system shall authenticate users validate sessions using ldap tokens and enforce security policies."
      ),
    ];
    const m = buildSemanticsMap(reqs);
    const sa = m.get("A")!;
    const sb = m.get("B")!;
    expect(semanticsStrongEnoughToGate(sa, sb)).toBe(true);
    expect(obligationSemanticAlignment(sa, sb)).toBeGreaterThanOrEqual(0.25);
  });

  it("scores lower when lexical overlap could mislead but scopes differ", () => {
    const reqs = [
      req("A", "The system shall provide login authentication for end users in the web portal."),
      req("B", "The system shall export telemetry events for monitoring and diagnostics purposes."),
    ];
    const m = buildSemanticsMap(reqs);
    const sa = m.get("A")!;
    const sb = m.get("B")!;
    if (semanticsStrongEnoughToGate(sa, sb)) {
      expect(obligationSemanticAlignment(sa, sb)).toBeLessThanOrEqual(0.25);
    }
  });
});
