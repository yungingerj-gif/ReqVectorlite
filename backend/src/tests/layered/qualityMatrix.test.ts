import { describe, expect, it } from "vitest";
import { loadEngineConfig } from "../../engine/layered/config";
import { normalizeToCanonicalRequirements } from "../../engine/layered/normalizeCanonical";
import { assessQualityMatrix, defectProfile, requirementQualityScore } from "../../engine/layered/qualityMatrix";
import type { CanonicalRequirement } from "../../engine/layered/types";

function req(partial: Partial<CanonicalRequirement> & Pick<CanonicalRequirement, "id" | "source_text">): CanonicalRequirement {
  return {
    normalized_text: partial.source_text,
    explicit_id: true,
    type: "Functional",
    ...partial,
  };
}

describe("quality matrix", () => {
  const dictionaries = loadEngineConfig().dictionaries;

  it("scores a measurable shall-statement as verifiable 2 and keeps cells on 0–2", () => {
    const row = req({
      id: "FR-1",
      source_text: "The controller shall limit torque to 500 Nm.",
      normalized_text: "The controller shall limit torque to 500 Nm.",
      actor: "controller",
      obligation: "shall",
      action: "limit",
      object: "torque",
      parameters: [{ parameter: "torque", operator: "<=", value: 500, unit: "nm" }],
    });
    const assessed = assessQualityMatrix([row], [], 2, dictionaries);
    const scores = assessed.scores.get("FR-1");
    expect(scores?.verifiable).toBe(2);
    expect(scores?.unambiguous).toBe(2);
    expect(assessed.quality_matrix).toEqual([
      [scores?.necessary, scores?.unambiguous, scores?.complete, scores?.feasible, scores?.verifiable],
    ]);
    expect(scores?.maturity).toBeGreaterThanOrEqual(0);
    expect(scores?.maturity).toBeLessThanOrEqual(2);
  });

  it("scores a quantitative speed limit as verifiable", () => {
    const config = loadEngineConfig();
    const [row] = normalizeToCanonicalRequirements(
      "The system shall operate at vehicle speeds up to 12 mph.",
      config,
      {}
    );
    const scores = assessQualityMatrix([row], [], 2, dictionaries).scores.get(row.id);
    expect(row.parameters?.some((p) => p.value === 12 && p.unit === "mph")).toBe(true);
    expect(scores?.verifiable).toBe(2);
  });

  it("marks vague weak wording below 2 and does not treat it as safety-critical", () => {
    const row = req({
      id: "FR-2",
      source_text: "The system should be user friendly.",
      normalized_text: "The system should be user friendly.",
      actor: "system",
      obligation: "should",
    });
    const scores = assessQualityMatrix([row], [], 2, dictionaries).scores.get("FR-2");
    expect(scores?.unambiguous).toBe(0);
    expect(scores?.safety_critical).toBe(false);
    expect(scores?.weight).toBe(1);
  });

  it("weights an explicit safety-critical row on the feasibility and verifiability rollup", () => {
    const ordinary = req({
      id: "FR-3",
      source_text: "The system shall respond within 50 ms.",
      normalized_text: "The system shall respond within 50 ms.",
      actor: "system",
      obligation: "shall",
      action: "respond",
      object: "response",
      parameters: [{ parameter: "response", operator: "<=", value: 50, unit: "ms" }],
    });
    const safety = req({
      id: "SR-1",
      source_text: "The brake controller shall be safety-critical and shall stop the vehicle.",
      normalized_text: "The brake controller shall be safety-critical and shall stop the vehicle.",
      actor: "brake controller",
      obligation: "shall",
      action: "stop",
      object: "vehicle",
    });
    const assessed = assessQualityMatrix([ordinary, safety], [], 3, dictionaries);
    expect(assessed.scores.get("SR-1")?.safety_critical).toBe(true);
    expect(assessed.scores.get("SR-1")?.weight).toBe(3);
    expect(assessed.scores.get("SR-1")?.verifiable).toBe(0);
    const rawVerifiable = assessed.quality_matrix.map((row) => row[4]);
    const weightedVerifiable = assessed.weighted_evaluation_matrix.map((row) => row[4]);
    expect(weightedVerifiable[0]).toBe(rawVerifiable[0]);
    expect(weightedVerifiable[1]).toBe((rawVerifiable[1] ?? 0) * 3);
    const unweighted = ((rawVerifiable[0] ?? 0) + (rawVerifiable[1] ?? 0)) / 2;
    expect(assessed.document.weighted_verifiability).toBeLessThan(unweighted);
    expect(assessed.document.safety_critical_count).toBe(1);
  });

  it("turns each Q row into a 0–100 quality score and averages them", () => {
    expect(requirementQualityScore([2, 2, 2, 2, 2], [1, 1, 1, 1, 1])).toBe(100);
    expect(requirementQualityScore([2, 2, 2, 4, 4], [1, 1, 1, 2, 2])).toBe(100);
    expect(requirementQualityScore([2, 2, 2, 2, 0], [1, 1, 1, 1, 1])).toBe(80);
    expect(defectProfile([
      [2, 1, 0, 2, 0],
      [0, 1, 0, 2, 0],
    ])).toEqual([1, 1, 0, 2, 0]);

    const measurable = req({
      id: "FR-6",
      source_text: "The controller shall limit torque to 500 Nm.",
      normalized_text: "The controller shall limit torque to 500 Nm.",
      actor: "controller",
      obligation: "shall",
      action: "limit",
      object: "torque",
      parameters: [{ parameter: "torque", operator: "<=", value: 500, unit: "nm" }],
    });
    const vague = req({
      id: "FR-7",
      source_text: "The system should be user friendly.",
      normalized_text: "The system should be user friendly.",
      actor: "system",
      obligation: "should",
    });
    const assessed = assessQualityMatrix([measurable, vague], [], 2, dictionaries);
    const qMeasurable = assessed.scores.get("FR-6")?.quality_score ?? 0;
    const qVague = assessed.scores.get("FR-7")?.quality_score ?? 0;
    expect(qMeasurable).toBeGreaterThan(qVague);
    expect(qMeasurable).toBeLessThanOrEqual(100);
    expect(qVague).toBeGreaterThanOrEqual(0);
    expect(assessed.document.system_maturity_index).toBe(Math.round(((qMeasurable + qVague) / 2) * 100) / 100);
    expect(assessed.document.defect_profile).toHaveLength(5);
    expect(assessed.document.defect_profile[4]).toBe(
      ((assessed.quality_matrix[0]?.[4] ?? 0) + (assessed.quality_matrix[1]?.[4] ?? 0)) / 2
    );
  });

  it("scores an empty joint numeric interval as document feasibility 0", () => {
    const upper = req({
      id: "FR-4",
      source_text: "The controller shall limit torque to at most 400 Nm.",
      normalized_text: "The controller shall limit torque to at most 400 Nm.",
      parameters: [{ parameter: "torque", operator: "<=", value: 400, unit: "nm" }],
    });
    const lower = req({
      id: "FR-5",
      source_text: "The controller shall maintain torque of at least 600 Nm.",
      normalized_text: "The controller shall maintain torque of at least 600 Nm.",
      parameters: [{ parameter: "torque", operator: ">=", value: 600, unit: "nm" }],
    });
    const assessed = assessQualityMatrix([upper, lower], [], 2, dictionaries);
    expect(assessed.document.feasible).toBe(0);
    expect(assessed.document.maturity).toBe(0);
  });
});
