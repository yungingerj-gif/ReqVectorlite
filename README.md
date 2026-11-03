# ReqVectorlite

ReqVectorlite reviews one requirements specification with deterministic rules. There is no language model and no network call during analysis. Each requirement becomes one row of a quality matrix. The document then gets a maturity index and a defect profile from that matrix.

The primary UI is the rules-only workbench: Dashboard, Requirement Review, Traceability Matrix, Config Profiles, Domain constraints, and Reports. Open it at `http://localhost:5173/`. The older pass/warn/fail analyzer is still available at `/classic`.

## Run locally

From the repository root, in two terminals:

```bash
npm install
npm run dev:backend
npm run dev:frontend
```

The API listens on port 4000. The UI listens on port 5173. Start the backend before a review. If it is not running, the page reports that it failed to fetch the requirements document.

On Windows Command Prompt, `npm run dev` does not start both processes. Use the two commands above.

For a production build served from another origin, set `VITE_API_URL` to the backend origin. Leave it empty when the UI and API share an origin.

## What a review does

1. The specification is split into requirements. A leading identifier such as `REQ-001`, `FR-1`, `3.1.2`, or `[SYS-4]` is kept as the requirement ID. A statement with no ID receives `REQ-AUTO-###`.
2. Each statement is parsed once into a semantic frame: actor, obligation, action, object, conditions, modes, states, numeric parameters, and verification signals. Later checks read that frame. They do not scan the sentence again for numbers and units.
3. Deterministic findings still run. They explain vague wording, missing structure, singular-statement problems, set-level overlap, and contradictions inside the document. Those findings do not change the matrix numbers.
4. The quality matrix is scored from the frame and from a few document-wide comparisons.

Parent–child comparison and legacy reconstruction are not run. Uploads accept `.txt`, `.csv`, `.pdf`, `.docx`, `.xlsx`, and `.xls`.

The engine configuration that a review actually uses is `backend/config/layered-engine.json`. Edits in Config Profiles, including the safety-critical weight, are stored in this browser only. They do not change the file the API reads.

The domain-constraint library can be viewed and saved on the server. Scoring does not consult it.

## The quality matrices

A specification with \(n\) requirements has three \(n \times 5\) matrices. Columns, in order, are Necessary, Unambiguous, Complete, Feasible, and Verifiable.

**R** is the raw score matrix. Every cell is 0 (missed), 1 (partial), or 2 (met).

**W** is the weight matrix. A normal row is \([1, 1, 1, 1, 1]\). A safety-critical row is \([1, 1, 1, \omega, \omega]\). The default \(\omega\) is 2, and it cannot fall below 1. A requirement is safety-critical only when its own text says safety-critical, ASIL A–D, or SIL 1–4. Guessing a safety type from the wording does not apply the weight.

**Q** is the cell-by-cell product of R and W. It is not a 5×5 matrix multiply. A normal row of Q matches R. On a safety-critical row, only feasibility and verifiability are scaled by \(\omega\).

### Requirement scores

**Row maturity** is the lowest cell in that row of R. The row is fully met only when every cell is 2. The safety-critical weight does not change maturity.

**Quality score** \(q_i\) is that row of Q as a percentage of the highest score the row can reach. Each raw cell tops out at 2, so the ceiling is 2 times the sum of the weight row:

\[
q_i=\left(\frac{\sum_{j=1}^{5} Q_{ij}}{2 \sum_{j=1}^{5} W_{ij}}\right)\times 100\%
\]

A fully met requirement scores 100%, including a safety-critical one, because the weight scales both the row sum and the ceiling.

### Document scores

**System maturity index**

\[
M_{sys}=\frac{1}{n}\sum_{i=1}^{n} q_i
\]

This is the average of the requirement quality scores, from 0 to 100. It is separate from row maturity and from the document-check maturity below.

**Defect profile**

\[
\mathbf{d}=\frac{1}{n}\sum_{i=1}^{n} \mathbf{r}_i
\]

\(\mathbf{d}\) is the mean of each column of R, so each entry stays on the 0–2 scale, in the same column order as R. A verifiable mean below 0.5 is treated as a specification-wide gap in testable criteria.

**Document-check maturity** is the lowest of four document checks, each scored 0, 1, or 2:

| Check | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Completeness | A requirement points at an ID that is not in the document. | Only some requirements cite a stakeholder need. | No dangling ID, and need citations are all present or all absent. |
| Consistency | A direct conflict or a duplicate. | A near-duplicate, terminology drift, overlap, or a possible missing decomposition. | None of those findings. |
| Bounded | A measured quantity is also open-ended (`etc.`, `and so on`, `and more`). | A quantity has only a lower bound or only an upper bound. Equality counts as both sides. | Every measured quantity is closed on both sides, or the document has no measured quantities. |
| Feasible | The combined lower bound is above the combined upper bound, a safety-critical value sits outside that combined interval, or Bounded is 0. | Bounded is 1. | Otherwise. |

Weighted feasibility and weighted verifiability are the matching columns of Q divided by the matching columns of W. They stay on a 0–2 scale. They are rollups, not extra cells in R.

## How a cell is scored

### Necessary

0 if the statement prescribes a design: algorithm, source code, a named programming language, a part number, or a screen, button, or widget layout. Also 0 when another requirement in the document cites a stakeholder need and this one does not.

2 when this requirement cites a need and is not design-prescriptive. A citation is phrasing such as "traces to", "derived from", "satisfies", "parent", or "stakeholder need" with an identifier, or an identifier such as `NEED-1`, `STK-1`, `PARENT-1`, or `SN-1`.

1 otherwise: an outcome statement in a document where no requirement cites a need.

### Unambiguous

0 when there is no `shall` or `must`, or when vague wording is combined with two obligations or with `and/or`.

1 when any one of these is present: a vague or banned term, a weak modal (`should`, `may`, `could`, `might`), passive wording, more than one `shall`/`must`, more than one sentence, or no recognized actor.

2 when the statement is one binding sentence, names an actor, and has none of those problems.

Recognized actors are system, subsystem, software, hardware, controller, operator, user, vehicle, ECU, module, interface, and component. Vague terms are the list in `layered-engine.json` (for example "quickly", "sufficient", "user friendly").

### Complete

0 when there is no `shall` or `must`, or when the text says when, if, while, or unless and no condition, mode, or state was parsed.

2 when an actor, an action, and an object are present, and a condition is present whenever the sentence is conditional.

1 when an action was parsed but the actor, object, or required condition is missing.

### Feasible

This cell does not look up cost, mass, or power. Missing budget data is not a failure.

0 when the text is unbounded (`infinite`, `unlimited`, `zero defect`, `100% of all`), or when this requirement's numeric value falls outside another requirement's bound on the same parameter and unit.

1 when the text is absolute (`always`, `never`, `all times`, `under all conditions`).

2 otherwise.

### Verifiable

2 when the parser extracted a finite number and a known unit. Recognized forms include `up to 12 mph`, `within 50 ms`, `not exceed 500 Nm`, `between 10 and 20 C`, and `exceeds 20 km/h`. Units include time, electrical, force, pressure, length, mass, percent, rpm, flow, and speed (`mph`, `km/h`, `m/s`, knots).

1 when a number was parsed without a unit, or the text points at an external criterion (`in accordance with`, `per the SRS`, `as specified in`, a tolerance defined elsewhere).

0 when there is no quantity and no external reference. A visual cue alone does not raise this cell.

## Traceability

Analysis does not fill the traceability matrix. After a review, port the requirements into it. A leading requirement ID is placed in the Requirement ID column and removed from the statement. Other columns are filled only when the document defines them. Requirement ID and Requirement statement stay read-only. Every other cell can be edited. An empty cell is shown as an em dash. Porting again replaces those edits.

## Reports

The Reports page builds a Word analysis report from the current result. It includes the system maturity index, the defect profile, and the per-requirement scorecard.

Requirement Review can also download a revised source. Accepted rewrites replace the original requirement text in the uploaded file. Paste-only reviews download the textarea as `requirements.txt`.

## API

Layered routes are mounted under `/api`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/layered/health` | Engine identity. |
| `GET /api/layered/config` | Read-only copy of `layered-engine.json`. |
| `GET` or `POST /api/layered/domain-constraints` | Read or replace the stored quantity library. |
| `POST /api/layered/analyze` | JSON body `{ "rawText": "..." }`. Profile and mode in the body are ignored; the run is the active rules-only profile. |
| `POST /api/layered/analyze-upload` | Multipart field `file`. The response is the analysis result plus `source_extract`. |
| `POST /api/layered/export/analysis-docx` | JSON body `{ "result": <LayeredAnalysisResult> }`. Returns a `.docx`. |
| `POST /api/layered/export/revised-source` | Multipart `file` plus `patch`, a JSON string `{ "replacements": [{ "from", "to" }] }`. |

The analysis result includes `quality_matrix` (R), `weight_matrix` (W), `weighted_evaluation_matrix` (Q), `document_maturity` (the four document checks, their minimum, \(M_{sys}\), and \(\mathbf{d}\)), and one `scores` object per requirement. `scores.quality_score` is \(q_i\). `scores.maturity` is the lowest raw cell.

### Classic routes

`POST /api/requirements/analyze` and `POST /api/requirements/analyze-specification` still serve the original analyzer. That path scores pass, warn, and fail dimensions and returns a summary of good, needs attention, and poor. It is not the matrix engine. The UI for it is `/classic`.

## Since the initial GitHub release

The first import was the classic analyzer only. It scored traceable, unambiguous, complete, verifiable, singular, feasible, consistent, and correct as pass, warn, or fail. It also built a typed requirement graph, simulated ripple impact on downstream requirements, and added linguistic, measurability, and embedded-rule badges. Input was pasted text or a PDF.

The workbench since then is a different review path:

- One specification is parsed once into a shared semantic frame, then reviewed with rules only. Optional model review, embeddings, and legacy reconstruction were removed from this path. Parent–child hierarchy is not executed.
- Layered quality is no longer a 0–100 penalty score. It is the matrices R, W, and Q above, with row maturity, \(q_i\), \(M_{sys}\), and the defect profile.
- Findings still describe problems. They no longer subtract points.
- Singular wording is part of Unambiguous. Pairwise consistency is a document check, not a column of R.
- Ripple simulation is disabled. Its entry points throw if called, and a review does not attach a ripple score.
- Traceability is a separate matrix that you port after analysis. The review does not invent trace links.
- The classic analyzer and its graph remain at `/classic`. They are not what Dashboard and Requirement Review display.
