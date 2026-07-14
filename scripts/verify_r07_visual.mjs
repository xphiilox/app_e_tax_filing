import { createDefaultHtmlTemplate } from "../src/html-renderer.js";
import { R07_FIELD_SPEC, R07_PAGES } from "../src/official-r07-field-spec.js";

const definition = {
  rootElement: "KOA020",
  officialFieldSpec: true,
  sections: [{ id: "official", fields: R07_FIELD_SPEC }]
};

const results = [];
for (const pageNumber of [1, 2]) {
  const page = R07_PAGES.find((entry) => entry.number === pageNumber);
  const html = createDefaultHtmlTemplate(definition, page);
  const expected = R07_FIELD_SPEC.filter((field) => field.page === pageNumber).map((field) => field.id);
  const actual = [...html.matchAll(/data-etax-field="([^"]+)"/g)].map((match) => match[1]);
  const missing = expected.filter((id) => !actual.includes(id));
  const duplicate = actual.filter((id, index) => id.startsWith("r07_") && actual.indexOf(id) !== index);
  const forbiddenRasterOrVector = /<(?:img|svg|canvas|object|embed)\b/i.test(html);
  const a4Pixels = html.includes("width:794px") && html.includes("height:1123px");
  const a4Print = html.includes("size:210mm 297mm");
  if (missing.length || duplicate.length || forbiddenRasterOrVector || !a4Pixels || !a4Print) {
    throw new Error(JSON.stringify({ pageNumber, missing, duplicate, forbiddenRasterOrVector, a4Pixels, a4Print }));
  }
  results.push({
    page: pageNumber,
    label: page.label,
    expectedFields: expected.length,
    renderedFields: actual.filter((id) => id.startsWith("r07_")).length,
    missingFields: 0,
    duplicateFields: 0,
    htmlOnly: true,
    screenCanvas: "794x1123 CSS px",
    printCanvas: "210x297 mm"
  });
}

console.log(JSON.stringify({
  specification: "国税庁 令和7年分 所得税及び復興特別所得税の申告書 01.pdf",
  result: "pass",
  referencePages: 4,
  uniqueReferenceLayouts: 2,
  implementedLayouts: ["第一表", "第二表"],
  renderer: "HTML/CSS/JavaScript",
  imageOrSvgDependency: false,
  pages: results
}, null, 2));
