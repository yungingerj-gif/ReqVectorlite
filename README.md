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
2. Each statement is parsed once into a semantic frame: actor, obligation, action, object, conditions, modes, states, numeric parameters, and verification signals. Numeric limits are taken from that frame. Qualitative verifiability also reads the statement for an observable result or a binary event.
3. Deterministic findings still run. They explain vague wording, missing structure, singular-statement problems, set-level overlap, and contradictions inside the document. Those findings do not change the matrix numbers. Consistent uses the conflict findings when it scores a row.
4. The quality matrix is scored from the frame and from a few document-wide comparisons.

Parent–child comparison and legacy reconstruction are not run. Uploads accept `.txt`, `.csv`, `.pdf`, `.docx`, `.xlsx`, and `.xls`.

The engine configuration that a review actually uses is `backend/config/layered-engine.json`. Edits in Config Profiles, including the safety-critical weight, are stored in this browser only. They do not change the file the API reads.

The domain-constraint library can be viewed and saved on the server. Scoring does not consult it.

## The quality matrices

A specification with \(n\) requirements has three \(n \times 6\) matrices. Columns, in order, are Unambiguous, Complete, Verifiable, Singular, Feasible, and Consistent. No other attribute is scored.

**R** is the raw score matrix. Every cell is 0 (missed), 1 (partial), or 2 (met).

**W** is the weight matrix. A normal row is \([1, 1, 1, 1, 1, 1]\). A safety-critical row is \([1, 1, \omega, 1, \omega, 1]\), so only verifiable and feasible are scaled. The default \(\omega\) is 2, and it cannot fall below 1. A requirement is safety-critical only when its own text says safety-critical, ASIL A–D, or SIL 1–4. Guessing a safety type from the wording does not apply the weight.

**Q** is the cell-by-cell product of R and W. It is not a 6×6 matrix multiply. A normal row of Q matches R. On a safety-critical row, only verifiability and feasibility are scaled by \(\omega\).

### Requirement scores

**Row maturity** is the lowest cell in that row of R. The row is fully met only when every cell is 2. The safety-critical weight does not change maturity.

**Quality score** \(q_i\) is that row of Q as a percentage of the highest score the row can reach. Each raw cell tops out at 2, so the ceiling is 2 times the sum of the weight row:

\[
q_i=\left(\frac{\sum_{j=1}^{6} Q_{ij}}{2 \sum_{j=1}^{6} W_{ij}}\right)\times 100\%
\]

A fully met requirement scores 100%, including a safety-critical one, because the weight scales both the row sum and the ceiling.

### Document scores

**System maturity index**

\[
M_{sys}=\frac{1}{n}\sum_{i=1}^{n} q_i
\]

This is the average of the requirement quality scores, from 0 to 100. It is separate from row maturity, which is the lowest cell in the row.

**Defect profile**

\[
\mathbf{d}=\frac{1}{n}\sum_{i=1}^{n} \mathbf{r}_i
\]

\(\mathbf{d}\) is the mean of each column of R, so each entry stays on the 0–2 scale, in the same column order as R. A verifiable mean below 0.5 is treated as a specification-wide gap in testable criteria.

Weighted feasibility and weighted verifiability are the matching columns of Q divided by the matching columns of W. They stay on a 0–2 scale. They are rollups, not extra cells in R.

## How a cell is scored

### Unambiguous

0 when there is no `shall` or `must`.

1 when any one of these is present: a vague or banned term, a weak modal (`should`, `may`, `could`, `might`), passive wording, or no recognized actor.

2 when the statement has a binding obligation, names an actor, and has none of those problems.

Recognized actors are system, subsystem, software, hardware, controller, operator, user, vehicle, ECU, module, interface, and component. Vague terms are the list in `layered-engine.json` (for example "quickly", "sufficient", "user friendly").

### Complete

0 when there is no `shall` or `must`, or when the text says when, if, while, or unless and no condition, mode, or state was parsed.

2 when an actor, an action, and an object are present, and a condition is present whenever the sentence is conditional.

1 when an action was parsed but the actor, object, or required condition is missing.

### Verifiable

2 when the statement is quantitative or qualitatively observable.

Quantitative means the parser extracted a finite number and a known unit (`up to 12 mph`, `within 50 ms`, `not exceed 500 Nm`, `between 10 and 20 C`, `exceeds 20 km/h`). Speed units include mph, km/h, m/s, and knots. "Up to" is read as a maximum.

Qualitative, observation: a result verb such as display, show, indicate, illuminate, compute, calculate, determine, or measure, followed by concrete criterion words. The words after the verb are not a fixed list. "Display the vehicle speed" and "compute lateral deviation between the vehicle and the desired path" both count without a numeric limit. Illuminate, extinguish, flash, and blink count on their own.

Qualitative, binary event: an actor, `shall` or `must`, a resulting-state action, a concrete object, and a trigger such as upon, when, if, or after. "The guidance system shall disengage automatic guidance upon operator override input" counts, because a test can apply the override and observe whether guidance disengages. Weak actions such as be, provide, support, or ensure do not count. Vague wording such as "user friendly" or "easy" does not.

1 when a number was parsed without a unit, the text only points at an external criterion (`in accordance with`, `per the SRS`, `as specified in`), or the observation is named but not defined (`visible`, `shown`, `appearance`, or inspection with no stated result).

0 when there is no quantity, no observable result, and no binary event. Vague qualities such as "user friendly" do not raise this cell.

### Singular

0 when the statement has two or more `shall`/`must` clauses, or uses `and/or`.

1 when it has two or more standalone `and`/`or` words along with an obligation, runs longer than the configured word cap (default 60), or contains more than one sentence.

2 when it is one obligation in one sentence without those compound signals.

The word cap and the choice to count `and`/`or` come from `layered-engine.json` (`max_words_for_singular_warn`, default 60, and `count_and_or_as_compound`).

### Feasible

This cell does not look up cost, mass, or power. Missing budget data is not a failure.

0 when the text is unbounded (`infinite`, `unlimited`, `zero defect`, `100% of all`), or when this requirement's numeric value falls outside another requirement's bound on the same parameter and unit.

2 otherwise.

### Consistent

0 when a percentage is above 100%, or this requirement is part of a direct conflict or duplicate with another requirement in the document.

1 when the text is absolute (`always`, `never`, `all times`, `under all conditions`), open-ended (`etc.`, `and so on`, `and more`), mixes `shall` and `shall not`, or is part of a softer overlap such as a near-duplicate or terminology drift.

2 otherwise.

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

The analysis result includes `quality_matrix` (R), `weight_matrix` (W), `weighted_evaluation_matrix` (Q), `document_maturity` (\(M_{sys}\), \(\mathbf{d}\), and the weighted feasibility and verifiability rollups), and one `scores` object per requirement. `scores.quality_score` is \(q_i\). `scores.maturity` is the lowest raw cell.

### Classic routes

`POST /api/requirements/analyze` and `POST /api/requirements/analyze-specification` still serve the original analyzer. That path scores pass, warn, and fail dimensions and returns a summary of good, needs attention, and poor. It is not the matrix engine. The UI for it is `/classic`.

## Since the initial GitHub release

The first import was the classic analyzer only. It scored traceable, unambiguous, complete, verifiable, singular, feasible, consistent, and correct as pass, warn, or fail. It also built a typed requirement graph, simulated ripple impact on downstream requirements, and added linguistic, measurability, and embedded-rule badges. Input was pasted text or a PDF.

The workbench since then is a different review path:

- One specification is parsed once into a shared semantic frame, then reviewed with rules only. Optional model review, embeddings, and legacy reconstruction were removed from this path. Parent–child hierarchy is not executed.
- Layered quality is no longer a 0–100 penalty score. It is the matrices R, W, and Q above, with row maturity, \(q_i\), \(M_{sys}\), and the defect profile.
- Findings still describe problems. They no longer subtract points.
- The only scored attributes are unambiguous, complete, verifiable, singular, feasible, and consistent, in that column order. Necessary, design-prescription checks, and need citations are not scored.
- Verifiable accepts a measured limit and an objective qualitative criterion. A qualitative criterion is an observable result, such as computing lateral deviation or displaying a speed, or a binary event with an actor, a resulting state, an object, and a trigger, such as disengaging automatic guidance upon operator override.
- The separate document checks for completeness, consistency, bounded quantities, feasibility, and document maturity are not scored. The dashboard shows the system maturity index, the weighted feasibility and verifiability rollups, the defect profile, and Q.
- Absolute wording such as "always" or "never" is scored on Consistent. Feasible stays on unbounded claims and on a numeric value that falls outside another requirement's bound for the same parameter and unit.
- Singular uses the word cap and the `and`/`or` setting in `layered-engine.json`.
- Ripple simulation is disabled. Its entry points throw if called, and a review does not attach a ripple score.
- Traceability is a separate matrix that you port after analysis. The review does not invent trace links.
- The classic analyzer and its graph remain at `/classic`. They are not what Dashboard and Requirement Review display.
