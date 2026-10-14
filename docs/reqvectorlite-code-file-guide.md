# ReqVectorlite code file guide

This document walks every TypeScript, JavaScript, and related source file in the **ReqVectorlite** tree (`C:\Users\yungi\Projects\ReqVectorlite`). For each file it states **what is defined** (types, functions, components, routes) and **how it works** in the running product.

**Date:** 31 August 2026  
**Code snapshot:** rules-only Lite build (layered review uses deterministic rules only; AI and legacy reconstruction are not executed even if source files remain in the tree).

**How to read this:** Start with the product map. Then use the folder sections as a catalog. Status tags:

| Tag | Meaning |
|-----|---------|
| **Active** | Used when you run Lite locally (UI at 5173, API at 4000). |
| **Classic** | Used by `/classic` and `/api/requirements/*`, not the layered workbench. |
| **Dormant** | Still in the repo; Lite does not call it at runtime (AI/legacy/embeddings). |
| **Unreachable UI** | Component/page exists but is not routed in Lite. |
| **Test** | Vitest only. |
| **Script** | Offline generator, not the web app. |

---

## 1. Product map

ReqVectorlite is a **npm workspace** with two apps plus an optional unused AI gateway:

1. **Layered workbench** (primary Lite UI: Dashboard, Review, Config, Reports). Upload or paste a specification. The backend normalizes lines into canonical requirements, runs **five INCOSE-style rule blocks**, then **set-level** overlap/conflict heuristics, then **intra-document** and optional **parent/child** contradiction checks, then **scores** each requirement 0–100.
2. **Classic analyzer** (`/classic`). A separate, also rule-based pipeline with a richer graph, DCTE (delta constraint triangulation), and PDF audit export. No LLM.
3. **ai-service/**. A small OpenAI proxy. Lite’s `createAiClientFromEnv()` always returns `NullAiClient`, so this process is never required.

Runtime path for a layered run:

`UploadPanel / store` → `POST /api/layered/analyze` or `analyze-upload` → `extractTextForLayered` (files) → `runLayeredEngine` (always locked rules-only) → JSON → table, detail, set-level findings, Word/revised-source export.

---

## 2. Root and package config (not TS, but how the app boots)

These files are not application logic, but they define how code is built and started.

- **package.json (root)** — Workspaces `backend` and `frontend`. Scripts: `dev:backend`, `dev:frontend`, `build`, `start`.
- **frontend/package.json** — Vite + React 19 + Zustand + react-router + Three.js (classic 3D only).
- **backend/package.json** — Express 5, Zod, mammoth, pdf-parse, xlsx, docx, ts-node-dev, vitest.
- **frontend/vite.config.ts** — Proxies `/api` to `http://localhost:4000`.
- **frontend/tsconfig.json** / **backend/tsconfig.json** — TypeScript compile settings.
- **frontend/index.html** — Shell with `#app` mount point.
- **backend/config/layered-engine.json** — Dictionaries, thresholds, scoring penalties, which rule blocks are on. Loaded at runtime; Lite then **locks** AI/legacy off in code.
- **backend/config/layered-default.json** — Older/alternate profile sketch; not the file `loadEngineConfig` reads (it reads `layered-engine.json`).

---

## 3. Backend entry, HTTP, ingest

### backend/src/index.ts — Active

**Defines:** Express `app`, CORS, JSON body parser, route mounts, 404 handler, error middleware, `listen` on `PORT` or 4000.

**How it works:** Mounts five classic routers and one layered router under `/api`. `GET /` returns `{ status: "ok" }`. Unmatched `/api/*` returns a JSON 404 with a hint. Errors are logged and returned as generic 500 JSON (no stack).

### backend/src/middleware/validate.ts — Active

**Defines:** `validateBody(schema)`.

**How it works:** Express middleware. Parses `req.body` with a Zod schema. Success replaces `req.body` with the parsed value. Zod failures return **400** with `issues[]` (`path`, `message`). Other errors go to `next`.

### backend/src/ingest/ingest.ts — Active (layered uploads)

**Defines:** `extractTextForLayered({ buffer, mimetype, originalname })`.

**How it works:** Turns an uploaded file into `{ text, source_document }`. Plain text/CSV → UTF-8 string. Excel → first sheet as tab-separated rows. PDF → `pdf-parse` text. DOCX → Mammoth raw text. Anything else throws.

### backend/src/api/layered/index.ts — Active (library re-export)

**Defines:** Re-exports `loadEngineConfig`, `runLayeredEngine`, types `LayeredAnalysisResult`, `EngineRunOptions`.

**How it works:** Convenience barrel. HTTP handlers live in `routes/layeredPlatform.ts`; this file lets other modules import the engine without reaching into routes.

---

## 4. Layered HTTP API

### backend/src/routes/layeredPlatform.ts — Active

**Defines:** Express router (default export) with:

- `GET /layered/health`
- `GET /layered/config`
- `GET|POST /layered/domain-constraints`
- `POST /layered/analyze` (JSON)
- `POST /layered/analyze-upload` (multipart `file`, optional `parent_file`)
- `POST /layered/export/analysis-docx`
- `POST /layered/export/revised-source`

Also defines Zod schemas (`analyzeSchema`, domain-constraint body, revised-source patch) and a Multer instance (25 MB, allowed types).

**How it works:** Analyze endpoints **force** `profile: default_active_spec` and `mode: active`. They ignore `same_intent_llm`. Upload extracts child (and optional parent) text, then calls `runLayeredEngine`. Health reports `ai_enablement: false`. Domain constraints persist JSON on disk; they are **not** injected into the Lite engine path (they were for LLM prompts). Exports build a Word report or patched source file from the client-supplied result/patch.

---

## 5. Layered engine core

### backend/src/engine/layered/types.ts — Active

**Defines:** Public contracts: `AnalysisMode`, `CanonicalRequirement` (id, texts, type, actor/action/object, thresholds), `StructuredFinding`, `RequirementScores`, `PerRequirementResult`, `LayeredAnalysisResult`, `EngineRunOptions`, `TraceLinkInput`, plus dormant shapes `AiAttributeAssessment`, `LegacyReconstructionResult`, `SemanticEmbeddingMeta`.

**How it works:** This is the shared language between engine, API, and (mirrored) UI. A run returns `meta` + `requirements[]` + `set_level_findings` + optional `parent_requirements`.

### backend/src/engine/layered/config.ts — Active

**Defines:** `EngineProfile`, `ContradictionConfig`, `SetLevelCrossConfig`, `EngineConfig`; `loadEngineConfig`, `lockRulesOnlyEngineConfig`, `withSameIntentLlmEnabled` (no-op lock), `resolveProfile`, `isBlockEnabled`, `effectiveScoringWeights`.

**How it works:** Reads `backend/config/layered-engine.json`. Then **lock** turns off `ai.attribute_analysis`, `legacy.reconstruction`, intra/hierarchy AI, embeddings, and same-intent LLM; keeps only the `default_active_spec` profile. `isBlockEnabled` is true only if the profile lists the block **and** the registry flag is true.

### backend/src/engine/layered/engine.ts — Active

**Defines:** `runLayeredEngine`, re-exports `loadEngineConfig`.

**How it works:** Always locks config. Always uses `NullAiClient` (ignores any passed client). Pipeline:

1. Normalize child (and optional parent) text to canonical rows.
2. For each requirement, run the five deterministic blocks if enabled.
3. Run set-level cross-requirement rules.
4. Intra-document contradictions (deterministic only in practice).
5. Parent–child contradictions if parent text exists.
6. Score; return `ai_enabled: false`, `mode: "active"`, no `legacy` objects.

### backend/src/engine/layered/normalizeCanonical.ts — Active

**Defines:** `normalizeToCanonicalRequirements`, `normalizeParentRequirementsForHierarchy`.

**How it works:** Calls classic `parseRequirements` to split the document into ID+text rows, then `classifyRequirementType`, then extracts actor, action, object, conditions, and numeric **thresholds** with regex. Maps classic types into the smaller canonical set (Functional, Performance, Interface, Constraint, General, Unknown). Parent docs use the same path so hierarchy checks share structure.

### backend/src/engine/layered/scoring.ts — Active

**Defines:** `scoreRequirements`.

**How it works:** Each attribute starts at **100**. Every finding mapped to that attribute subtracts a penalty from config (`low`/`medium`/`high`). Overall is a weighted average of the five attributes (weights from config/profile). Set-level findings apply to every listed related ID.

---

## 6. Deterministic rule blocks (the Lite heart)

### backend/src/engine/layered/deterministic/index.ts — Active

**Defines:** Re-exports `runUnambiguous`, `runComplete`, `runVerifiable`, `runSingular`, `runConsistentCorrect`, block ID constants, `countStandaloneConjunctions`, type `DeterministicContext`.

### backend/src/engine/layered/deterministic/ruleContext.ts — Active

**Defines:** `DeterministicContext` `{ config, allRequirements }`.

**How it works:** Passed into every per-requirement rule so dictionaries/thresholds and the full set are available.

### backend/src/engine/layered/deterministic/newFinding.ts — Active

**Defines:** `createFinding`.

**How it works:** Builds a `StructuredFinding` with a UUID `finding_id`, default layer `L1_Deterministic`, and optional evidence/rewrite/missing fields/related IDs.

### backend/src/engine/layered/deterministic/unambiguous.ts — Active

**Defines:** `BLOCK_ID = "deterministic.unambiguous"`, `runUnambiguous`.

**How it works:** Scans normalized text for config **vague terms** (phrase or whole-word) and **banned terms** → high-severity `vague_or_subjective_language`. Weak modals (`should`/`may`/`could`/`might`) → medium `weak_modal` with a shall-substitution rewrite.

### backend/src/engine/layered/deterministic/complete.ts — Active

**Defines:** `BLOCK_ID`, `runComplete`.

**How it works:** Flags short text; missing `shall`/`must`; missing actor (extracted actor or cue word **before** the first obligation, not hyphenated “system-level”); performance rows without numbers/thresholds; missing object-like content. Produces `missing_fields` for the UI.

### backend/src/engine/layered/deterministic/verifiable.ts — Active

**Defines:** `BLOCK_ID`, `runVerifiable`.

**How it works:** Without shall/must, verification has no obligation basis (high). Performance without thresholds: missing measurable limit. Qualitative adjectives without digits/units: medium. Performance numbers without a known unit: low.

### backend/src/engine/layered/deterministic/singular.ts — Active

**Defines:** `countStandaloneConjunctions`, `BLOCK_ID`, `runSingular`.

**How it works:** Two+ shall/must → compound obligation. `and/or` → combinatorial phrasing. Multiple standalone and/or with an obligation → conjunction-heavy. Word count over threshold → overlong clause. Conjunction counting uses whole-word `and`/`or` so “information” does not count.

### backend/src/engine/layered/deterministic/consistentCorrect.ts — Active

**Defines:** `BLOCK_ID`, `runConsistentCorrect`.

**How it works:** Absolute wording (always/never); infeasible claims (unlimited, 100% of all); open-ended `etc.`; nearby shall vs shall-not; percentages **over 100**. These are intra-statement consistency/feasibility heuristics, not pair-wise logic.

---

## 7. Set-level (cross-requirement) rules

### backend/src/engine/layered/setLevel/crossConsistency.ts — Active

**Defines:** `BLOCK_ID = "setLevel.cross_requirement"`, `runSetLevelCrossRequirement`, `pairKey`, `dedupeSoftCrossPairs`, `collectSameIntentAiCandidatePairs`, type `SameIntentCandidatePair`.

**How it works:** Compares pairs after stripping stopwords. Emits findings such as near-duplicates (high Jaccard), possible overlap, terminology drift (synonym groups from config), numeric threshold conflicts, duplicate IDs. Candidate collection for same-intent LLM still exists but Lite never enables that pass. Semantic-alignment helpers gate some pairings so “The system shall” alone does not match unrelated rows.

### backend/src/engine/layered/setLevel/semanticAlignment.ts — Active

**Defines:** `buildSemanticsMap`, `semanticsStrongEnoughToGate`, `obligationSemanticAlignment`.

**How it works:** Compares extracted function signatures (type, actor, action, object, conditions) so overlap checks are obligation-centric, not bag-of-words only.

### backend/src/engine/layered/setLevel/crossIntentAi.ts — Dormant

**Defines:** `runCrossSameIntentAi`.

**How it works:** Would send similar pairs to an LLM for `same_intent_llm` findings. Requires `set_level_cross.ai_same_intent_enabled`, which Lite locks to false.

---

## 8. Contradiction (intra-doc and parent/child)

### backend/src/engine/layered/contradiction/blockIds.ts — Active

**Defines:** `BLOCK_INTRA`, `BLOCK_HIERARCHY` string constants used as `block_id` on findings.

### backend/src/engine/layered/contradiction/textUtils.ts — Active

**Defines:** `normalizeForTokens`, `tokenSet`, `jaccard`, `overlapCoefficient`.

**How it works:** Token Jaccard similarity for pairing and overlap.

### backend/src/engine/layered/contradiction/semantics.ts — Active

**Defines:** `PolarityModality`, `ParsedThreshold`, `RequirementSemantics`, `extractRequirementSemantics`.

**How it works:** Parses polarity (required vs prohibited), thresholds with units/comparators, and actor/object cues used by contradiction checks.

### backend/src/engine/layered/contradiction/intraPairGuards.ts — Active

**Defines:** `sameActorForIntraContradictionPair`, `hasSharedNumericalThresholdUnit`.

**How it works:** Intra pairs must share an actor when both have one; mixed “only one actor extracted” pairs are skipped so unrelated owners are not compared. Numeric conflicts require a shared unit.

### backend/src/engine/layered/contradiction/pairCandidates.ts — Active

**Defines:** `CandidatePair`, `generateIntraCandidatePairs`.

**How it works:** Scores pairs (Jaccard, type bonus, shared object/condition). Optional embedding neighbor keys can restrict the set; Lite passes `null` so lexical scoring + budget (`intra_pair_budget`) apply.

### backend/src/engine/layered/contradiction/intraDeterministic.ts — Active

**Defines:** `runIntraDeterministicContradictionChecks`.

**How it works:** For one candidate pair: numeric bound conflicts (max below another’s min, same unit/actor); value mismatch with same comparator; opposing polarity with related wording; condition conflicts. Emits `intra.*` issue types.

### backend/src/engine/layered/contradiction/runIntraDocument.ts — Active

**Defines:** `runIntraDocumentContradictions`.

**How it works:** If the intra block is on: extract semantics → candidates → deterministic checks with dedupe. AI adjudication runs only if `ai_intra_enabled` (Lite: false). Returns findings + `pairsExamined`.

### backend/src/engine/layered/contradiction/intraAi.ts — Dormant

**Defines:** `runIntraAiAdjudication`.

**How it works:** Would send top pairs to `AiClient` for overlap/contradiction labels. Not reached in Lite.

### backend/src/engine/layered/contradiction/hierarchyMatch.ts — Active when parent uploaded

**Defines:** `HierarchyPair`, `HierarchyEmbeddingBoost`, `buildHierarchyPairs`.

**How it works:** Matches parent rows to child rows via explicit `trace_links` and/or lexical similarity floor + budget. Optional cosine boost is unused in Lite.

### backend/src/engine/layered/contradiction/hierarchyDeterministic.ts — Active when parent uploaded

**Defines:** `runHierarchyDeterministicChecks`.

**How it works:** Child missing parent performance units; child relaxing parent bounds; polarity mismatch parent vs child. Findings attach to the **child** id with parent in `related_requirement_ids`.

### backend/src/engine/layered/contradiction/runParentChild.ts — Active when parent uploaded

**Defines:** `runParentChildContradictions`.

**How it works:** Orchestrates pair building + deterministic checks; optional hierarchy AI if enabled (Lite: no). Also can emit missing-trace style findings when links are incomplete.

### backend/src/engine/layered/contradiction/hierarchyAi.ts — Dormant

**Defines:** `runHierarchyAiReview`.

**How it works:** LLM review of parent–child pairs. Locked off.

---

## 9. Layered support: export, domain library, dormant AI/legacy

### backend/src/engine/layered/wordReport.ts — Active

**Defines:** `buildLayeredAnalysisDocx`.

**How it works:** Builds a .docx from a `LayeredAnalysisResult` (meta, scores, findings) for the Reports page.

### backend/src/engine/layered/revisedSourceExport.ts — Active

**Defines:** `SourceReplacement`, `applyReplacementsToText`, `buildRevisedSourceExport`.

**How it works:** Longest-first string replace of accepted rewrites into TXT/CSV/XLSX/DOCX; PDF becomes revised extracted text as `.txt`.

### backend/src/engine/layered/domainConstraintLibrary.ts — Active API, unused by Lite engine

**Defines:** `DomainConstraintEntry`, `DomainConstraintLibrary`, load/save/path helpers, `formatDomainConstraintsForPrompt`.

**How it works:** CRUD for `backend/data/domain-constraints.json`. Prompt formatter was for LLM context. Lite still exposes GET/POST and the Domain Constraints UI.

### backend/src/engine/layered/ai/aiClient.ts — Active stub + dormant live clients

**Defines:** `AiClient` interface; `NullAiClient`; `OpenAiJsonClient`; `RemoteAiClient`; `createAiClientFromEnv` (always Null); `wrapAiClientWithOrganizationContext`.

**How it works:** Lite never constructs a live client from env. OpenAI/remote classes remain for tests or a future AI branch.

### backend/src/engine/layered/ai/attributeScoring.ts — Dormant

**Defines:** `runAiAttributeAnalysis`, `BLOCK_ID`.

**How it works:** Would add LLM assessments **on top of** deterministic findings without deleting them. Engine no longer calls this.

### backend/src/engine/layered/aiTrainingPack.ts — Dormant for Lite runtime

**Defines:** Pack types, load/save, JSONL steering export, `formatTrainingPackForPrompt`, `getAiOrganizationContextForEngine`.

**How it works:** Organization steering text for LLM system prompts. Layered routes for the pack were removed in Lite; file + tests remain.

### backend/src/engine/layered/legacyReconstruction.ts — Dormant

**Defines:** `reconstructLegacyHeuristic`, `augmentLegacyWithAi`.

**How it works:** Heuristic cleanup/formal rewrites of informal statements; optional AI augment. Engine does not attach `legacy` on Lite.

### backend/src/engine/layered/embedding/openaiEmbeddings.ts — Dormant

**Defines:** `embedTextsOpenAI`.

**How it works:** Calls OpenAI embeddings API. Requires API key; Lite never enables embeddings.

### backend/src/engine/layered/embedding/semanticLayer.ts — Dormant at runtime

**Defines:** `SemanticEmbeddingContext`, `pairKeySorted`, `l2Normalize`, `cosineSimilarity`, `buildNeighborPairKeys`, `clusterRequirementsByEmbedding`, `buildSemanticEmbeddingContext`.

**How it works:** Would embed all requirements, cluster, and pre-filter intra pairs. Engine passes `null` semantic context.

---

## 10. Classic analyzer (models + services + routes)

### backend/src/models/requirements.ts — Classic (+ shared parse types)

**Defines:** Large type surface: INCOSE dimensions, `RequirementFinding`, conflicts, `RequirementGraph`, DCTE types (`ConstraintTuple`, `DCTEResult`, …), `RequirementsAnalyzeResponse`, tool/level enums, gap-risk types.

**How it works:** The classic JSON contract. Layered reuse is mainly `parseRequirements` options and type classification, not the full graph payload.

### backend/src/services/requirementsAnalyzeService.ts — Classic; parse used by layered

**Defines:** `getRequirementIdRegex`, `parseRequirements`, `computeDesignConsistencyAndCompleteness`, `analyzeRequirements`, and level wrappers (`analyzeStakeholderRequirements`, … `analyzeImplementationRequirements`). Internally: dimension scoring, linguistic/measurability/embedded rules, conflicts.

**How it works:** Splits text by ID patterns (generic/DOORS/Polarion/Jama). Scores each line. Detects numeric conflicts. Builds summaries. Layered only needs the parser. Classic HTTP uses the full `analyze*` functions.

### backend/src/services/requirementTypeDesignator.ts — Classic + layered normalize

**Defines:** `REQUIREMENT_TYPE_CRITERIA`, `classifyRequirementType`.

**How it works:** Keyword/heuristic classification (functional, performance, interface, safety, …) plus which criteria are met vs missing.

### backend/src/services/requirementGraphService.ts — Classic

**Defines:** `buildRequirementGraph`.

**How it works:** Nodes per finding; edges from ID references in text (depends-on, verifies, …) and `conflicts-with` from conflict detection; `nodePropagationWeights` = sum of incoming weights.

### backend/src/services/rippleRiskSimulationService.ts — Classic (partial)

**Defines:** `extractReferencedIds`, `buildDownstreamMap`, `runRippleSimulationForRequirement`, `runRippleSimulationForAll`.

**How it works:** ID extraction and downstream maps are used by the graph. The `runRippleSimulation*` functions are **deprecated and throw** if called.

### backend/src/services/deltaConstraintTriangulationService.ts — Classic

**Defines:** `extractStructuredConstraint`, `computeDCTE`.

**How it works:** Parses constraints into a functional / performance / condition space, computes deltas and a 3D-ish constraint space for the classic UI (`ConstraintSpace3D`).

### backend/src/routes/requirementsSystem.ts — Classic

**Defines:** Router: `POST /requirements/analyze` (generic, level in options), `POST /requirements/analyze-system`, specification upload (PDF/DOCX) that extracts text then analyzes.

**How it works:** Zod-validated JSON; Multer for spec upload; pdf-parse / mammoth; calls `analyzeRequirements` / `analyzeSystemRequirements`.

### backend/src/routes/requirementsStakeholder.ts — Classic

**Defines:** `POST /requirements/analyze-stakeholder` → `analyzeStakeholderRequirements`.

### backend/src/routes/requirementsSubsystem.ts — Classic

**Defines:** `POST /requirements/analyze-subsystem`.

### backend/src/routes/requirementsComponent.ts — Classic

**Defines:** `POST /requirements/analyze-component`.

### backend/src/routes/requirementsImplementation.ts — Classic

**Defines:** `POST /requirements/analyze-implementation`.

Each V-model route is a thin Zod + service wrapper; analysis logic is not duplicated.

---

## 11. Frontend bootstrap and routing

### frontend/src/main.tsx — Active

**Defines:** (none exported) React root.

**How it works:** Mounts `<App />` inside `ErrorBoundary` and `StrictMode` on `#app`.

### frontend/src/App.tsx — Active

**Defines:** `App`.

**How it works:** React Router. Layout routes: dashboard, review, config, domain-constraints, reports, traceability placeholder. `/legacy` and `/ai-training` **redirect to /review**. `/classic` renders `RequirementsTool` without the layered shell.

### frontend/src/apiBase.ts — Active

**Defines:** `apiBaseUrl`, `apiUrl`.

**How it works:** Dev default `http://localhost:4000`; production same-origin; override `VITE_API_URL`. All layered fetches go through `apiUrl("/api/...")`.

### frontend/src/api/layeredApi.ts — Active (some functions unused in Lite UI)

**Defines:** `analyzeLayered`, `analyzeLayeredUpload`, `exportLayeredDocx`, `getLayeredEngineConfig`, domain-constraint get/save, `exportRevisedSource`; plus unused AI pack helpers (`getAiTrainingPack`, `saveAiTrainingPack`, `fetchSteeringTrainingJsonl`) and DTO types.

**How it works:** Thin `fetch` wrappers. Analyze still accepts `same_intent_llm` in the type; the store no longer sends it.

### frontend/src/types/layeredTypes.ts — Active

**Defines:** UI mirror of engine types (`CanonicalRequirement`, `StructuredFinding`, `LayeredAnalysisResult`, unused `LegacyReconstructionResult` / embedding meta).

### frontend/src/types/suggestionFeedback.ts — Present; Lite UI no longer uses the bars

**Defines:** `SuggestionFeedbackVerdict`, `TrainingPipelineStatus`, `SuggestionFeedbackEntry`, key helper, status labels.

**How it works:** Types for AI-suggestion reviewer logging. Store still has the fields; Review page no longer exports the log.

### frontend/src/style.css — Active

**Defines:** Global CSS for both layered (`lv-*`) and classic (`.app-root`) UIs.

### frontend/src/counter.ts — Unused leftover

**Defines:** `setupCounter`.

**How it works:** Vite starter click counter. Not imported by `main.tsx`.

---

## 12. Frontend state

### frontend/src/store/useAnalysisStore.ts — Active

**Defines:** Zustand store `useAnalysisStore`; types `SortColumn`, `DashboardFilters`; actions for paste/upload analyze, export docx/revised source, filters, accepted rewrites, leftover feedback helpers.

**How it works:** Holds the last `LayeredAnalysisResult`, selected row, dual-file parent/child mode, loading/error. `runAnalyze` / `runUpload` always send `default_active_spec` + `active`. Dual-file mode posts both files as `file` + `parent_file`.

### frontend/src/store/analysisUtils.ts — Active

**Defines:** `SeverityFilter`, `RowFilter`, `TableSortColumn`, `severityRank`, `topFinding`, `scoreBadgeClass`, `findingSeverityClass`, `filterVisibleRequirements`, `sortRequirementRows`.

**How it works:** Pure helpers for table/dashboard filtering and score badge CSS classes.

---

## 13. Frontend layout, pages, components (layered)

### frontend/src/components/AppLayout.tsx — Active

**Defines:** `AppLayout`.

**How it works:** Sidebar nav (no Legacy, no AI training), header Import / New analysis, locked profile select `default_active_spec`, `<Outlet />`.

### frontend/src/pages/Dashboard.tsx — Active

**Defines:** `DashboardPage` — overview + set-level findings.

### frontend/src/pages/Review.tsx — Active

**Defines:** `ReviewPage`.

**How it works:** Upload panel, revised-source download, filters, table + detail, set-level findings. No AI feedback download.

### frontend/src/pages/Config.tsx — Active

**Defines:** `ConfigPage` wrapping `ConfigPanel`.

### frontend/src/pages/Reports.tsx — Active

**Defines:** `ReportsPage` — download Word report via store `exportDocx`.

### frontend/src/pages/DomainConstraints.tsx — Active

**Defines:** `DomainConstraintsPage`.

**How it works:** Loads/saves quantity-unit library through the API. Edits rows in the browser then POST.

### frontend/src/pages/Legacy.tsx — Unreachable UI

**Defines:** `LegacyPage`.

**How it works:** Would list `row.legacy` payloads. Route redirects away; engine never fills `legacy`.

### frontend/src/pages/AiTraining.tsx — Unreachable UI

**Defines:** `AiTrainingPage`.

**How it works:** Would edit steering pack. Route redirects; Lite API no longer serves those endpoints.

### frontend/src/components/UploadPanel.tsx — Active

**Defines:** `UploadPanel`, internal `DualDropZone`.

**How it works:** Toggle parent/child dual upload vs single paste/file. Run analysis. Explains rules-only; no LLM checkbox, no legacy mode.

### frontend/src/components/DashboardOverview.tsx — Active

**Defines:** `DashboardOverview`.

**How it works:** Filtered counts, average overall score, high-severity count, “Active specification — rules only” banner.

### frontend/src/components/AnalysisFiltersBar.tsx — Active

**Defines:** `AnalysisFiltersBar`.

**How it works:** Profile (all / default_active_spec), severity, requirement type. No `legacy_spec` option.

### frontend/src/components/RequirementsTable.tsx — Active

**Defines:** `RequirementsTable`.

**How it works:** Sortable rows of ID, snippet, type, attribute scores, top issue. Click selects detail.

### frontend/src/components/RequirementDetail.tsx — Active

**Defines:** `RequirementDetail`.

**How it works:** Shows source text, five scores + overall, every finding with evidence, rule-based suggested rewrite, `RewritePanel`. No legacy panel, no feedback bar.

### frontend/src/components/RewritePanel.tsx — Active

**Defines:** `RewritePanel`.

**How it works:** Picks first finding `suggested_rewrite`, copy, tracks accepted text for revised-source export.

### frontend/src/components/SetLevelFindings.tsx — Active

**Defines:** `SetLevelFindings` plus helpers (`findingIntentHint`, comparison banners).

**How it works:** Groups cross-requirement and contradiction findings; explains overlap vs contradiction in plain language; parent/child document labels.

### frontend/src/components/ConfigPanel.tsx — Active

**Defines:** `ConfigPanel`.

**How it works:** Loads server config; lets you toggle **rule** blocks (not AI/legacy), weights, dictionaries; saves override in **localStorage only** (does not change the server JSON).

### frontend/src/components/PlaceholderPage.tsx — Active (traceability)

**Defines:** `PlaceholderPage`.

**How it works:** Title + body + link to review.

### frontend/src/components/LegacyPanel.tsx — Unreachable

**Defines:** `LegacyPanel` — displays reconstruction fields. Not mounted.

### frontend/src/components/SuggestionFeedbackBar.tsx — Unreachable

**Defines:** `SuggestionFeedbackBar` — accept/reject/edit for training export.

### frontend/src/components/TrainingPipelineFeedbackList.tsx — Unreachable

**Defines:** `TrainingPipelineFeedbackList`.

### frontend/src/components/TrainingPipelineStatusSelect.tsx — Unreachable

**Defines:** `TrainingPipelineStatusSelect`.

---

## 14. Classic UI

### frontend/src/ui/RequirementsTool.tsx — Classic Active

**Defines:** `RequirementsTool` and many **local** types duplicating classic API shapes (findings, graph, DCTE, etc.).

**How it works:** Single-page classic analyzer: paste/upload, call `/api/requirements/analyze` (and spec upload), render dimension badges, conflicts, graph, DCTE, PDF export via jsPDF. Independent of Zustand layered store.

### frontend/src/ui/ConstraintSpace3D.tsx — Classic Active

**Defines:** `ConstraintSpace3D`, local `ConstraintSpacePoint`.

**How it works:** react-three-fiber scatter plot of DCTE constraint-space points.

### frontend/src/ui/ErrorBoundary.tsx — Active (wraps whole app)

**Defines:** class `ErrorBoundary`.

**How it works:** Catches render errors and shows a fallback instead of a blank page.

---

## 15. Tests

### backend/vitest.config.ts — Test config

**Defines:** Vitest node environment, `src/tests/**/*.test.ts`.

### backend/src/tests/layered/engine.smoke.test.ts — Test

Runs fixture text through `runLayeredEngine`; asserts scores, `ai_enabled: false`, no legacy objects; requesting `legacy_spec` still yields active rules-only meta.

### backend/src/tests/layered/contradiction.intra.test.ts — Test

Numeric bound conflicts, actor guards, candidate generation.

### backend/src/tests/layered/crossConsistency.overlap.test.ts — Test

Overlap / near-duplicate pairing behavior.

### backend/src/tests/layered/crossIntentAi.test.ts — Test

Same-intent LLM helper with a **mock** `AiClient` (does not prove Lite production path).

### backend/src/tests/layered/deterministic.complete.actor.test.ts — Test

Actor detection vs hyphenated “system-level”.

### backend/src/tests/layered/domainConstraintLibrary.test.ts — Test

Prompt formatter includes library text.

### backend/src/tests/layered/legacy.reconstruction.test.ts — Test

Heuristic reconstruction does not invent numeric thresholds.

### backend/src/tests/layered/semanticAlignment.test.ts — Test

Obligation signature alignment.

### backend/src/tests/layered/semanticLayer.test.ts — Test

Cosine / clustering helpers with fake vectors.

### backend/src/tests/layered/singular.conjunctions.test.ts — Test

Whole-word and/or counting.

### backend/src/tests/layered/steeringTrainingJsonl.test.ts — Test

JSONL export from a training pack.

### backend/src/tests/requirements/parseRequirements.numeric.test.ts — Test

Parser keeps “50 ms” intact; splits on a second FR-id.

Fixture: `backend/src/tests/layered/fixtures/sampleRequirements.txt` (not TS) — sample spec for smoke tests.

---

## 16. Scripts and ai-service

### backend/scripts/build-architecture-baseline-docx.cjs — Script

Markdown → `docs/architecture-baseline.docx`.

### backend/scripts/build-web-tool-user-guide-docx.cjs — Script

Markdown → `docs/web-tool-user-guide.docx`.

### backend/scripts/build-llm-training-manual-docx.cjs — Script

Markdown → `docs/llm-training-manual.docx` (LLM playbook; not needed to run Lite).

### backend/scripts/build-code-file-guide-docx.cjs — Script

This guide’s generator (markdown → Word).

### backend/scripts/export-training-jsonl.mjs — Script

Reads labeled requirement pairs JSON; writes JSONL chat records for offline model training. Not used by the web app.

### ai-service/server.mjs — Dormant (separate process)

**Defines:** Express app on port 8787; `GET /health`; `POST /v1/complete-json`.

**How it works:** Requires `OPENAI_API_KEY`. Forwards `{ system, user }` to Chat Completions JSON mode. Optional bearer `AI_SERVICE_SECRET`. Lite never sets `AI_SERVICE_URL` in `createAiClientFromEnv`.

---

## 17. Quick “where do I change X?”

| If you want to change… | Start here |
|------------------------|------------|
| Vague-word list, penalties, overlap thresholds | `backend/config/layered-engine.json` then `config.ts` lock |
| A quality rule (e.g. verifiable) | matching file under `deterministic/` |
| Pair-wise overlap | `setLevel/crossConsistency.ts` |
| Same-spec numeric contradictions | `contradiction/intraDeterministic.ts` |
| Parent vs child checks | `hierarchyDeterministic.ts` + `runParentChild.ts` |
| Scoring math | `scoring.ts` |
| Layered HTTP | `routes/layeredPlatform.ts` |
| Review UI | `UploadPanel.tsx`, `RequirementDetail.tsx`, `useAnalysisStore.ts` |
| Classic analyzer | `requirementsAnalyzeService.ts` + `RequirementsTool.tsx` |
| Parsing IDs from a PDF | `parseRequirements` + `ingest.ts` |

---

*End of file catalog. Generated for the ReqVectorlite working copy. Regenerating this Word file: `node backend/scripts/build-code-file-guide-docx.cjs` from the repo root after editing `docs/reqvectorlite-code-file-guide.md`.*
