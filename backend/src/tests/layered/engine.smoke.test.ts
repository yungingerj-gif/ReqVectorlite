import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { loadEngineConfig, runLayeredEngine } from "../../engine/layered/engine";

describe("layered engine smoke", () => {
  it("runs active mode on fixture text", async () => {
    const raw = readFileSync(
      join(process.cwd(), "src", "tests", "layered", "fixtures", "sampleRequirements.txt"),
      "utf-8"
    );
    const config = loadEngineConfig();
    const result = await runLayeredEngine(
      {
        rawText: raw,
        source_document: "sampleRequirements.txt",
        profile: "default_active_spec",
        mode: "active",
      },
      config
    );
    expect(result.meta.requirement_count).toBeGreaterThan(5);
    expect(result.requirements.length).toBe(result.meta.requirement_count);
    expect(result.requirements[0]?.scores.overall).toBeGreaterThanOrEqual(0);
    expect(result.requirements[0]?.scores.overall).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.set_level_findings)).toBe(true);
    expect(result.requirements.every((r) => r.findings.length >= 0)).toBe(true);
    expect(result.meta.mode).toBe("active");
    expect(result.requirements.every((r) => r.legacy == null)).toBe(true);
    expect(result.meta.contradiction?.hierarchy_enabled).toBe(false);
    expect(result.parent_requirements).toBeUndefined();
  });

  it("ignores parent specification input (intra-only)", async () => {
    const config = loadEngineConfig();
    const result = await runLayeredEngine(
      {
        rawText: "FR-1: The system shall authenticate users.\nFR-2: The system shall not authenticate users.",
        source_document: "child.txt",
        profile: "default_active_spec",
        mode: "active",
        parent_raw_text: "SYS-1: The vehicle shall remain within 5 m of the path.",
        parent_source_document: "parent.txt",
      },
      config
    );
    expect(result.parent_requirements).toBeUndefined();
    expect(result.meta.parent_source_document).toBeUndefined();
    expect(result.meta.contradiction?.hierarchy_enabled).toBe(false);
    expect(result.meta.contradiction?.hierarchy_pairs_examined).toBe(0);
    expect(result.set_level_findings.every((f) => !f.issue_type.startsWith("hierarchy."))).toBe(true);
  });

  it("ignores legacy profile requests and stays rules-only", async () => {
    const raw = "FR-1: The system should be user friendly and quickly provide results.";
    const config = loadEngineConfig();
    const result = await runLayeredEngine(
      {
        rawText: raw,
        source_document: "inline",
        profile: "legacy_spec",
        mode: "legacy",
      },
      config
    );
    expect(result.meta.profile).toBe("default_active_spec");
    expect(result.meta.mode).toBe("active");
    expect(result.requirements[0]?.legacy).toBeUndefined();
  });
});
