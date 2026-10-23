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
    expect(req.obligation).toBe("shall");
    expect(req.polarity).toBe("prohibited");
    expect(req.action).toBe("not exceed");
    expect(req.modes).toEqual([]);
    expect(req.states).toEqual([]);
    expect(req.verification_signals?.some((s) => s.kind === "measurement")).toBe(true);
    expect(req.semantics?.parameters).toEqual(req.parameters);
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

  it("fills modes, states, and verification signals on the frame", () => {
    const frame = parseRequirementSemanticFrame(
      "When in reverse mode and in the armed state, the vehicle shall limit engine torque to at most 200 Nm as measured by the crankshaft sensor."
    );
    expect(frame.modes.some((m) => m.includes("reverse"))).toBe(true);
    expect(frame.states.some((s) => s.includes("armed"))).toBe(true);
    expect(frame.conditions.length).toBeGreaterThan(0);
    expect(frame.action).toBe("limit");
    expect(frame.parameters.some((p) => p.parameter.includes("torque") && p.value === 200)).toBe(true);
    expect(frame.verification_signals.some((s) => /crankshaft/i.test(s.name))).toBe(true);
    expect(frame.verification_signals.some((s) => s.kind === "measurement")).toBe(true);
  });

  it("treats object as the entity or parameter the subject acts upon", () => {
    expect(
      parseRequirementSemanticFrame(
        "The vehicle controller shall limit engine torque to 500 Nm when vehicle speed exceeds 20 km/h."
      ).object
    ).toBe("engine torque");

    expect(
      parseRequirementSemanticFrame(
        "The vehicle shall maintain path tracking during reverse operation."
      ).object
    ).toBe("path tracking");

    expect(parseRequirementSemanticFrame("The system shall authenticate users.").object).toBe("users");

    expect(
      parseRequirementSemanticFrame("The engine torque shall not exceed 500 Nm.").object
    ).toBe("engine torque");

    expect(parseRequirementSemanticFrame("The controller shall turn off the lamp.").object).toBe("lamp");
  });

  it("dumps the semantic frame for the vehicle-controller torque limit", () => {
    const source =
      "The vehicle controller shall limit engine torque to 500 Nm when vehicle speed exceeds 20 km/h.";
    const frame = parseRequirementSemanticFrame(source);

    const dump = {
      Actor: frame.actor ?? "(none)",
      Obligation: frame.obligation ?? "(none)",
      Polarity: frame.polarity,
      Action: frame.action ?? "(none)",
      Object: frame.object ?? "(none)",
      Conditions: frame.conditions,
      Modes: frame.modes,
      States: frame.states,
      Parameters: frame.parameters,
      VerificationSignals: frame.verification_signals,
    };
    // Visible in the test runner: how this sentence is currently parsed.
    console.log("\n=== semantic parse ===\n" + JSON.stringify({ source, ...dump }, null, 2) + "\n");

    expect(dump).toMatchObject({
      Actor: "vehicle",
      Obligation: "shall",
      Polarity: "required",
      Action: "limit",
      Object: "engine torque",
      Conditions: ["when vehicle speed exceeds 20 km/h"],
      Modes: [],
      States: [],
    });
    expect(frame.parameters).toEqual([
      expect.objectContaining({
        parameter: "controller limit engine torque",
        operator: "=",
        value: 500,
        unit: "nm",
      }),
    ]);
    expect(frame.verification_signals.some((s) => s.kind === "measurement" && s.name.includes("500"))).toBe(
      true
    );
  });

  it("copies the full semantic frame onto CanonicalRequirement fields", () => {
    const config = loadEngineConfig();
    const [req] = normalizeToCanonicalRequirements(
      "FR-1: When in reverse mode and in the armed state, the vehicle shall limit engine torque to at most 200 Nm as measured by the crankshaft sensor.",
      config,
      {}
    );
    expect(req.actor).toBe("vehicle");
    expect(req.obligation).toBe("shall");
    expect(req.action).toBe("limit");
    expect(req.object).toBe("engine torque");
    expect(req.modes?.some((m) => m.includes("reverse"))).toBe(true);
    expect(req.states?.some((s) => s.includes("armed"))).toBe(true);
    expect(req.parameters?.some((p) => p.value === 200)).toBe(true);
    expect(req.verification_signals?.length).toBeGreaterThan(0);
    expect(req.semantics?.modes).toEqual(req.modes);
    expect(req.semantics?.states).toEqual(req.states);
    expect(req.semantics?.parameters).toEqual(req.parameters);
    expect(req.semantics?.verification_signals).toEqual(req.verification_signals);
  });
});
