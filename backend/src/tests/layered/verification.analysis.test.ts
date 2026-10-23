import { describe, expect, it } from "vitest";
import { loadEngineConfig } from "../../engine/layered/config";
import { runLayeredEngine } from "../../engine/layered/engine";
import { normalizeToCanonicalRequirements } from "../../engine/layered/normalizeCanonical";
import { runVerificationAnalysis } from "../../engine/layered/verification/runVerificationAnalysis";

describe("verification analysis", () => {
  it("flags performance requirements without a quantitative claim", () => {
    const config = loadEngineConfig();
    const [req] = normalizeToCanonicalRequirements(
      "PR-1: The engine shall provide sufficient torque.",
      config,
      {}
    );
    req.type = "Performance";
    const findings = runVerificationAnalysis(req);
    expect(findings.some((f) => f.issue_type === "missing_measurable_threshold")).toBe(true);
    expect(findings.every((f) => f.block_id === "verification.analysis")).toBe(true);
  });

  it("flags obligations with neither a quantity, visual cue, nor referenced criterion", () => {
    const config = loadEngineConfig();
    const [req] = normalizeToCanonicalRequirements(
      "FR-1: The controller shall be ready.",
      config,
      {}
    );
    const findings = runVerificationAnalysis(req);
    expect(findings.some((f) => f.issue_type === "missing_verification_path")).toBe(true);
  });

  it("accepts a numeric parameter as quantitative verification (no method required)", () => {
    const config = loadEngineConfig();
    const [req] = normalizeToCanonicalRequirements(
      "PR-2: The engine torque shall not exceed 500 Nm.",
      config,
      {}
    );
    const findings = runVerificationAnalysis(req);
    expect(findings.some((f) => f.issue_type === "missing_verification_path")).toBe(false);
    expect(findings.some((f) => f.issue_type === "implicit_verification_only")).toBe(false);
    expect(findings.some((f) => f.attribute === "Verifiable" && f.severity === "high")).toBe(false);
  });

  it("does not require a named verification method when a quantity is present", () => {
    const config = loadEngineConfig();
    const [req] = normalizeToCanonicalRequirements(
      "PR-3: The engine torque shall not exceed 500 Nm as measured by the crankshaft sensor.",
      config,
      {}
    );
    const findings = runVerificationAnalysis(req);
    expect(findings.some((f) => f.issue_type === "implicit_verification_only")).toBe(false);
    expect(findings.some((f) => f.issue_type === "missing_verification_path")).toBe(false);
  });

  it("accepts a visual indication without a verification method type", () => {
    const config = loadEngineConfig();
    const [req] = normalizeToCanonicalRequirements(
      "FR-4: The fault lamp shall illuminate red when a fault is detected.",
      config,
      {}
    );
    const findings = runVerificationAnalysis(req);
    expect(findings.some((f) => f.issue_type === "missing_verification_path")).toBe(false);
    expect(req.verification_signals?.some((s) => s.kind === "observable")).toBe(true);
  });

  it("accepts a tolerance or value specified outside this requirement", () => {
    const config = loadEngineConfig();
    const [fromTable] = normalizeToCanonicalRequirements(
      "FR-6: The controller shall keep engine torque within the tolerance specified in the calibration table.",
      config,
      {}
    );
    expect(runVerificationAnalysis(fromTable).some((f) => f.issue_type === "missing_verification_path")).toBe(
      false
    );
    expect(fromTable.verification_signals?.some((s) => s.kind === "referenced")).toBe(true);

    const [fromIcd] = normalizeToCanonicalRequirements(
      "FR-7: The interface timing shall be as defined in ICD-4.",
      config,
      {}
    );
    expect(runVerificationAnalysis(fromIcd).some((f) => f.issue_type === "missing_verification_path")).toBe(false);

    const [outside] = normalizeToCanonicalRequirements(
      "FR-8: The output shall remain within the tolerance defined outside this requirement.",
      config,
      {}
    );
    expect(runVerificationAnalysis(outside).some((f) => f.issue_type === "missing_verification_path")).toBe(false);
  });

  it("does not treat a method name alone as verifiable", () => {
    const config = loadEngineConfig();
    const [req] = normalizeToCanonicalRequirements(
      "FR-5: The controller shall be verified by inspection.",
      config,
      {}
    );
    const findings = runVerificationAnalysis(req);
    expect(findings.some((f) => f.issue_type === "missing_verification_path")).toBe(true);
  });

  it("runs after normalize in the layered engine", async () => {
    const config = loadEngineConfig();
    const result = await runLayeredEngine(
      {
        rawText: "FR-1: The system shall be ready.",
        source_document: "inline",
        profile: "default_active_spec",
        mode: "active",
      },
      config
    );
    expect(result.requirements[0]?.requirement.semantics).toBeDefined();
    expect(result.requirements[0]?.findings.some((f) => f.block_id === "verification.analysis")).toBe(true);
  });
});
