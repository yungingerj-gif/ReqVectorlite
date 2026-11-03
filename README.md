# ReqVector (INCOSE-style requirement analysis)

ReqVector is a lightweight web tool that checks requirement statements for common quality issues using INCOSE-inspired rules (clarity, completeness, verifiability, etc.). **Core analysis is rule-based and runs with no AI** (cheap to deploy). The **layered workbench** adds **optional** LLM-assisted passes (attribute review, same-intent, contradiction adjudication, embeddings) when **`OPENAI_API_KEY`** (in-process OpenAI) or **`AI_SERVICE_URL`** (`ai-service/` gateway) is configured—deterministic rules still run either way.

## Product surfaces

| Surface | Where | AI |
|--------|--------|-----|
| **Classic analyzer** | UI: **`/classic`**. API: `POST /api/requirements/analyze`, specification uploads on classic routes. | **No** — rule-based only (graph, ripple, PDF audit, etc.). |
| **Layered workbench** | UI: **`/dashboard`**, **`/review`**, reports, config, AI training, … API: **`/api/layered/*`**. | **Optional** — see env vars above. |

More detail: **`ARCHITECTURE.md`**, **`docs/web-tool-user-guide.md`**, **`docs/architecture-baseline.md`**.

The sections below describe the **classic** analyzer only (dimensions, graph, ripple, and its HTTP API).

## How it works (classic)

### Input

- **Context** (optional): a short system/project description.
- **Requirements**: paste one requirement per line, optionally prefixed with an ID:
  - `REQ-001: The system shall ...`
  - If no ID is provided, the service generates `REQ-AUTO-###`.

### Analysis engine (rule-based)

The backend parses each line and evaluates it across these dimensions:

- **traceable**: has an explicit ID (or warns if auto-generated)
- **unambiguous**: flags vague/ambiguous terms like “fast”, “appropriate”, “etc.”
- **complete**: checks for a clear subject/actor and requirement phrasing (strict mode prefers “shall”)
- **verifiable**: prefers measurable criteria (numbers + units) and clear pass/fail wording
- **singular**: warns when “and/or” or multiple clauses suggest multiple requirements in one line
- **feasible**: flags obviously impossible values (e.g. >100%)
- **consistent**: cross-checks for simple numeric conflicts (e.g. “maximum latency 50 ms” vs “20 ms”)
- **correct**: kept conservative (often needs domain review); marked pass only when there are no issues

### Design consistency & completeness (design-gap style)

We do not use a separate “design gap” score. Design-related determinations are:

- **Consistency**: `detectConflicts()` finds requirements that state different numeric values for the same metric (e.g. max latency 50 ms vs 20 ms). Affected requirements get `dimensions.consistent = "warn"`.
- **Completeness**: The response includes `designConsistencyAndCompleteness` with conflict count, type coverage, traceability gaps, and consistency-warn count.
- **Ripple Risk Simulation Engine**: When adding or modifying a requirement, impact on **downstream** nodes (requirements that reference it by ID) is simulated. Four ripples: performance degradation, cost growth, verification expansion, safety classification escalation. **RippleImpactScore** = Σ downstream node delta magnitudes. Each requirement gets `rippleSimulation`; design summary includes `highRippleImpactCount` (score ≥ 5) and `maxRippleImpactScore`.

### Output

The API returns:

- A finding per requirement (dimension statuses + issue list)
- Potential cross-requirement conflicts
- A summary count (good / needs_attention / poor)

## Stage 1 – ReqVector

In addition to INCOSE dimensions, each requirement is evaluated against:

- **Linguistic quality**: passive voice, vague pronouns (it/they/this), long sentences, negative formulation without exception.
- **Measurability validation**: presence of “shall”/“must”, numeric values with units, and tolerance/range where appropriate.
- **Embedded-specific rules**: timing requirements (latency, deadline, jitter) must have numeric+unit; resource (memory, CPU) must have limits; safety-related (fail-safe, SIL, ASIL) should specify level or behavior; determinism/ordering must be verifiable.

The UI shows **Linguistic**, **Measurability**, and **Embedded** badges per requirement with pass/warn/fail and issue lists. Use **Export PDF audit** to download a full audit report (summary, conflicts, design consistency & completeness when available, and per-requirement findings including Stage 1 categories).

You can **upload an entire specification PDF**: the backend extracts text from the PDF, runs the same requirement analysis, and adds a **Design consistency & completeness** summary (conflicts, type coverage, traceability gaps). The same results and export are available as for pasted text.

## API

### `POST /api/requirements/analyze`

Request body:

```json
{
  "context": "Optional context string",
  "rawText": "REQ-001: ...\nREQ-002: ...",
  "options": { "strictIncose": true }
}
```

Response body (abridged):

```json
{
  "requirements": [
    {
      "id": "REQ-001",
      "text": "The system shall respond fast ...",
      "status": "poor",
      "dimensions": { "unambiguous": "fail", "verifiable": "warn" },
      "issues": ["Ambiguous term(s): \"fast\" ..."]
    }
  ],
  "conflicts": [],
  "summary": { "total": 1, "good": 0, "needsAttention": 0, "poor": 1 }
}
```

### `POST /api/requirements/analyze-specification`

Upload a full specification as a PDF for requirement quality and design consistency & completeness analysis.

- **Content-Type**: `multipart/form-data`
- **Body**: `specification` (file, PDF), optional `options` (JSON string, e.g. `{"strictIncose": true}`)
- **Response**: Same shape as `/api/requirements/analyze`, plus `designConsistencyAndCompleteness` with `conflictCount`, `typeCoverage`, `traceabilityGaps`, `requirementsWithConsistencyWarn`.

## Run locally

From the repo root:

```bash
npm install
npm run dev:backend
npm run dev:frontend
```

- **Backend** must be running first (port 4000); otherwise the frontend will show "Failed to fetch".
- **Frontend** (port 5173) proxies `/api` to the backend, so use `http://localhost:5173/` and ensure the backend is at `http://localhost:4000/`.
- For a production build, set `VITE_API_URL` to your backend URL if it is on a different origin.

