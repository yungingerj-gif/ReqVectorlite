import { create } from "zustand";
import type { AnalysisMode, LayeredAnalysisResult } from "../types/layeredTypes";
import type {
  SuggestionFeedbackEntry,
  SuggestionFeedbackVerdict,
  TrainingPipelineStatus,
} from "../types/suggestionFeedback";
import {
  DEFAULT_TRAINING_PIPELINE_STATUS,
  suggestionFeedbackCompositeKey,
  TRAINING_PIPELINE_LABELS,
} from "../types/suggestionFeedback";
import * as layeredApi from "../api/layeredApi";
import type { RowFilter, SeverityFilter, TableSortColumn } from "./analysisUtils";

export type { SeverityFilter };
export type SortColumn = TableSortColumn;
export type DashboardFilters = RowFilter;

function buildSourceReplacements(
  result: LayeredAnalysisResult,
  accepted: Record<string, string>
): layeredApi.SourceReplacement[] {
  const list: layeredApi.SourceReplacement[] = [];
  for (const row of result.requirements) {
    const to = accepted[row.requirement.id];
    if (to == null || !to.trim()) continue;
    const from = row.requirement.source_text;
    if (!from.trim() || from.trim() === to.trim()) continue;
    list.push({ from, to: to.trim() });
  }
  return list.sort((a, b) => b.from.length - a.from.length);
}

interface AnalysisState {
  analysisResult: LayeredAnalysisResult | null;
  selectedRequirementId: string | null;
  profile: string;
  mode: AnalysisMode;
  rawText: string;
  sourceDocument: string;
  /** Last file uploaded for analysis (single-document mode); used for revised-source export. */
  lastSourceFile: File | null;
  /**
   * When true, UI shows two upload slots (child + parent) and Run uses both files for parent–child analysis.
   */
  parentChildCompareEnabled: boolean;
  /**
   * Unused: this branch never sends LLM same-intent requests.
   */
  sameIntentLlmEnabled: boolean;
  hierarchyChildFile: File | null;
  hierarchyParentFile: File | null;
  loading: boolean;
  error: string | null;
  filters: DashboardFilters;
  sortColumn: SortColumn;
  sortDirection: "asc" | "desc";
  engineConfig: Record<string, unknown> | null;
  configLoadError: string | null;
  acceptedRewrites: Record<string, string>;
  /** Identifies one analysis run so feedback keys stay scoped when exporting. */
  feedbackRunId: string | null;
  /** Latest reviewer verdict per (run, requirement, suggestion surface). */
  suggestionFeedbackByKey: Record<string, SuggestionFeedbackEntry>;

  setProfile: (profile: string) => void;
  setMode: (mode: AnalysisMode) => void;
  setRawText: (rawText: string) => void;
  setSourceDocument: (sourceDocument: string) => void;
  setParentChildCompareEnabled: (enabled: boolean) => void;
  setSameIntentLlmEnabled: (enabled: boolean) => void;
  setHierarchyChildFile: (file: File | null) => void;
  setHierarchyParentFile: (file: File | null) => void;
  setSelectedRequirementId: (id: string | null) => void;
  setFilters: (patch: Partial<DashboardFilters>) => void;
  toggleSort: (column: SortColumn) => void;
  clearAnalysis: () => void;
  runAnalyze: () => Promise<void>;
  runUpload: (file: File) => Promise<void>;
  exportDocx: () => Promise<void>;
  exportRevisedSourceDocument: () => Promise<void>;
  acceptRewrite: (requirementId: string, text: string) => void;
  clearAcceptedRewrite: (requirementId: string) => void;
  recordSuggestionFeedback: (payload: {
    runId: string;
    requirementId: string;
    sourceKey: string;
    verdict: SuggestionFeedbackVerdict;
    originalSuggestion: string;
    finalText?: string;
    trainingPipelineStatus?: TrainingPipelineStatus;
  }) => void;
  updateSuggestionFeedbackPipelineStatus: (compositeKey: string, status: TrainingPipelineStatus) => void;
  exportSuggestionFeedbackNdjson: () => string;
  loadEngineConfig: () => Promise<void>;
  setEngineConfig: (config: Record<string, unknown> | null) => void;
}

const SAMPLE = `FR-1: The system shall respond within 50 ms.
FR-2: The system should be user friendly and quickly provide results.
FR-3: Maximum pressure shall be 200 bar.`;

function newRunFeedbackState(): Pick<AnalysisState, "feedbackRunId" | "suggestionFeedbackByKey"> {
  return { feedbackRunId: crypto.randomUUID(), suggestionFeedbackByKey: {} };
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  analysisResult: null,
  selectedRequirementId: null,
  profile: "default_active_spec",
  mode: "active",
  rawText: SAMPLE,
  sourceDocument: "",
  lastSourceFile: null,
  parentChildCompareEnabled: false,
  sameIntentLlmEnabled: false,
  hierarchyChildFile: null,
  hierarchyParentFile: null,
  loading: false,
  error: null,
  filters: { profile: "all", severity: "all", type: "all" },
  sortColumn: "id",
  sortDirection: "asc",
  engineConfig: null,
  configLoadError: null,
  acceptedRewrites: {},
  feedbackRunId: null,
  suggestionFeedbackByKey: {},

  setProfile: (profile) => set({ profile }),
  setMode: (mode) => set({ mode }),
  setRawText: (rawText) => set({ rawText }),
  setSourceDocument: (sourceDocument) => set({ sourceDocument }),
  setParentChildCompareEnabled: (parentChildCompareEnabled) =>
    set(() => ({
      parentChildCompareEnabled,
      ...(parentChildCompareEnabled
        ? { lastSourceFile: null }
        : { hierarchyChildFile: null, hierarchyParentFile: null }),
    })),
  setSameIntentLlmEnabled: (sameIntentLlmEnabled) => set({ sameIntentLlmEnabled }),
  setHierarchyChildFile: (hierarchyChildFile) => set({ hierarchyChildFile }),
  setHierarchyParentFile: (hierarchyParentFile) => set({ hierarchyParentFile }),
  setSelectedRequirementId: (selectedRequirementId) => set({ selectedRequirementId }),
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  toggleSort: (column) =>
    set((s) =>
      s.sortColumn === column
        ? { sortDirection: s.sortDirection === "asc" ? "desc" : "asc" }
        : { sortColumn: column, sortDirection: "asc" }
    ),

  clearAnalysis: () =>
    set({
      analysisResult: null,
      selectedRequirementId: null,
      error: null,
      rawText: "",
      sourceDocument: "",
      lastSourceFile: null,
      hierarchyChildFile: null,
      hierarchyParentFile: null,
      acceptedRewrites: {},
      feedbackRunId: null,
      suggestionFeedbackByKey: {},
    }),

  acceptRewrite: (requirementId, text) =>
    set((s) => ({
      acceptedRewrites: { ...s.acceptedRewrites, [requirementId]: text.trim() },
    })),

  clearAcceptedRewrite: (requirementId) =>
    set((s) => {
      const next = { ...s.acceptedRewrites };
      delete next[requirementId];
      return { acceptedRewrites: next };
    }),

  recordSuggestionFeedback: (payload) => {
    const key = suggestionFeedbackCompositeKey(payload.runId, payload.requirementId, payload.sourceKey);
    const prev = get().suggestionFeedbackByKey[key];
    const entry: SuggestionFeedbackEntry = {
      key,
      run_id: payload.runId,
      requirement_id: payload.requirementId,
      source_key: payload.sourceKey,
      verdict: payload.verdict,
      original_suggestion: payload.originalSuggestion,
      final_text: payload.finalText,
      created_at: prev?.created_at ?? new Date().toISOString(),
      training_pipeline_status:
        payload.trainingPipelineStatus ??
        prev?.training_pipeline_status ??
        DEFAULT_TRAINING_PIPELINE_STATUS,
    };
    set((s) => ({
      suggestionFeedbackByKey: { ...s.suggestionFeedbackByKey, [key]: entry },
    }));
  },

  updateSuggestionFeedbackPipelineStatus: (compositeKey, status) =>
    set((s) => {
      const e = s.suggestionFeedbackByKey[compositeKey];
      if (!e) return s;
      return {
        suggestionFeedbackByKey: {
          ...s.suggestionFeedbackByKey,
          [compositeKey]: { ...e, training_pipeline_status: status },
        },
      };
    }),

  exportSuggestionFeedbackNdjson: () => {
    const { suggestionFeedbackByKey, feedbackRunId, analysisResult } = get();
    const entries = Object.values(suggestionFeedbackByKey)
      .filter((e) => e.run_id === feedbackRunId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const meta = analysisResult?.meta;
    const lines = entries.map((e) =>
      JSON.stringify({
        kind: "ai_suggestion_feedback",
        run_id: e.run_id,
        requirement_id: e.requirement_id,
        source_key: e.source_key,
        verdict: e.verdict,
        original_suggestion: e.original_suggestion,
        final_text: e.final_text ?? null,
        created_at: e.created_at,
        training_pipeline_status: e.training_pipeline_status,
        training_pipeline_status_label: TRAINING_PIPELINE_LABELS[e.training_pipeline_status],
        analysis_meta: meta
          ? {
              profile: meta.profile,
              mode: meta.mode,
              analyzed_at: meta.analyzed_at,
              source_document: meta.source_document ?? null,
            }
          : null,
      })
    );
    return lines.length > 0 ? `${lines.join("\n")}\n` : "";
  },

  runAnalyze: async () => {
    const {
      rawText,
      sourceDocument,
      parentChildCompareEnabled,
      hierarchyChildFile,
      hierarchyParentFile,
    } = get();

    if (parentChildCompareEnabled) {
      if (!hierarchyChildFile || !hierarchyParentFile) {
        set({ error: "Choose both a child file and a parent file, then run analysis." });
        return;
      }
      set({ loading: true, error: null });
      try {
        const fd = new FormData();
        fd.append("file", hierarchyChildFile, hierarchyChildFile.name);
        fd.append("parent_file", hierarchyParentFile, hierarchyParentFile.name);
        fd.append("profile", "default_active_spec");
        fd.append("mode", "active");
        const analysisResult = await layeredApi.analyzeLayeredUpload(fd);
        set({
          analysisResult,
          rawText: analysisResult.requirements.map((r) => r.requirement.source_text).join("\n\n"),
          sourceDocument: hierarchyChildFile.name,
          lastSourceFile: hierarchyChildFile,
          selectedRequirementId: analysisResult.requirements[0]?.requirement.id ?? null,
          loading: false,
          acceptedRewrites: {},
          ...newRunFeedbackState(),
        });
      } catch (e) {
        set({
          error: e instanceof Error ? e.message : "Analysis failed",
          analysisResult: null,
          selectedRequirementId: null,
          loading: false,
          acceptedRewrites: {},
          feedbackRunId: null,
          suggestionFeedbackByKey: {},
        });
      }
      return;
    }

    const text = rawText.trim();
    if (!text) {
      set({ error: "Paste or upload requirements before running analysis." });
      return;
    }
    set({ loading: true, error: null });
    try {
      const analysisResult = await layeredApi.analyzeLayered({
        rawText: text,
        profile: "default_active_spec",
        mode: "active",
        sourceDocument: sourceDocument.trim() || "Pasted requirements",
      });
      set({
        analysisResult,
        selectedRequirementId: analysisResult.requirements[0]?.requirement.id ?? null,
        loading: false,
        acceptedRewrites: {},
        lastSourceFile: null,
        ...newRunFeedbackState(),
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Analysis failed",
        analysisResult: null,
        selectedRequirementId: null,
        loading: false,
        acceptedRewrites: {},
        lastSourceFile: null,
        feedbackRunId: null,
        suggestionFeedbackByKey: {},
      });
    }
  },

  runUpload: async (file: File) => {
    const { parentChildCompareEnabled } = get();
    if (parentChildCompareEnabled) {
      set({
        error: "Parent/child mode is on — use the Child and Parent upload areas, then Run analysis.",
      });
      return;
    }
    const fd = new FormData();
    fd.append("file", file, file.name);
    fd.append("profile", "default_active_spec");
    fd.append("mode", "active");
    set({ loading: true, error: null });
    try {
      const analysisResult = await layeredApi.analyzeLayeredUpload(fd);
      set({
        analysisResult,
        rawText: analysisResult.requirements.map((r) => r.requirement.source_text).join("\n\n"),
        sourceDocument: file.name,
        lastSourceFile: file,
        selectedRequirementId: analysisResult.requirements[0]?.requirement.id ?? null,
        loading: false,
        acceptedRewrites: {},
        ...newRunFeedbackState(),
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "Upload failed",
        analysisResult: null,
        selectedRequirementId: null,
        lastSourceFile: null,
        loading: false,
        acceptedRewrites: {},
        feedbackRunId: null,
        suggestionFeedbackByKey: {},
      });
    }
  },

  exportDocx: async () => {
    const { analysisResult } = get();
    if (!analysisResult) return;
    set({ error: null });
    try {
      const blob = await layeredApi.exportLayeredDocx(analysisResult);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `layered-analysis-${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Export failed" });
    }
  },

  exportRevisedSourceDocument: async () => {
    const { analysisResult, acceptedRewrites, rawText, lastSourceFile, sourceDocument } = get();
    if (!analysisResult) return;
    const replacements = buildSourceReplacements(analysisResult, acceptedRewrites);
    const uploadName = lastSourceFile?.name ?? (sourceDocument.trim() || "requirements.txt");
    const blobSource: File | Blob =
      lastSourceFile ?? new Blob([rawText], { type: "text/plain;charset=utf-8" });
    set({ error: null });
    try {
      const { blob, downloadName } = await layeredApi.exportRevisedSource(blobSource, uploadName, replacements);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "Revised source export failed" });
    }
  },

  loadEngineConfig: async () => {
    set({ configLoadError: null });
    try {
      const engineConfig = await layeredApi.getLayeredEngineConfig();
      set({ engineConfig });
    } catch (e) {
      set({
        engineConfig: null,
        configLoadError: e instanceof Error ? e.message : "Config load failed",
      });
    }
  },

  setEngineConfig: (engineConfig) => set({ engineConfig }),
}));
