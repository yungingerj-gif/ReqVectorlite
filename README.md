# ReqVectorlite

ReqVectorlite reviews one requirements specification with deterministic rules. There is no language model and no network call during analysis. Each requirement is scored through four gates. A later gate stays blank until every earlier gate is exactly 2. The document then gets a maturity index, capped by one set-level consistency score.

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
3. Deterministic findings still run. They explain vague wording, missing structure, singular-statement problems, set-level overlap, and contradictions inside the document. Findings do not change a gate number. Direct conflicts, duplicates, a percentage above 100%, and a mix of `shall` and `shall not` set the document consistency score.
4. The gate row is scored from the frame. Feasibility also compares numeric bounds across the document. A suggested rewrite is kept only when it passes a later gate and every gate that was already 2 stays 2.

Parent–child comparison and legacy reconstruction are not run. Uploads accept `.txt`, `.csv`, `.pdf`, `.docx`, `.xlsx`, and `.xls`.

The engine configuration that a review actually uses is `backend/config/layered-engine.json`. Edits in Config Profiles, including the safety-critical weight, are stored in this browser only. They do not change the file the API reads.

The domain-constraint library can be viewed and saved on the server. Scoring does not consult it.

## The gate matrix

A specification with \(n\) requirements has one \(n \times 4\) matrix, R. Columns, in order, are Ambiguous, Feasible, Verifiable, and Singular. A cell is 0, 1, or 2 only when that gate was reached. A later cell is blank until every earlier gate is exactly 2. A 1 does not open the next gate. Complete is not scored.

The stage is the first gate that is not 2, or `done` when all four are 2. That stage is where the requirement stopped. The first stage is `ambiguous`, because a score below 2 means the statement is ambiguous.

**Row maturity** is the number of leading 2s divided by 4:

\[
\mu_i=\frac{s_i}{4}
\]

\(s_i\) is that leading run of 2s, from 0 to 4. \(\mu_i\) is from 0 to 1. The maturity percentage in the table is \(\mu_i \times 100\). The denominator is always 4. A 0, a 1, or a blank cell stops the count, and later cells are not added in.

A requirement is marked safety-critical when its own text says safety-critical, ASIL A–D, or SIL 1–4. The configured weight \(\omega\) (default 2) is recorded on that row. It does not scale the gate cells.

### Document scores

**Mean maturity** \(M\) is the average of \(\mu_i\).

**Set consistency** \(\kappa\) is one score for the whole specification, not a column of R.

0 when any requirement states a percentage above 100%, contains `shall not`, or the findings include a direct conflict or a duplicate. The `shall` inside `shall not` counts, so a prohibition on its own is enough. The two words have to fall within 400 characters.

1 when the findings include a softer overlap: a near-duplicate, terminology drift, an overlap, or a possible missing decomposition.

2 otherwise.

Absolute wording such as "always" or "under all conditions" scores Feasible 0. It does not also lower \(\kappa\).

**System maturity index**

\[
M^*=
\begin{cases}
0 & \text{if }\kappa=0 \\
\min(M, 0.5) & \text{if }\kappa=1 \\
M & \text{if }\kappa=2
\end{cases}
\]

The stored index is \(M^* \times 100\).

### Rewrite acceptance

A suggested rewrite is stored for the revised-source download only when the candidate row has more leading 2s than the current row, and every cell that was already 2 is still 2. The candidate is scored with the other requirements still in the set, so a number that falls outside another requirement's bound still fails Feasible. A rewrite that fixes a later gate by making an earlier 2 into a 1 or a 0 is discarded.

## How a reached gate is scored

### Ambiguous

This gate is always scored. A score below 2 means the statement is ambiguous, and the stage is `ambiguous`.

0 when there is no `shall` or `must`.

1 when any one of these is present: a vague or banned term, a weak modal (`should`, `may`, `could`, `might`), passive wording, or no recognized actor.

2 when the statement has a binding obligation, names an actor, and has none of those problems. That 2 is what opens Feasible.

The parser recognizes an actor only from this list: system, subsystem, software, hardware, controller, operator, user, vehicle, ECU, module, interface, and component. A subject outside that list, such as "warning lamp", scores 1. Passive wording is a word ending in "ed", or the words "built", "shown", or "made", within two words after `shall`, `must`, `is`, `are`, or `be`. That also matches "red" and "speed". Vague terms are the list in `layered-engine.json` (for example "quickly", "sufficient", "user friendly"). "The system shall be user friendly" stops here, so Feasible is left blank.

### Feasible

Scored only when Ambiguous is 2. This gate does not look up cost, mass, or power. Missing budget data is not a failure.

0 when the text is unbounded (`infinite`, `unlimited`, `zero defect`, `100% of all`), absolute (`always`, `never`, `all times`, `under all conditions`), or when this requirement's numeric value falls outside another requirement's bound on the same parameter and unit.

2 otherwise.

Generic terms such as "user friendly" or "easy" already score Ambiguous 1, so the row stops before Feasible. A requirement that reaches Feasible scores 0 or 2.

"The system shall always operate under all conditions" is Ambiguous 2 and Feasible 0. Verifiable and Singular stay blank, and maturity is 25%.

### Verifiable

Scored only when Feasible is 2.

2 when the statement is quantitative or qualitatively observable.

Quantitative means the parser extracted a finite number and a known unit (`up to 12 mph`, `within 50 ms`, `not exceed 500 Nm`, `between 10 and 20 C`, `exceeds 20 km/h`). Speed units include mph, km/h, m/s, and knots. "Up to" is read as a maximum.

Qualitative, observation: a result verb such as display, show, indicate, illuminate, compute, calculate, determine, or measure, followed by concrete criterion words. The words after the verb are not a fixed list. "Display the vehicle speed" and "compute lateral deviation between the vehicle and the desired path" both count without a numeric limit. Illuminate, extinguish, flash, and blink count on their own.

Qualitative, binary event: an actor, `shall` or `must`, a resulting-state action, a concrete object, and a trigger such as upon, when, if, or after. "The guidance system shall disengage automatic guidance upon operator override input" counts, because a test can apply the override and observe whether guidance disengages. Weak actions such as be, provide, support, or ensure do not count. Vague wording such as "user friendly" or "easy" does not.

1 when a number was parsed without a unit, the text only points at an external criterion (`in accordance with`, `per the SRS`, `as specified in`), or the observation is named but not defined (`visible`, `shown`, `appearance`, or inspection with no stated result).

0 when there is no quantity, no observable result, and no binary event.

### Singular

Scored only when Verifiable is 2.

0 when the statement has two or more `shall`/`must` clauses, or uses `and/or`.

1 when it has two or more standalone `and`/`or` words along with an obligation, runs longer than the configured word cap (default 60), or contains more than one sentence.

2 when it is one obligation in one sentence without those compound signals.

The word cap and the choice to count `and`/`or` come from `layered-engine.json` (`max_words_for_singular_warn`, default 60, and `count_and_or_as_compound`).

## Traceability

Analysis does not fill the traceability matrix. After a review, port the requirements into it. A leading requirement ID is placed in the Requirement ID column and removed from the statement. Other columns are filled only when the document defines them. Requirement ID and Requirement statement stay read-only. Every other cell can be edited. An empty cell is shown as an em dash. Porting again replaces those edits.

## Reports

The Reports page builds a Word analysis report from the current result. It includes the system maturity index, set consistency, and the per-requirement gate scorecard. Blank gates are shown as an em dash.

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
| `POST /api/layered/rewrite-advances` | JSON body `{ "currentText", "candidateText", "peerTexts" }`. Returns whether the candidate passes a later gate without dropping a gate that was already 2. |
| `POST /api/layered/export/analysis-docx` | JSON body `{ "result": <LayeredAnalysisResult> }`. Returns a `.docx`. |
| `POST /api/layered/export/revised-source` | Multipart `file` plus `patch`, a JSON string `{ "replacements": [{ "from", "to" }] }`. |

The analysis result includes `quality_matrix` (R, four columns, cells may be null), `document_maturity` (`consistency` is \(\kappa\), `mean_maturity` is \(M\), and `system_maturity_index` is \(M^* \times 100\)), and one `scores` object per requirement. The first cell is `scores.unambiguous`. The review labels that column Ambiguous. `scores.maturity` is \(\mu_i\). `scores.quality_score` is that value as a percentage. `scores.stage` is `ambiguous`, `feasible`, `verifiable`, `singular`, or `done`.

### Classic routes

`POST /api/requirements/analyze` and `POST /api/requirements/analyze-specification` still serve the original analyzer. That path scores pass, warn, and fail dimensions and returns a summary of good, needs attention, and poor. It is not the matrix engine. The UI for it is `/classic`.

## Since the initial GitHub release

The first import was the classic analyzer only. It scored traceable, unambiguous, complete, verifiable, singular, feasible, consistent, and correct as pass, warn, or fail. It also built a typed requirement graph, simulated ripple impact on downstream requirements, and added linguistic, measurability, and embedded-rule badges. Input was pasted text or a PDF.

The workbench since then is a different review path:

- One specification is parsed once into a shared semantic frame, then reviewed with rules only. Optional model review, embeddings, and legacy reconstruction were removed from this path. Parent–child hierarchy is not executed.
- Layered quality is no longer a 0–100 penalty score. It is the four-gate matrix above. Maturity is the share of leading gates scored 2. The system maturity index is the mean of those shares, capped by set consistency.
- Findings still describe problems. They do not change a gate number. Direct and soft conflicts feed set consistency only.
- The scored gates are ambiguous, then feasible, then verifiable, then singular. A score below 2 on the first gate means the statement is ambiguous. Complete is not scored. Consistent is the set score \(\kappa\), not a row cell. Necessary, design-prescription checks, and need citations are not scored.
- Verifiable is reached only after Ambiguous and Feasible are both 2. It accepts a measured limit and an objective qualitative criterion. A qualitative criterion is an observable result, such as computing lateral deviation or displaying a speed, or a binary event with an actor, a resulting state, an object, and a trigger, such as disengaging automatic guidance upon operator override.
- The dashboard shows the system maturity index, set consistency, mean gate maturity, and R. A blank cell means that gate was withheld.
- Absolute wording such as "always", "never", or "under all conditions" scores Feasible 0 and stops the row there. Feasible is also 0 for an unbounded claim or a numeric value outside another requirement's bound. Generic terms such as "user friendly" stop the row at Ambiguous, so they do not receive a Feasible score.
- Singular is scored only after Verifiable is 2. It uses the word cap and the `and`/`or` setting in `layered-engine.json`.
- A rewrite is kept only when its gate row passes further than the current row and does not lower a gate that was already 2.
- Ripple simulation is disabled. Its entry points throw if called, and a review does not attach a ripple score.
- Traceability is a separate matrix that you port after analysis. The review does not invent trace links.
- The classic analyzer and its graph remain at `/classic`. They are not what Dashboard and Requirement Review display.
