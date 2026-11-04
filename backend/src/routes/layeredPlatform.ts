/**
 * Layered requirements engine — HTTP API (single specification / intra only).
 * Legacy reconstruction and parent–child hierarchy are not available in this build.
 *
 * Endpoints (prefix `/api` when mounted):
 * - `GET /layered/health` — engine identity and layer checklist.
 * - `GET /layered/config` — read-only engine configuration for dashboards.
 * - `GET|POST /layered/domain-constraints` — quantity/unit library stored on the server.
 * - `POST /layered/analyze` — JSON body with `rawText` for one specification.
 * - `POST /layered/analyze-upload` — multipart `file` for one specification.
 * - `POST /layered/export/analysis-docx` — Word report from a prior `LayeredAnalysisResult`.
 * - `POST /layered/export/revised-source` — apply text replacements to an uploaded source file.
 *
 * @module routes/layeredPlatform
 */
import express from "express";
import multer from "multer";
import { z } from "zod";
import { validateBody } from "../middleware/validate";
import { loadEngineConfig, runLayeredEngine } from "../engine/layered/engine";
import {
  loadDomainConstraintLibrary,
  saveDomainConstraintLibrary,
  type DomainConstraintLibrary,
  type DomainConstraintEntry,
} from "../engine/layered/domainConstraintLibrary";
import { extractTextForLayered } from "../ingest/ingest";
import { buildRevisedSourceExport } from "../engine/layered/revisedSourceExport";
import { buildLayeredAnalysisDocx } from "../engine/layered/wordReport";
import type { LayeredAnalysisResult } from "../engine/layered/types";

const router = express.Router();

const LEVELS = ["stakeholder", "system", "subsystem", "component", "implementation"] as const;
const TOOLS = ["generic", "doors", "polarion", "jama"] as const;

const parseOptionsSchema = z
  .object({
    strictIncose: z.boolean().optional(),
    level: z.enum(LEVELS).optional(),
    requirementManagementTool: z.enum(TOOLS).optional(),
  })
  .optional();

const traceLinkSchema = z.object({
  parent_requirement_id: z.string().min(1),
  child_requirement_id: z.string().min(1),
});

const domainConstraintsPostSchema = z.object({
  summary: z.string().max(2000).optional(),
  constraints: z
    .array(
      z.object({
        id: z.string().max(120).optional(),
        label: z.string().max(200).optional(),
        category: z.string().max(120).optional(),
        canonical_unit: z.string().max(80).optional(),
        alternate_units: z.array(z.string().max(40)).max(20).optional(),
        synonyms: z.array(z.string().max(80)).max(40).optional(),
        notes_for_llm: z.string().max(2000).optional(),
        enabled: z.boolean().optional(),
      })
    )
    .max(80)
    .optional(),
});

const analyzeSchema = z.object({
  rawText: z.string().min(1),
  profile: z.string().min(1).default("default_active_spec"),
  mode: z.enum(["active", "legacy"]).default("active"),
  sourceDocument: z.string().optional(),
  options: parseOptionsSchema,
  /** Parent specification (parsed like rawText). Enables parent–child contradiction vs main requirement set. */
  parent_raw_text: z.string().optional(),
  /** Display label for the parent document (e.g. filename) when using inline parent_raw_text. */
  parent_source_document: z.string().optional(),
  trace_links: z.array(traceLinkSchema).max(2000).optional(),
});

const exportSchema = z.object({
  result: z.any(),
});

const revisedSourcePatchSchema = z.object({
  replacements: z
    .array(
      z.object({
        from: z.string().max(50_000),
        to: z.string().max(50_000),
      })
    )
    .max(500),
});

const LAYERED_UPLOAD_MIMES = new Set([
  "text/plain",
  "text/csv",
  "application/csv",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const extOk = /\.(txt|csv|xlsx|xls|docx|pdf)$/i.test(name);
    if (LAYERED_UPLOAD_MIMES.has(file.mimetype) || extOk) {
      cb(null, true);
      return;
    }
    cb(new Error("Unsupported file type for layered analyze-upload"));
  },
});

/** `GET /api/layered/health` — lightweight probe listing engine layers and supported profiles. */
router.get("/layered/health", (_req, res) => {
  res.json({
    status: "ok",
    engine: "layered-requirements-mvp",
    layers: [
      "semantic_parse",
      "normalize_canonical",
      "quality_rules",
      "cross_set_analysis",
      "contradiction_engine",
      "verification_analysis",
      "scoring",
    ],
    profiles: ["default_active_spec"],
    review_mode: "active_spec_rules_only",
    specification_scope: "intra",
  });
});

/** Read-only engine config for dashboard / UI (no secrets). */
router.get("/layered/config", (_req, res) => {
  try {
    const config = loadEngineConfig();
    res.json(config);
  } catch (e) {
    res.status(500).json({ message: "Failed to load engine config" });
  }
});

/** `GET /api/layered/domain-constraints` — loads quantity/domain constraint library used by layered checks. */
router.get("/layered/domain-constraints", (_req, res) => {
  try {
    res.json(loadDomainConstraintLibrary());
  } catch {
    res.status(500).json({ message: "Failed to load domain constraint library" });
  }
});

/** `POST /api/layered/domain-constraints` — replaces library contents after validation and persistence. */
router.post("/layered/domain-constraints", validateBody(domainConstraintsPostSchema), (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof domainConstraintsPostSchema>;
    const raw = body.constraints ?? [];
    const constraints: DomainConstraintEntry[] = raw.map((c) => {
      const row: DomainConstraintEntry = {
        id: c.id?.trim() ?? "",
        label: (c.label ?? "Quantity").trim() || "Quantity",
        canonical_unit: (c.canonical_unit ?? "").trim(),
        enabled: c.enabled ?? true,
      };
      const cat = c.category?.trim();
      if (cat) row.category = cat;
      if (c.alternate_units?.length) row.alternate_units = c.alternate_units.map((x) => String(x));
      if (c.synonyms?.length) row.synonyms = c.synonyms.map((x) => String(x));
      const n = c.notes_for_llm?.trim();
      if (n) row.notes_for_llm = n;
      return row;
    });
    const lib: DomainConstraintLibrary = {
      updated_at: "",
      summary: body.summary ?? "",
      constraints,
    };
    saveDomainConstraintLibrary(lib);
    res.json(loadDomainConstraintLibrary());
  } catch (e) {
    next(e);
  }
});

/** `POST /api/layered/analyze` — runs {@link runLayeredEngine} on a single specification. */
router.post("/layered/analyze", validateBody(analyzeSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof analyzeSchema>;
    const config = loadEngineConfig();
    const result = await runLayeredEngine(
      {
        rawText: body.rawText,
        source_document: body.sourceDocument ?? "inline-text",
        profile: "default_active_spec",
        mode: "active",
        parseOptions: body.options ?? {},
      },
      config
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
});

/**
 * `POST /api/layered/analyze-upload` — multipart primary `file` (single specification).
 */
router.post(
  "/layered/analyze-upload",
  upload.fields([
    { name: "file", maxCount: 1 },
  ]),
  async (req, res, next) => {
  try {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const file = files?.file?.[0];
    if (!file?.buffer) {
      res.status(400).json({ message: "Missing file field: file" });
      return;
    }

    const profile = "default_active_spec";
    const mode = "active" as const;

    const { text, source_document } = await extractTextForLayered({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
    });

    if (!text.trim()) {
      res.status(400).json({ message: "No text extracted from file" });
      return;
    }

    const config = loadEngineConfig();
    const result = await runLayeredEngine(
      {
        rawText: text,
        source_document,
        profile,
        mode,
        parseOptions: {},
      },
      config
    );
    res.json({ ...result, source_extract: text });
  } catch (e) {
    next(e);
  }
});

/** `POST /api/layered/export/analysis-docx` — accepts `{ result }` JSON and streams a `.docx` report buffer. */
router.post("/layered/export/analysis-docx", validateBody(exportSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof exportSchema>;
    const buf = await buildLayeredAnalysisDocx(body.result as LayeredAnalysisResult);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader("Content-Disposition", 'attachment; filename="layered-analysis-report.docx"');
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

/** Original uploaded file (or plain-text blob) with requirement text replacements applied. Separate from analysis report. */
router.post("/layered/export/revised-source", upload.single("file"), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ message: "Missing file field: file" });
      return;
    }
    const rawPatch = req.body?.patch;
    if (typeof rawPatch !== "string") {
      res.status(400).json({ message: 'Missing string field: patch (JSON: { "replacements": [{ "from", "to" }] })' });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawPatch) as unknown;
    } catch {
      res.status(400).json({ message: "patch must be valid JSON" });
      return;
    }
    const patch = revisedSourcePatchSchema.parse(parsed);
    const { buffer, outName, contentType } = await buildRevisedSourceExport({
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      replacements: patch.replacements,
    });
    const asciiName = outName.replace(/[^\x20-\x7E]/g, "_");
    const encoded = encodeURIComponent(outName);
    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`
    );
    res.send(buffer);
  } catch (e) {
    next(e);
  }
});

export default router;
