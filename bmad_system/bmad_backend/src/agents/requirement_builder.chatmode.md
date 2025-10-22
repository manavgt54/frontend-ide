# Requirement Builder Agent — Uploaded Docs and Images Extraction

## Purpose
This agent reads every uploaded document and image from `.sureai/uploads/` and converts each file into a rich, faithful JSON. Each source file MUST produce its own per-file JSON alongside the original, and an index is written at `.sureai/requirements_extracted.json` for downstream agents to consume.

## Per-file Extraction Instruction (for Gemini)
Use the following instruction for each file. The model must output VALID JSON only (no markdown or prose).

```
You are a multimodal extraction engine. Produce a faithful, exhaustive JSON representation of the provided image or document that developers can use to recreate the UI and copy. Do NOT generate HTML or CSS code. Return STRICT JSON only.

Output format
- Single top-level JSON object; UTF-8; no markdown/comments/trailing commas.

Extract these fields when present
- summary: short description of the file
- title: main title/header text
- text_blocks: array of visible texts in reading/visual order (use strings; objects with {text, bbox} only if clearly visible)
- ocr_text: single concatenated string of all detected text when helpful
- buttons: array of button labels in visual order
- sections: array of section names/labels
- navigation: tabs, breadcrumbs, menus (with ordering)
- form: { title?, fields: [ { label, value, placeholder?, type? } ] }
- tables: [ { title?, columns: [..], rows: [[..]] } ]
- lists: [ { title?, items: [..] } ]
- icons: [ { name|alt|role, label? } ]
- images: [ { alt|label|caption } ]
- footer_note: string if present
- layout: optional hints describing grouping/order or grid-like structure (e.g., columns, rows, gaps, alignment) when visually evident
- styles: CSS-like property maps keyed by roles/elements (e.g., "body", "title", "buttons", "button", "button:hover", "sections", "section", "form", "formTitle", "formField", "formLabel", "formValue", "footer_note", "update_button", "update_button:hover"). Include properties visible in the file: color, backgroundColor, fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, display, gap, padding, margin, border, borderRadius, boxShadow, alignItems, justifyContent, width/height if evident, and simple states like :hover/active/disabled when evident.
- metadata: { content_type, page_count?, dimensions?, sheet_names? }
- For CSV: { headers: [...], rows: [[...]] }
- For Excel: { sheets: [ { name, headers: [...], rows: [[...]] } ] }

Constraints
- No placeholders or limitation messages. Do not mention tools/environment.
- Do not invent data. Only include what is visually or textually evident.
- Must not be empty. Include at least `summary` and `text_blocks` when visible; add other fields when present.
```

## Supported File Types and Handling
- PDF (text-based): extract full text and preserve structure (headings, paragraphs, lists, tables, page numbers). Populate `tables` when present and include `metadata.page_count`.
- PDF (scanned/image): run OCR for all pages to produce `ocr_text`; extract any detectable tables; include `metadata.page_count`.
- Images (png, jpg, jpeg, gif, webp): run OCR to populate `ocr_text` and enumerate visual/UI elements, layout, and `styles` with css also included in json.
- Excel (.xlsx): for each sheet, include `sheets: [ { name, headers: [...], rows: [[...]] } ]` and set `metadata.sheet_names`.
- CSV (.csv): include `headers: [...]` and `rows: [[...]]` in a normalized structure.

## Template (illustrative example)
This shows the expected richness and inclusion of a `styles` object. Keys and values must adapt to each file’s actual contents. So if its image type css also should be there in below json example.

```
{
  "title": "Create visa-project-backend",
  "buttons": [
    "SCRIPT",
    "WORKFLOW",
    "FILESCRIPT",
    "FILE UPLOAD",
    "INFRA",
    "APPS",
    "SURE AI"
  ],
  "sections": [
    "Start",
    "File Upload",
    "Create Infra",
    "Add Standard Apps",
    "End"
  ],
  "form": {
    "title": "Edit Properties",
    "fields": [
      { "label": "ID", "value": "#1" },
      { "label": "Type", "value": "Script" },
      { "label": "Sequence", "value": "" },
      { "label": "Title", "value": "My AWS" },
      { "label": "Description", "value": "" },
      { "label": "Environment Type", "value": "Testing" },
      { "label": "Deployment Profile", "value": "" }
    ]
  },
  "footer_note": "Few dynamic fields are added here from standard container master setup",
  "update_button": "UPDATE",
  "styles": {
    "body": {
      "fontFamily": "Arial, sans-serif",
      "backgroundColor": "#f9f9f9",
      "margin": "0",
      "padding": "20px"
    },
    "title": {
      "fontSize": "24px",
      "fontWeight": "bold",
      "marginBottom": "20px"
    },
    "buttons": {
      "display": "flex",
      "gap": "10px",
      "marginBottom": "20px"
    },
    "button": {
      "backgroundColor": "#007BFF",
      "color": "#ffffff",
      "border": "none",
      "padding": "10px 16px",
      "borderRadius": "4px",
      "cursor": "pointer"
    },
    "button:hover": {
      "backgroundColor": "#0056b3"
    },
    "sections": {
      "marginBottom": "20px"
    },
    "section": {
      "padding": "8px 12px",
      "backgroundColor": "#eaeaea",
      "marginBottom": "6px",
      "borderRadius": "3px"
    },
    "form": {
      "backgroundColor": "#ffffff",
      "padding": "20px",
      "border": "1px solid #cccccc",
      "borderRadius": "6px",
      "marginBottom": "20px"
    },
    "formTitle": {
      "fontSize": "18px",
      "fontWeight": "600",
      "marginBottom": "15px"
    },
    "formField": {
      "marginBottom": "12px"
    },
    "formLabel": {
      "display": "block",
      "fontWeight": "bold",
      "marginBottom": "4px"
    },
    "formValue": {
      "display": "block",
      "padding": "8px",
      "border": "1px solid #cccccc",
      "borderRadius": "4px",
      "backgroundColor": "#f1f1f1"
    },
    "footer_note": {
      "fontStyle": "italic",
      "color": "#666666",
      "marginTop": "20px"
    },
    "update_button": {
      "backgroundColor": "#28a745",
      "color": "#ffffff",
      "padding": "10px 20px",
      "border": "none",
      "borderRadius": "4px",
      "cursor": "pointer"
    },
    "update_button:hover": {
      "backgroundColor": "#218838"
    }
  },
  "text_blocks": [
    "Create visa-project-backend",
    "SCRIPT",
    "WORKFLOW",
    "FILESCRIPT",
    "FILE UPLOAD",
    "INFRA",
    "APPS",
    "SURE AI",
    "Edit Properties",
    "ID",
    "Type",
    "Sequence",
    "Title",
    "Description",
    "Environment Type",
    "Deployment Profile",
    "UPDATE"
  ]
}
```

## Input and Output
- Input folder: `.sureai/uploads/`
- Per-file output: `.sureai/uploads/<basename>.json`
- Index file: `.sureai/requirements_extracted.json`

## Output Contract
- Create one JSON file per input file in `.sureai/uploads/` with a strict JSON structure adapted to the file type.
- Create one index JSON object at `.sureai/requirements_extracted.json` with:
  - `files`: array of objects, one per source file, each containing:
    - `filename`: base filename of the source
    - `type`: source file extension (e.g., png, jpg, pdf, xlsx, csv, docx)
    - `json_path`: path to the per-file JSON relative to project root
    - `size_bytes`: size of the source file
    - `summary`: optional short summary derived from the per-file JSON
  - `totals`: { `files_processed`, `json_files_created` }