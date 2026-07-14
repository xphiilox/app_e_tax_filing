const PROCEDURE_NAMESPACE = "http://xml.e-tax.nta.go.jp/XSD/shotoku";
const GENERAL_NAMESPACE = "http://xml.e-tax.nta.go.jp/XSD/general";
const COMMON_NAMESPACE = "http://xml.e-tax.nta.go.jp/XSD/kyotsu";
const RDF_NAMESPACE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const IT_ORDER = [
  "ZEIMUSHO", "TEISYUTSU_DAY", "NOZEISHA_ID", "NOZEISHA_BANGO", "NOZEISHA_NM_KN", "NOZEISHA_NM",
  "NOZEISHA_ZIP", "NOZEISHA_ADR", "ICHIGATSUIPPI_ADR", "NOZEISHA_YAGO", "NOZEISHA_TEL", "BIRTHDAY",
  "SETAINUSHI_NM", "SETAINUSHI_ZOKU", "SHOKUGYO", "KANPU_KINYUKIKAN", "DAIRI_NM", "DAIRI_TEL",
  "TETSUZUKI", "NENBUN", "SHINKOKU_KBN"
];

export function isOfficialR07Definition(definition) {
  return definition?.rootElement === "KOA020" && definition?.version === "23.0";
}

export function buildOfficialR07Xml(definition, values) {
  const fields = definition.sections.flatMap((section) => section.fields);
  const official = fields.filter((field) => field.item && field.xmlPath?.startsWith("KOA020-"));
  const populated = official.filter((field) => clean(values[field.id]) !== "");
  const itEntries = [...buildItEntries(populated, values), ...buildRequiredItEntries(values)]
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index)
    .sort((left, right) => IT_ORDER.indexOf(left.id) - IT_ORDER.indexOf(right.id));
  const availableIds = new Set([...itEntries.map((entry) => entry.id), ...populated.map((field) => field.officialId).filter(Boolean)]);
  const formRoot = node("FORM");
  const referenceGroups = Map.groupBy(official.filter((field) => field.idref), (field) => `${field.xmlPath}#${field.occurrence}`);

  for (const field of official) {
    if (field.idref) {
      const group = referenceGroups.get(`${field.xmlPath}#${field.occurrence}`) || [field];
      if (field !== group[0] || !group.some((entry) => clean(values[entry.id])) || !availableIds.has(field.idref)) continue;
      insertField(formRoot, field, { attrs: { IDREF: field.idref } });
      continue;
    }
    if (clean(values[field.id]) === "") continue;
    if (field.officialId) {
      const leaf = insertField(formRoot, field, { attrs: { ID: field.officialId } });
      if (field.commonType === "kubun") insertComponent(leaf, "kubun_CD", clean(values[field.id]));
      else leaf.text = clean(values[field.id]);
      continue;
    }
    if (field.component) {
      const leaf = insertField(formRoot, field, {});
      insertComponent(leaf, field.component, clean(values[field.id]));
      continue;
    }
    if (["kubun", "kubun2"].includes(field.commonType)) {
      insertComponent(insertField(formRoot, field, {}), "kubun_CD", clean(values[field.id]));
    } else if (field.commonType === "bango") {
      const leaf = insertField(formRoot, field, {});
      const digits = clean(values[field.id]).replace(/\D/g, "");
      leaf.children.push(node(`gen:${digits.length === 13 ? "hojinbango" : "kojinbango"}`, { text: digits }));
    } else {
      insertField(formRoot, field, { text: clean(values[field.id]) });
    }
  }

  const created = isoDate(values.creationDate) || new Date().toISOString().slice(0, 10);
  const creator = clean(values.creatorName) || "本人";
  const software = clean(values.softwareName) || "e-Tax Filing Designer";
  const formChildren = formRoot.children.map((child) => renderNode(child, 4)).join("\n");
  const filingKind = clean(values[official.find((field) => field.tag === "ABA00020")?.id]);
  const tez310 = ["3", "4"].includes(filingKind) ? renderTez310(values, { created, creator, software }, 3) : "";
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<DATA xmlns="${PROCEDURE_NAMESPACE}" xmlns:gen="${GENERAL_NAMESPACE}" xmlns:kyo="${COMMON_NAMESPACE}" xmlns:rdf="${RDF_NAMESPACE}" id="DATA1">`,
    '  <RKO0010 id="RKO0010-1" VR="25.0.0">',
    '    <CATALOG id="CATALOG1">',
    '      <rdf:RDF/>',
    '    </CATALOG>',
    '    <CONTENTS id="CONTENTS1">',
    '      <IT id="IT1" VR="1.5">',
    ...itEntries.map((entry) => renderItEntry(entry, 4)),
    '      </IT>',
    `      <KOA020 VR="23.0" softNM="${escapeXml(software)}" sakuseiNM="${escapeXml(creator)}" sakuseiDay="${created}" id="KOA020-1">`,
    formChildren,
    '      </KOA020>',
    tez310,
    '    </CONTENTS>',
    '  </RKO0010>',
    '</DATA>'
  ].filter(Boolean).join("\n");
}

function renderTez310(values, meta, depth) {
  const indent = "  ".repeat(depth);
  const childIndent = "  ".repeat(depth + 1);
  const innerIndent = "  ".repeat(depth + 2);
  const deepIndent = "  ".repeat(depth + 3);
  const year = clean(values.r07_2_1) || "7";
  const death = parseDate(values.deathDate);
  const deathXml = death ? `\n${deepIndent}<kyo:CDB00050>\n${deepIndent}  <gen:era>${death.era}</gen:era>\n${deepIndent}  <gen:yy>${death.yy}</gen:yy>\n${deepIndent}  <gen:mm>${death.mm}</gen:mm>\n${deepIndent}  <gen:dd>${death.dd}</gen:dd>\n${deepIndent}</kyo:CDB00050>` : "";
  const heirDigits = clean(values.heirNumber).replace(/\D/g, "");
  return [
    `${indent}<kyo:TEZ310 VR="9.0" softNM="${escapeXml(meta.software)}" sakuseiNM="${escapeXml(meta.creator)}" sakuseiDay="${meta.created}" id="TEZ310-1">`,
    `${childIndent}<kyo:CDA00000><kyo:CDA00010><gen:era>5</gen:era><gen:yy>${escapeXml(year)}</gen:yy></kyo:CDA00010></kyo:CDA00000>`,
    `${childIndent}<kyo:CDB00000>`,
    `${innerIndent}<kyo:CDB00010>${escapeXml(values.deceasedAddress)}</kyo:CDB00010>`,
    `${innerIndent}<kyo:CDB00020><kyo:CDB00040>${escapeXml(values.deceasedName)}</kyo:CDB00040></kyo:CDB00020>${deathXml}`,
    `${childIndent}</kyo:CDB00000>`,
    `${childIndent}<kyo:CDD00000><kyo:CDD00010>${escapeXml(values.heirName)}</kyo:CDD00010></kyo:CDD00000>`,
    `${childIndent}<kyo:CDF00000><kyo:CDF00010>`,
    `${innerIndent}<kyo:CDF00020>${escapeXml(values.heirAddress)}</kyo:CDF00020>`,
    `${innerIndent}<kyo:CDF00030><kyo:CDF00040>${escapeXml(values.heirKana)}</kyo:CDF00040><kyo:CDF00050>${escapeXml(values.heirName)}</kyo:CDF00050></kyo:CDF00030>`,
    `${innerIndent}<kyo:CDF00055><gen:kojinbango>${escapeXml(heirDigits)}</gen:kojinbango></kyo:CDF00055>`,
    `${childIndent}</kyo:CDF00010></kyo:CDF00000>`,
    `${indent}</kyo:TEZ310>`
  ].join("\n");
}

function parseDate(value) {
  const text = clean(value);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!iso) return null;
  const year = Number(iso[1]);
  if (year >= 2019) return { era: 5, yy: year - 2018, mm: Number(iso[2]), dd: Number(iso[3]) };
  if (year >= 1989) return { era: 4, yy: year - 1988, mm: Number(iso[2]), dd: Number(iso[3]) };
  if (year >= 1926) return { era: 3, yy: year - 1925, mm: Number(iso[2]), dd: Number(iso[3]) };
  return { era: 2, yy: Math.max(1, year - 1911), mm: Number(iso[2]), dd: Number(iso[3]) };
}

function buildRequiredItEntries(values) {
  const taxOfficeCode = clean(values.taxOfficeCode);
  const taxOfficeName = clean(values.taxOffice);
  return [
    compound("ZEIMUSHO", [gen("zeimusho_CD", taxOfficeCode), taxOfficeName && gen("zeimusho_NM", taxOfficeName)].filter(Boolean)),
    simple("NOZEISHA_ID", clean(values.taxpayerId)),
    simple("NOZEISHA_NM", clean(values.taxpayerName)),
    simple("NOZEISHA_ADR", clean(values.address)),
    compound("TETSUZUKI", [plain("procedure_CD", "RKO0010"), plain("procedure_NM", "所得税及び復興特別所得税申告")])
  ];
}

function buildItEntries(fields, values) {
  const result = [];
  for (const [idref, refFields] of Map.groupBy(fields.filter((field) => field.idref && field.idref !== "ABA00070"), (field) => field.idref)) {
    const first = refFields[0];
    const value = (component) => clean(values[refFields.find((field) => field.component === component)?.id]);
    if (idref === "ZEIMUSHO") {
      result.push(compound(idref, [gen("zeimusho_CD", clean(values.taxOfficeCode)), gen("zeimusho_NM", clean(values[first.id]))]));
    } else if (first.commonType === "bango") {
      result.push(compound(idref, [gen("kojinbango", clean(values[first.id]))]));
    } else if (first.commonType === "kubun2") {
      result.push(compound(idref, [plain("kubun_CD", clean(values[first.id]))]));
    } else if (first.commonType === "account") {
      const bankName = value("kinyukikan_NM");
      const branchName = value("shiten_NM");
      const children = [];
      if (value("yubinkyoku_NM")) {
        const digits = value("koza").replace(/\D/g, "");
        children.push(gen("yubinkyoku_NM", value("yubinkyoku_NM")));
        if (digits) children.push(gen("kigobango1", digits.slice(0, 5)));
        if (digits.length > 5) children.push(gen("kigobango2", digits.slice(5, 13)));
      } else {
        if (bankName) children.push({ name: "gen:kinyukikan_NM", text: bankName, attrs: value("@kinyukikan_KB") ? { kinyukikan_KB: value("@kinyukikan_KB") } : {}, children: [] });
        if (branchName) children.push({ name: "gen:shiten_NM", text: branchName, attrs: value("@shiten_KB") ? { shiten_KB: value("@shiten_KB") } : {}, children: [] });
        if (value("yokin")) children.push(gen("yokin", value("yokin")));
        if (value("koza")) children.push(gen("koza", value("koza").replace(/\D/g, "")));
      }
      result.push(compound(idref, children));
    } else if (refFields.some((field) => field.component)) {
      result.push(compound(idref, refFields.filter((field) => field.component && clean(values[field.id])).map((field) => gen(field.component, clean(values[field.id])))));
    } else {
      result.push(simple(idref, clean(values[first.id])));
    }
  }
  return result.filter((entry) => entry.text || entry.children.length);
}

function insertField(root, field, data) {
  let cursor = root;
  const segments = field.pathMeta || field.xmlPath.split("/").map((tag) => ({ tag }));
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

function insertComponent(leaf, component, value) {
  const name = ["era", "yy", "mm", "dd"].includes(component) ? `gen:${component}` : component;
  let child = leaf.children.find((entry) => entry.name === name);
  if (!child) { child = node(name); leaf.children.push(child); }
  child.text = value;
}

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
  const attrs = ` ID="${entry.id}"`;
  if (!entry.children.length) return `${indent}<${entry.name}${attrs}>${escapeXml(entry.text)}</${entry.name}>`;
  return `${indent}<${entry.name}${attrs}>\n${entry.children.map((child) => renderNode(child, depth + 1)).join("\n")}\n${indent}</${entry.name}>`;
}

function renderNode(entry, depth) {
  const indent = "  ".repeat(depth);
  const attrs = Object.entries(entry.attrs || {}).map(([key, value]) => ` ${key}="${escapeXml(value)}"`).join("");
  if (!entry.children.length && entry.text === "") return `${indent}<${entry.name}${attrs}/>`;
  if (!entry.children.length) return `${indent}<${entry.name}${attrs}>${escapeXml(entry.text)}</${entry.name}>`;
  return `${indent}<${entry.name}${attrs}>\n${entry.children.map((child) => renderNode(child, depth + 1)).join("\n")}\n${indent}</${entry.name}>`;
}
