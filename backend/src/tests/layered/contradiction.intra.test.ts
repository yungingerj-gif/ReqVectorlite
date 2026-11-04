import { describe, expect, it } from "vitest";
import { runIntraDeterministicContradictionChecks } from "../../engine/layered/contradiction/intraDeterministic";
import { generateIntraCandidatePairs } from "../../engine/layered/contradiction/pairCandidates";
import { extractRequirementSemantics } from "../../engine/layered/contradiction/semantics";
import type { ContradictionConfig } from "../../engine/layered/config";
import type { CanonicalRequirement } from "../../engine/layered/types";

const testContradictionCfg: ContradictionConfig = {
  intra_pair_budget: 120,
  intra_jaccard_floor: 0.14,
  same_type_bonus: 0.15,
  shared_object_weight: 0.18,
  shared_condition_bonus: 0.2,
  hierarchy_similarity_floor: 0.1,
  hierarchy_pair_budget: 80,
};

describe("intra contradiction deterministic", () => {
  it("flags same-unit upper bounds with different numeric values", () => {
    const a: CanonicalRequirement = {
      id: "FR-1",
      source_text: "Maximum latency shall be 50 ms.",
      normalized_text: "Maximum latency shall be 50 ms.",
      explicit_id: true,
      type: "Performance",
      thresholds: [{ value: "50", unit: "ms", comparator: "maximum" }],
    };
    const b: CanonicalRequirement = {
      id: "FR-2",
      source_text: "Maximum latency shall be 100 ms.",
      normalized_text: "Maximum latency shall be 100 ms.",
      explicit_id: true,
      type: "Performance",
      thresholds: [{ value: "100", unit: "ms", comparator: "maximum" }],
    };
    const sa = extractRequirementSemantics(a);
    const sb = extractRequirementSemantics(b);
    const fs = runIntraDeterministicContradictionChecks(a, b, sa, sb);
    const numeric = fs.filter((f) => f.issue_type === "intra.numeric_conflict");
    expect(numeric.length).toBeGreaterThanOrEqual(1);
    expect(numeric[0]?.severity).toBe("medium");
  });

  it("uses high severity only for incompatible bound pairs (upper vs lower)", () => {
    const a: CanonicalRequirement = {
      id: "FR-MAX",
      source_text: "Maximum latency shall be 100 ms.",
      normalized_text: "Maximum latency shall be 100 ms.",
      explicit_id: true,
      type: "Performance",
      thresholds: [{ value: "100", unit: "ms", comparator: "maximum" }],
    };
    const b: CanonicalRequirement = {
      id: "FR-MIN",
      source_text: "Minimum latency shall be 150 ms.",
      normalized_text: "Minimum latency shall be 150 ms.",
      explicit_id: true,
      type: "Performance",
      thresholds: [{ value: "150", unit: "ms", comparator: "minimum" }],
    };
    const sa = extractRequirementSemantics(a);
    const sb = extractRequirementSemantics(b);
    const fs = runIntraDeterministicContradictionChecks(a, b, sa, sb);
    const numeric = fs.filter((f) => f.issue_type === "intra.numeric_conflict");
    expect(numeric.length).toBeGreaterThanOrEqual(1);
    expect(numeric[0]?.severity).toBe("high");
  });

  it("does not flag numeric clash when actors differ (same unit)", () => {
    const a: CanonicalRequirement = {
      id: "FR-A",
      source_text: "The subsystem shall maximum latency 50 ms.",
      normalized_text: "The subsystem shall maximum latency 50 ms.",
      explicit_id: true,
      type: "Performance",
      actor: "subsystem",
      thresholds: [{ value: "50", unit: "ms", comparator: "maximum" }],
    };
    const b: CanonicalRequirement = {
      id: "FR-B",
      source_text: "The controller shall maximum latency 100 ms.",
      normalized_text: "The controller shall maximum latency 100 ms.",
      explicit_id: true,
      type: "Performance",
      actor: "controller",
      thresholds: [{ value: "100", unit: "ms", comparator: "maximum" }],
    };
    const sa = extractRequirementSemantics(a);
    const sb = extractRequirementSemantics(b);
    const fs = runIntraDeterministicContradictionChecks(a, b, sa, sb);
    expect(fs.filter((f) => f.issue_type === "intra.numeric_conflict")).toHaveLength(0);
  });

  it("flags numeric clash when same actor and same unit disagree", () => {
    const a: CanonicalRequirement = {
      id: "AS-1",
      source_text: "The subsystem shall maximum latency 50 ms.",
      normalized_text: "The subsystem shall maximum latency 50 ms.",
      explicit_id: true,
      type: "Performance",
      actor: "subsystem",
      thresholds: [{ value: "50", unit: "ms", comparator: "maximum" }],
    };
    const b: CanonicalRequirement = {
      id: "AS-2",
      source_text: "The subsystem shall maximum latency 100 ms.",
      normalized_text: "The subsystem shall maximum latency 100 ms.",
      explicit_id: true,
      type: "Performance",
      actor: "subsystem",
      thresholds: [{ value: "100", unit: "ms", comparator: "maximum" }],
    };
    const sa = extractRequirementSemantics(a);
    const sb = extractRequirementSemantics(b);
    const fs = runIntraDeterministicContradictionChecks(a, b, sa, sb);
    expect(fs.filter((f) => f.issue_type === "intra.numeric_conflict").length).toBeGreaterThanOrEqual(1);
  });

  it("does not compare numerics when only one side has an actor", () => {
    const a: CanonicalRequirement = {
      id: "X-1",
      source_text: "The subsystem shall maximum latency 50 ms.",
      normalized_text: "The subsystem shall maximum latency 50 ms.",
      explicit_id: true,
      type: "Performance",
      actor: "subsystem",
      thresholds: [{ value: "50", unit: "ms", comparator: "maximum" }],
    };
    const b: CanonicalRequirement = {
      id: "X-2",
      source_text: "Maximum latency shall be 100 ms.",
      normalized_text: "Maximum latency shall be 100 ms.",
      explicit_id: true,
      type: "Performance",
      thresholds: [{ value: "100", unit: "ms", comparator: "maximum" }],
    };
    const sa = extractRequirementSemantics(a);
    const sb = extractRequirementSemantics(b);
    const fs = runIntraDeterministicContradictionChecks(a, b, sa, sb);
    expect(fs.filter((f) => f.issue_type === "intra.numeric_conflict")).toHaveLength(0);
  });

  it("does not emit intra candidate pairs without same actor and shared numeric unit", () => {
    const hiJacA: CanonicalRequirement = {
      id: "A",
      source_text: "The vehicle shall enter safe state within 150 ms.",
      normalized_text: "The vehicle shall enter safe state within 150 ms.",
      explicit_id: true,
      type: "Safety",
      actor: "vehicle",
      thresholds: [{ value: "150", unit: "ms", comparator: "maximum" }],
    };
    const hiJacB: CanonicalRequirement = {
      id: "B",
      source_text: "The vehicle shall disengage on operator override.",
      normalized_text: "The vehicle shall disengage on operator override.",
      explicit_id: true,
      type: "Safety",
      actor: "vehicle",
    };
    const sems = new Map([
      [hiJacA.id, extractRequirementSemantics(hiJacA)],
      [hiJacB.id, extractRequirementSemantics(hiJacB)],
    ]);
    const pairs = generateIntraCandidatePairs([hiJacA, hiJacB], sems, testContradictionCfg);
    expect(pairs).toHaveLength(0);
  });

  it("emits intra candidate pairs when same actor and both sides have same-unit numerics", () => {
    const a: CanonicalRequirement = {
      id: "P1",
      source_text: "The subsystem shall maximum latency 50 ms.",
      normalized_text: "The subsystem shall maximum latency 50 ms.",
      explicit_id: true,
      type: "Performance",
      actor: "subsystem",
      thresholds: [{ value: "50", unit: "ms", comparator: "maximum" }],
    };
    const b: CanonicalRequirement = {
      id: "P2",
      source_text: "The subsystem shall maximum latency 100 ms.",
      normalized_text: "The subsystem shall maximum latency 100 ms.",
      explicit_id: true,
      type: "Performance",
      actor: "subsystem",
      thresholds: [{ value: "100", unit: "ms", comparator: "maximum" }],
    };
    const sems = new Map([
      [a.id, extractRequirementSemantics(a)],
      [b.id, extractRequirementSemantics(b)],
    ]);
    const pairs = generateIntraCandidatePairs([a, b], sems, testContradictionCfg);
    expect(pairs.length).toBe(1);
    expect(pairs[0]?.reasons).toContain("same_actor_shared_numeric_metric");
  });
});
