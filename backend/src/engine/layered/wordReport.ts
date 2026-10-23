import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { LayeredAnalysisResult, StructuredFinding } from "./types";

function cell(text: string): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text: text.slice(0, 2000), size: 20 })],
      }),
    ],
  });
}

function countBySeverity(findings: StructuredFinding[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const f of findings) {
    o[f.severity] = (o[f.severity] ?? 0) + 1;
  }
  return o;
}

function countByAttribute(findings: StructuredFinding[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const f of findings) {
    o[f.attribute] = (o[f.attribute] ?? 0) + 1;
  }
  return o;
}

export async function buildLayeredAnalysisDocx(result: LayeredAnalysisResult): Promise<Buffer> {
  const allFindings = result.requirements.flatMap((r) => r.findings).concat(result.set_level_findings);
  const bySev = countBySeverity(allFindings);
  const byAttr = countByAttribute(allFindings);

  const sevParagraphs = Object.entries(bySev).map(
    ([k, v]) => new Paragraph({ children: [new TextRun(`${k}: ${v}`)] })
  );
  const attrParagraphs = Object.entries(byAttr).map(
    ([k, v]) => new Paragraph({ children: [new TextRun(`${k}: ${v}`)] })
  );

  const tableHeader = new TableRow({
    children: [
      cell("Req ID"),
      cell("Normalized text"),
      cell("Overall"),
      cell("Unamb."),
      cell("Complete"),
      cell("Verif."),
    ],
  });

  const scoreRows = result.requirements.slice(0, 80).map(
    (r) =>
      new TableRow({
        children: [
          cell(r.requirement.id),
          cell(r.requirement.normalized_text),
          cell(String(r.scores.overall)),
          cell(String(r.scores.unambiguous)),
          cell(String(r.scores.complete)),
          cell(String(r.scores.verifiable)),
        ],
      })
  );

  const findingsHeader = new TableRow({
    children: [
      cell("Req ID"),
      cell("Layer"),
      cell("Attribute"),
      cell("Severity"),
      cell("Explanation"),
    ],
  });

  const findingRows = allFindings.slice(0, 250).map(
    (f) =>
      new TableRow({
        children: [
          cell(f.requirement_id),
          cell(f.layer),
          cell(f.attribute),
          cell(f.severity),
          cell(f.explanation),
        ],
      })
  );

  const children = [
    new Paragraph({
      text: "Layered Requirements Analysis Report",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Analyzed (UTC): ", bold: true }),
        new TextRun(result.meta.analyzed_at),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Profile / mode: ", bold: true }),
        new TextRun(`${result.meta.profile} / ${result.meta.mode}`),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Requirements: ", bold: true }),
        new TextRun(String(result.meta.requirement_count)),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Executive summary", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun(`Total findings (incl. set-level): ${allFindings.length}.`),
      ],
    }),
    new Paragraph({ text: "Findings by severity", heading: HeadingLevel.HEADING_2 }),
    ...sevParagraphs,
    new Paragraph({ text: "Findings by attribute", heading: HeadingLevel.HEADING_2 }),
    ...attrParagraphs,
    new Paragraph({ text: "Scorecard", heading: HeadingLevel.HEADING_1 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [tableHeader, ...scoreRows],
    }),
    new Paragraph({ text: "Detailed findings", heading: HeadingLevel.HEADING_1 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [findingsHeader, ...findingRows],
    }),
    new Paragraph({ text: "Set-level findings", heading: HeadingLevel.HEADING_1 }),
    ...result.set_level_findings.slice(0, 50).map(
      (f) =>
        new Paragraph({
          children: [
            new TextRun({ text: `${f.issue_type} [${f.severity}]: `, bold: true }),
            new TextRun(f.explanation),
          ],
        })
    ),
  ];

  const doc = new Document({
    sections: [{ children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
