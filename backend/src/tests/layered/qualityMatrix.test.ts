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
      [
        scores?.unambiguous,
        scores?.complete,
        scores?.verifiable,
        scores?.singular,
        scores?.feasible,
        scores?.consistent,
      ],
    ]);
    expect(scores?.singular).toBe(2);
    expect(scores?.consistent).toBe(2);
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

  it("scores an objective observable criterion as verifiable without a number", () => {
    const lamp = req({
      id: "FR-10",
      source_text: "The warning lamp shall illuminate red when a fault is present.",
      normalized_text: "The warning lamp shall illuminate red when a fault is present.",
      actor: "warning lamp",
      obligation: "shall",
      action: "illuminate",
    });
    const display = req({
      id: "FR-11",
      source_text: "The system shall display the vehicle speed.",
      normalized_text: "The system shall display the vehicle speed.",
      actor: "system",
      obligation: "shall",
      action: "display",
      object: "vehicle speed",
    });
    const vague = req({
      id: "FR-12",
      source_text: "The system shall be user friendly.",
      normalized_text: "The system shall be user friendly.",
      actor: "system",
      obligation: "shall",
    });
    const assessed = assessQualityMatrix([lamp, display, vague], [], 2, dictionaries);
    expect(assessed.scores.get("FR-10")?.verifiable).toBe(2);
    expect(assessed.scores.get("FR-11")?.verifiable).toBe(2);
    expect(assessed.scores.get("FR-12")?.verifiable).toBe(0);
    const deviation = req({
      id: "FR-13",
      source_text:
        "The guidance system shall compute lateral deviation between the vehicle and the desired path.",
      normalized_text:
        "The guidance system shall compute lateral deviation between the vehicle and the desired path.",
      actor: "guidance system",
      obligation: "shall",
      action: "compute",
      object: "lateral deviation",
    });
    expect(assessQualityMatrix([deviation], [], 2, dictionaries).scores.get("FR-13")?.verifiable).toBe(2);
    const disengage = req({
      id: "FR-14",
      source_text: "The guidance system shall disengage automatic guidance upon operator override input.",
      normalized_text: "The guidance system shall disengage automatic guidance upon operator override input.",
      actor: "guidance system",
      obligation: "shall",
      action: "disengage",
      object: "automatic guidance",
    });
    expect(assessQualityMatrix([disengage], [], 2, dictionaries).scores.get("FR-14")?.verifiable).toBe(2);
    const vagueTrigger = req({
      id: "FR-15",
      source_text: "The guidance system shall be easy upon operator override input.",
      normalized_text: "The guidance system shall be easy upon operator override input.",
      actor: "guidance system",
      obligation: "shall",
      action: "be",
    });
    expect(assessQualityMatrix([vagueTrigger], [], 2, dictionaries).scores.get("FR-15")?.verifiable).toBe(0);
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
    const rawVerifiable = assessed.quality_matrix.map((row) => row[2]);
    const weightedVerifiable = assessed.weighted_evaluation_matrix.map((row) => row[2]);
    expect(weightedVerifiable[0]).toBe(rawVerifiable[0]);
    expect(weightedVerifiable[1]).toBe((rawVerifiable[1] ?? 0) * 3);
    const unweighted = ((rawVerifiable[0] ?? 0) + (rawVerifiable[1] ?? 0)) / 2;
    expect(assessed.document.weighted_verifiability).toBeLessThan(unweighted);
    expect(assessed.document.safety_critical_count).toBe(1);
  });

  it("turns each Q row into a 0–100 quality score and averages them", () => {
    expect(requirementQualityScore([2, 2, 2, 2, 2, 2], [1, 1, 1, 1, 1, 1])).toBe(100);
    expect(requirementQualityScore([2, 2, 4, 2, 4, 2], [1, 1, 2, 1, 2, 1])).toBe(100);
    expect(requirementQualityScore([2, 2, 2, 2, 2, 0], [1, 1, 1, 1, 1, 1])).toBe(83.33);
    expect(defectProfile([
      [2, 1, 0, 2, 2, 0],
      [0, 1, 0, 2, 2, 0],
    ])).toEqual([1, 1, 0, 2, 2, 0]);

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
    expect(assessed.document.defect_profile).toHaveLength(6);
    expect(assessed.document.defect_profile[2]).toBe(
      ((assessed.quality_matrix[0]?.[2] ?? 0) + (assessed.quality_matrix[1]?.[2] ?? 0)) / 2
    );
  });

  it("scores two shall clauses as singular 0 and a percentage over 100 as consistent 0", () => {
    const compound = req({
      id: "FR-8",
      source_text: "The system shall log the event and the system shall notify the operator.",
      normalized_text: "The system shall log the event and the system shall notify the operator.",
      actor: "system",
      obligation: "shall",
    });
    const percent = req({
      id: "FR-9",
      source_text: "The system shall achieve 120% availability.",
      normalized_text: "The system shall achieve 120% availability.",
      actor: "system",
      obligation: "shall",
      action: "achieve",
      object: "availability",
    });
    const assessed = assessQualityMatrix([compound, percent], [], 2, dictionaries);
    expect(assessed.scores.get("FR-8")?.singular).toBe(0);
    expect(assessed.scores.get("FR-9")?.consistent).toBe(0);
  });

  it("scores opposing numeric bounds as feasible 0 on both requirements", () => {
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
    expect(assessed.scores.get("FR-4")?.feasible).toBe(0);
    expect(assessed.scores.get("FR-5")?.feasible).toBe(0);
  });
});
