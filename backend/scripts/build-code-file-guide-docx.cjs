/**
 * Generates docs/ReqVectorlite-code-file-guide.docx from docs/reqvectorlite-code-file-guide.md.
 * Run: node backend/scripts/build-code-file-guide-docx.cjs
 */
const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
} = require("docx");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MD_PATH = path.join(REPO_ROOT, "docs", "reqvectorlite-code-file-guide.md");
const OUT_PATH = path.join(REPO_ROOT, "docs", "ReqVectorlite-code-file-guide.docx");

function stripMdBold(s) {
  return s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

function parseInlineRuns(text) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(new TextRun({ text: text.slice(last, m.index), size: 22 }));
    }
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(new TextRun({ text: tok.slice(2, -2), bold: true, size: 22 }));
    } else {
      parts.push(new TextRun({ text: tok.slice(1, -1), italics: true, size: 20, font: "Consolas" }));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) {
    parts.push(new TextRun({ text: text.slice(last), size: 22 }));
  }
  return parts.length ? parts : [new TextRun({ text: stripMdBold(text), size: 22 })];
}

function parseTable(lines, startIdx) {
  const rows = [];
  let i = startIdx;
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    const raw = lines[i].trim();
    if (/^\|[\s\-:|]+\|$/.test(raw)) {
      i++;
      continue;
    }
    const cells = raw
      .split("|")
      .map((c) => stripMdBold(c.trim()))
      .filter((c, idx, arr) => !(idx === 0 && c === "") && !(idx === arr.length - 1 && c === ""));
    rows.push(cells);
    i++;
  }
  if (rows.length === 0) return { table: null, nextIdx: startIdx };
  const docxRows = rows.map(
    (cells, ri) =>
      new TableRow({
        children: cells.map(
          (c) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: c.slice(0, 800),
                      size: 18,
                      bold: ri === 0,
                    }),
                  ],
                }),
              ],
            })
        ),
      })
  );
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: docxRows,
  });
  return { table, nextIdx: i };
}

function mdToDocxParagraphs(md) {
  const lines = md.split(/\r?\n/);
  const children = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      let j = i + 1;
      const code = [];
      while (j < lines.length && lines[j].trim() !== "```") {
        code.push(lines[j]);
        j++;
      }
      children.push(
        new Paragraph({
          shading: { type: "clear", fill: "F3F4F6" },
          children: [new TextRun({ text: code.join(" ").slice(0, 500), font: "Consolas", size: 18 })],
        })
      );
      i = j < lines.length ? j : lines.length - 1;
      continue;
    }

    if (trimmed === "" || trimmed === "---") {
      children.push(new Paragraph({ text: "" }));
      continue;
    }

    if (trimmed.startsWith("# ") && !trimmed.startsWith("## ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: trimmed.slice(2).trim(), bold: true, size: 40 })],
        })
      );
      continue;
    }

    if (trimmed.startsWith("## ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: trimmed.slice(3).trim(), bold: true, size: 28 })],
        })
      );
      continue;
    }

    if (trimmed.startsWith("### ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: trimmed.slice(4).trim(), bold: true, size: 24 })],
        })
      );
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: trimmed.slice(5).trim(), bold: true, size: 22 })],
        })
      );
      continue;
    }

    if (trimmed.startsWith("|")) {
      const { table, nextIdx } = parseTable(lines, i);
      if (table) {
        children.push(table);
        children.push(new Paragraph({ text: "" }));
        i = nextIdx - 1;
      }
      continue;
    }

    if (trimmed.startsWith("- ")) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInlineRuns(trimmed.slice(2)),
        })
      );
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      children.push(
        new Paragraph({
          numbering: { reference: "guide-num", level: 0 },
          children: parseInlineRuns(trimmed.replace(/^\d+\.\s*/, "")),
        })
      );
      continue;
    }

    children.push(new Paragraph({ children: parseInlineRuns(trimmed) }));
  }

  return children;
}

async function main() {
  if (!fs.existsSync(MD_PATH)) {
    console.error("Missing:", MD_PATH);
    process.exit(1);
  }
  const md = fs.readFileSync(MD_PATH, "utf8");
  const sectionChildren = mdToDocxParagraphs(md);

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "guide-num",
          levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "start" }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } },
        },
        children: sectionChildren,
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT_PATH, buf);
  console.log("Wrote", OUT_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
