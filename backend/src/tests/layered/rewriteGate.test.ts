import { describe, expect, it } from "vitest";
import { assessRewriteAdvance } from "../../engine/layered/rewriteGate";

describe("rewrite gate", () => {
  it("keeps a rewrite that passes a later gate", () => {
    const result = assessRewriteAdvance(
      "The system shall always operate under all conditions.",
      "The system shall operate at vehicle speeds up to 12 mph."
    );
    expect(result.previous_stage).toBe("feasible");
    expect(result.next_stage).toBe("done");
    expect(result.advances).toBe(true);
  });

  it("discards a rewrite that drops a gate already scored 2", () => {
    const result = assessRewriteAdvance(
      "The system shall always operate under all conditions.",
      "The system shall be easy to operate."
    );
    expect(result.previous[0]).toBe(2);
    expect(result.advances).toBe(false);
  });

  it("discards a rewrite that does not open a later gate", () => {
    const text = "The system shall operate at vehicle speeds up to 12 mph.";
    const result = assessRewriteAdvance(text, text);
    expect(result.advances).toBe(false);
  });

  it("scores the candidate against peer bounds before keeping it", () => {
    const peer = "The controller shall limit torque to at least 600 Nm.";
    const blocked = assessRewriteAdvance(
      "The controller shall always limit torque.",
      "The controller shall limit torque to 500 Nm.",
      [peer]
    );
    expect(blocked.next[1]).toBe(0);
    expect(blocked.advances).toBe(false);

    const cleared = assessRewriteAdvance(
      "The controller shall always limit torque.",
      "The controller shall limit torque to 700 Nm.",
      [peer]
    );
    expect(cleared.next[1]).toBe(2);
    expect(cleared.advances).toBe(true);
  });

  it("discards text that is not a requirement", () => {
    const result = assessRewriteAdvance("The system shall always operate under all conditions.", "See the handbook.");
    expect(result.advances).toBe(false);
    expect(result.next).toEqual([]);
  });
});