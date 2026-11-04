import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

/**
 * Domain quantities / units the org cares about (speed, torque, current, …).
 */
export interface DomainConstraintEntry {
  id: string;
  /** Human label e.g. "Shaft speed", "Bus current" */
  label: string;
  /** Optional grouping e.g. mechanical, electrical, thermal */
  category?: string;
  /** Preferred unit in specs for this quantity e.g. rad/s, N·m, A */
  canonical_unit: string;
  alternate_units?: string[];
  /** Phrases that refer to this quantity in prose */
  synonyms?: string[];
  notes_for_llm?: string;
  enabled: boolean;
}

export interface DomainConstraintLibrary {
  updated_at: string;
  /** Short description of this quantity and unit library */
  summary?: string;
  constraints: DomainConstraintEntry[];
}

const MAX_SUMMARY = 2000;
const MAX_LABEL = 200;
const MAX_CANONICAL_UNIT = 80;
const MAX_SYNONYM = 80;
const MAX_ALTERNATE = 40;
const MAX_NOTES = 2000;

export function domainConstraintsPath(): string {
  return path.join(process.cwd(), "data", "domain-constraints.json");
}

export function defaultDomainConstraintLibrary(): DomainConstraintLibrary {
  return {
    updated_at: new Date().toISOString(),
    constraints: [],
  };
}

export function loadDomainConstraintLibrary(): DomainConstraintLibrary {
  const p = domainConstraintsPath();
  try {
    if (!fs.existsSync(p)) return defaultDomainConstraintLibrary();
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as DomainConstraintLibrary;
    if (!parsed || !Array.isArray(parsed.constraints)) return defaultDomainConstraintLibrary();
    const summary =
      typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim().slice(0, MAX_SUMMARY)
        : undefined;
    const base: DomainConstraintLibrary = {
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : new Date().toISOString(),
      constraints: parsed.constraints
        .filter((c) => c && typeof c === "object")
        .map((c) => {
          const row: DomainConstraintEntry = {
            id: typeof c.id === "string" && c.id.length > 0 ? c.id : randomUUID(),
            label: String((c as DomainConstraintEntry).label ?? "Quantity").slice(0, MAX_LABEL),
            canonical_unit: String((c as DomainConstraintEntry).canonical_unit ?? "").slice(0, MAX_CANONICAL_UNIT),
            enabled: Boolean((c as DomainConstraintEntry).enabled),
          };
          const cat = (c as DomainConstraintEntry).category?.trim();
          if (cat) row.category = cat.slice(0, 120);
          const alt = (c as DomainConstraintEntry).alternate_units;
          if (Array.isArray(alt)) {
            row.alternate_units = alt.map((u) => String(u).trim()).filter(Boolean).slice(0, 20).map((u) => u.slice(0, MAX_ALTERNATE));
          }
          const syn = (c as DomainConstraintEntry).synonyms;
          if (Array.isArray(syn)) {
            row.synonyms = syn.map((s) => String(s).trim()).filter(Boolean).slice(0, 40).map((s) => s.slice(0, MAX_SYNONYM));
          }
          const n = (c as DomainConstraintEntry).notes_for_llm?.trim();
          if (n) row.notes_for_llm = n.slice(0, MAX_NOTES);
          return row;
        }),
    };
    if (summary != null) base.summary = summary;
    return base;
  } catch {
    return defaultDomainConstraintLibrary();
  }
}

export function saveDomainConstraintLibrary(lib: DomainConstraintLibrary): void {
  const p = domainConstraintsPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const out: DomainConstraintLibrary = {
    updated_at: new Date().toISOString(),
    constraints: lib.constraints.map((c) => {
      const row: DomainConstraintEntry = {
        id: c.id?.length ? c.id : randomUUID(),
        label: c.label.slice(0, MAX_LABEL),
        canonical_unit: c.canonical_unit.slice(0, MAX_CANONICAL_UNIT),
        enabled: Boolean(c.enabled),
      };
      const cat = c.category?.trim();
      if (cat) row.category = cat.slice(0, 120);
      if (c.alternate_units?.length) {
        row.alternate_units = c.alternate_units.map((u) => u.slice(0, MAX_ALTERNATE));
      }
      if (c.synonyms?.length) {
        row.synonyms = c.synonyms.map((s) => s.slice(0, MAX_SYNONYM));
      }
      const n = c.notes_for_llm?.trim();
      if (n) row.notes_for_llm = n.slice(0, MAX_NOTES);
      return row;
    }),
  };
  const s = lib.summary?.trim();
  if (s) out.summary = s.slice(0, MAX_SUMMARY);
  fs.writeFileSync(p, JSON.stringify(out, null, 2), "utf8");
}
