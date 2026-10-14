import { describe, expect, it } from "vitest";
import { loadEngineConfig } from "../../engine/layered/config";
import { normalizeToCanonicalRequirements } from "../../engine/layered/normalizeCanonical";
import { parseRequirementParameters, parseRequirementSemanticFrame } from "../../engine/layered/semanticParse";

describe("semantic parser — first-class parameters", () => {
  it("parses engine torque as parameter/operator/value/unit", () => {
    const params = parseRequirementParameters("The engine torque shall not exceed 500 Nm.");
    expect(params.length).toBeGreaterThanOrEqual(1);
    const p = params.find((x) => x.value === 500);
    expect(p).toMatchObject({
      operator: "<=",
      value: 500,
    });
    expect(p?.unit?.toLowerCase()).toBe("nm");
    expect(p?.parameter).toMatch(/torque/i);
  });

  it("parses maximum pressure shall be 200 bar", () => {
    const params = parseRequirementParameters("Maximum pressure shall be 200 bar.");
    expect(params.some((p) => p.parameter.includes("pressure") && p.value === 200 && p.operator === "<=")).toBe(
      true
    );
  });

  it("parses within 50 ms as an upper bound", () => {
    const params = parseRequirementParameters("The system shall respond within 50 ms.");
    expect(params.some((p) => p.value === 50 && p.operator === "<=" && p.unit === "ms")).toBe(true);
  });

  it("parses between-range as two parameters", () => {
    const params = parseRequirementParameters("Temperature shall remain between 10 and 20 C.");
    expect(params.some((p) => p.operator === ">=" && p.value === 10)).toBe(true);
    expect(params.some((p) => p.operator === "<=" && p.value === 20)).toBe(true);
  });

  it("attaches the frame once during normalize", () => {
    const config = loadEngineConfig();
    const [req] = normalizeToCanonicalRequirements(
      "FR-9: The engine torque shall not exceed 500 Nm.",
      config,
      {}
    );
    expect(req.semantics).toBeDefined();
    expect(req.parameters?.[0]).toMatchObject({ operator: "<=", value: 500 });
    expect(req.actor).toBeUndefined();
    expect(req.semantics?.obligation).toBe("shall");
    expect(req.semantics?.polarity).toBe("prohibited");
  });

  it("extracts actor only from the subject span", () => {
    const noActor = parseRequirementSemanticFrame(
      "The shall maintain path tracking during reverse vehicle operation."
    );
    expect(noActor.actor).toBeUndefined();
    const withActor = parseRequirementSemanticFrame(
      "The vehicle shall maintain path tracking during reverse operation."
    );
    expect(withActor.actor).toBe("vehicle");
  });
});
