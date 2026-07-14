import { PKO0420_FIELD_SPEC, PKO0420_SPEC_COUNTS } from "./official-pko0420-field-spec.js";

const SHOTOKU = "http://xml.e-tax.nta.go.jp/XSD/shotoku";
const GENERAL = "http://xml.e-tax.nta.go.jp/XSD/general";
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const IT_ORDER = [
  "ZEIMUSHO", "TEISYUTSU_DAY", "NOZEISHA_ID", "NOZEISHA_BANGO", "NOZEISHA_NM_KN", "NOZEISHA_NM",
  "NOZEISHA_ZIP", "NOZEISHA_ADR", "NOZEISHA_TEL", "SHOKUGYO", "DAIRI_NM", "DAIRI_TEL", "TETSUZUKI", "NENBUN"
];

export function createOfficialPko0420Definition() {
  const technical = [
    field("taxpayerId", "利用者識別番号", "IT/NOZEISHA_ID", { required: true, pattern: "^\\d{16}$", hint: "e-Taxの16桁の利用者識別番号" }),
    field("taxOfficeCode", "税務署番号", "IT/ZEIMUSHO/zeimusho_CD", { required: true, pattern: "^\\d{5}$", hint: "公式税務署コード（5桁）" }),
    field("softwareName", "作成ソフト名", "KOZ280/@softNM", { required: true, value: "e-Tax Filing Designer" }),
    field("creatorName", "作成者名", "KOZ280/@sakuseiNM", { required: true, value: "本人" }),
    field("creationDate", "XML作成日", "KOZ280/@sakuseiDay", { type: "date", required: true })
  ];
  const section = (id, label, start, end) => ({
    id,
    label,
    fields: PKO0420_FIELD_SPEC.filter((entry) => entry.item >= start && entry.item <= end)
  });
  return {
    taxType: "income",
    sourceType: "definition",
    title: "所得税及び復興特別所得税の予定納税額の減額申請書",
    rootElement: "KOZ280",
    namespace: SHOTOKU,
    version: "21.0",
    procedure: "PKO0420",
    procedureVersion: "26.0.0",
    schema: "shotoku/PKO0420-260.xsd",
    officialFieldSpec: true,
    officialProcedure: true,
    specCounts: PKO0420_SPEC_COUNTS,
    layout: { pages: [{ number: 1, label: "減額申請書", renderer: "html" }] },
    sections: [
      { id: "identity", label: "納税者・作成情報", fields: technical },
      section("application", "申請内容・理由", 1, 41),
      section("estimate", "申告納税見積額等の計算書", 42, 109),
      section("other", "通知・作成税理士", 110, 114)
    ]
  };
}

export function isOfficialPko0420Definition(definition) {
  return definition?.procedure === "PKO0420" && definition?.rootElement === "KOZ280" && definition?.version === "21.0";
}

export function buildOfficialPko0420Xml(definition, values) {
  const allFields = definition.sections.flatMap((section) => section.fields);
  const fields = allFields.filter((entry) => entry.item);
  const formValues = fields.filter((entry) => clean(values[entry.id]) !== "");
  const itEntries = buildItEntries(fields, values);
  const availableIds = new Set(itEntries.map((entry) => entry.id));
  const form = node("FORM");
  const referenceGroups = Map.groupBy(fields.filter((entry) => entry.idref), (entry) => `${entry.xmlPath}#${entry.occurrence}`);

  for (const entry of fields) {
    if (entry.idref) {
      const group = referenceGroups.get(`${entry.xmlPath}#${entry.occurrence}`) || [entry];
      if (entry !== group[0] || !availableIds.has(entry.idref)) continue;
      insertField(form, entry, { attrs: { IDREF: entry.idref } });
      continue;
    }
    if (!formValues.includes(entry)) continue;
    if (entry.component) {
      const leaf = insertField(form, entry, {});
      insertComponent(leaf, entry.component, clean(values[entry.id]), !["kubun", "kubun2"].includes(entry.commonType));
    } else if (["kubun", "kubun2"].includes(entry.commonType)) {
      insertComponent(insertField(form, entry, {}), "kubun_CD", clean(values[entry.id]), false);
    } else {
      insertField(form, entry, { text: clean(values[entry.id]) });
    }
  }

  const created = isoDate(values.creationDate) || new Date().toISOString().slice(0, 10);
  const software = clean(values.softwareName) || "e-Tax Filing Designer";
  const creator = clean(values.creatorName) || "本人";
  const children = form.children.map((entry) => renderNode(entry, 4)).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<DATA xmlns="${SHOTOKU}" xmlns:gen="${GENERAL}" xmlns:rdf="${RDF}" id="DATA1">`,
    '  <PKO0420 id="PKO0420-1" VR="26.0.0">',
    '    <CATALOG id="CATALOG1"><rdf:RDF/></CATALOG>',
    '    <CONTENTS id="CONTENTS1">',
    '      <IT id="IT1" VR="1.5">',
    ...itEntries.map((entry) => renderItEntry(entry, 4)),
    '      </IT>',
    `      <KOZ280 VR="21.0" softNM="${escapeXml(software)}" sakuseiNM="${escapeXml(creator)}" sakuseiDay="${created}" id="KOZ280-1">`,
    children,
    '      </KOZ280>',
    '    </CONTENTS>',
    '  </PKO0420>',
    '</DATA>'
  ].filter((line) => line !== "").join("\n");
}

function buildItEntries(fields, values) {
  const entries = new Map();
  const groups = Map.groupBy(fields.filter((entry) => entry.idref), (entry) => entry.idref);
  for (const [idref, group] of groups) {
    const populated = group.filter((entry) => clean(values[entry.id]));
    if (!populated.length) continue;
    const first = group[0];
    if (idref === "ZEIMUSHO") {
      entries.set(idref, compound(idref, [gen("zeimusho_CD", clean(values.taxOfficeCode)), gen("zeimusho_NM", clean(values[first.id]))]));
    } else if (["zipcode", "yymmdd", "tel-number", "yy"].includes(first.commonType)) {
      entries.set(idref, compound(idref, components(group, values)));
    } else {
      entries.set(idref, simple(idref, clean(values[first.id])));
    }
  }
  if (!entries.has("ZEIMUSHO")) entries.set("ZEIMUSHO", compound("ZEIMUSHO", [gen("zeimusho_CD", clean(values.taxOfficeCode))]));
  entries.set("NOZEISHA_ID", simple("NOZEISHA_ID", clean(values.taxpayerId)));
  if (!entries.has("NOZEISHA_NM")) entries.set("NOZEISHA_NM", simple("NOZEISHA_NM", ""));
  if (!entries.has("NOZEISHA_ADR")) entries.set("NOZEISHA_ADR", simple("NOZEISHA_ADR", ""));
  entries.set("TETSUZUKI", compound("TETSUZUKI", [plain("procedure_CD", "PKO0420"), plain("procedure_NM", "所得税及び復興特別所得税の予定納税額の減額申請")]));
  return [...entries.values()].sort((left, right) => order(left.id) - order(right.id));
}

function components(fields, values) {
  return fields.filter((entry) => entry.component && clean(values[entry.id])).map((entry) => gen(entry.component, clean(values[entry.id])));
}

function insertField(root, field, data) {
  let cursor = root;
  const segments = (field.pathMeta || field.xmlPath.split("/").map((tag) => ({ tag }))).filter((segment) => segment.tag !== "KOZ280");
  for (const segment of segments) {
    const repeated = segment.tag === field.repeatTag;
    const key = repeated ? `${segment.tag}#${field.occurrence}` : segment.tag;
    let child = cursor.children.find((entry) => entry.key === key);
    if (!child) {
      child = node(segment.tag, { key });
      cursor.children.push(child);
    }
    cursor = child;
  }
  Object.assign(cursor.attrs, data.attrs || {});
  if (data.text !== undefined) cursor.text = data.text;
  return cursor;
}

function insertComponent(leaf, component, value, general = true) {
  const name = general ? `gen:${component}` : component;
  let child = leaf.children.find((entry) => entry.name === name);
  if (!child) {
    child = node(name);
    leaf.children.push(child);
  }
  child.text = value;
}

function field(id, label, xmlPath, options = {}) { return { id, label, xmlPath, type: "text", page: 1, value: "", ...options }; }
function order(id) { const index = IT_ORDER.indexOf(id); return index < 0 ? 999 : index; }
function isoDate(value) { const text = clean(value); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ""; }
function clean(value) { return String(value ?? "").trim(); }
function escapeXml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
function simple(name, text) { return { name, id: name, text, attrs: {}, children: [] }; }
function compound(name, children) { return { name, id: name, text: "", attrs: {}, children }; }
function gen(name, text) { return { name: `gen:${name}`, text: String(text), attrs: {}, children: [] }; }
function plain(name, text) { return { name, text: String(text), attrs: {}, children: [] }; }
function node(name, data = {}) { return { name, key: data.key || name, attrs: data.attrs || {}, text: data.text ?? "", children: [] }; }

function renderItEntry(entry, depth) {
  const indent = "  ".repeat(depth);
  if (!entry.children.length) return `${indent}<${entry.name} ID="${entry.id}">${escapeXml(entry.text)}</${entry.name}>`;
  return `${indent}<${entry.name} ID="${entry.id}">\n${entry.children.map((child) => renderNode(child, depth + 1)).join("\n")}\n${indent}</${entry.name}>`;
}

function renderNode(entry, depth) {
  const indent = "  ".repeat(depth);
  const attrs = Object.entries(entry.attrs || {}).map(([key, value]) => ` ${key}="${escapeXml(value)}"`).join("");
  if (!entry.children.length && entry.text === "") return `${indent}<${entry.name}${attrs}/>`;
  if (!entry.children.length) return `${indent}<${entry.name}${attrs}>${escapeXml(entry.text)}</${entry.name}>`;
  return `${indent}<${entry.name}${attrs}>\n${entry.children.map((child) => renderNode(child, depth + 1)).join("\n")}\n${indent}</${entry.name}>`;
}
