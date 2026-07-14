const PARSER_ERROR = "正式e-Tax XMLを解析できませんでした。";

export function isOfficialR07Instance(xmlText) {
  try {
    const document = parse(xmlText);
    return Boolean(findElement(document, "KOA020"));
  } catch {
    return false;
  }
}

export function extractOfficialR07Values(definition, xmlText) {
  const document = parse(xmlText);
  const form = findElement(document, "KOA020");
  if (!form) throw new Error("XML内にKOA020帳票がありません。");
  const values = {};
  for (const field of definition.sections.flatMap((section) => section.fields)) {
    values[field.id] = readField(document, form, field);
  }
  return values;
}

export function officialR07FieldValue(definition, xmlText, fieldId) {
  const field = definition.sections.flatMap((section) => section.fields).find((entry) => entry.id === fieldId);
  if (!field) return "";
  const document = parse(xmlText);
  const form = findElement(document, "KOA020");
  return form ? readField(document, form, field) : "";
}

function parse(xmlText) {
  const document = new DOMParser().parseFromString(String(xmlText || ""), "application/xml");
  if (document.querySelector("parsererror")) throw new Error(PARSER_ERROR);
  return document;
}

function readField(document, form, field) {
  if (field.xmlPath?.startsWith("$control/TEZ310/")) return readTez310(document, field.id);
  if (field.xmlPath?.startsWith("KOA020/@")) return form.getAttribute(field.xmlPath.slice("KOA020/@".length)) || "";
  if (field.xmlPath?.startsWith("IT/")) {
    const it = findElement(document, "IT");
    return it ? readElement(document, resolveDirectPath(it, field.xmlPath.split("/").slice(1), field), field) : "";
  }
  const element = resolveDirectPath(form, pathSegments(field), field);
  return readElement(document, element, field);
}

function readElement(document, element, field) {
  if (!element) return "";
  const idref = element.getAttribute("IDREF");
  if (idref) element = Array.from(document.getElementsByTagName("*")).find((candidate) => candidate.getAttribute("ID") === idref) || element;
  if (field.component) return directChild(element, field.component)?.textContent.trim() || "";
  if (field.commonType === "zeimusho") return directChild(element, "zeimusho_NM")?.textContent.trim() || "";
  if (["kubun", "kubun2"].includes(field.commonType)) return directChild(element, "kubun_CD")?.textContent.trim() || "";
  if (field.commonType === "bango") {
    return directChild(element, "kojinbango")?.textContent.trim()
      || directChild(element, "hojinbango")?.textContent.trim()
      || "";
  }
  return element.textContent.trim();
}

function pathSegments(field) {
  if (field.pathMeta?.length) return field.pathMeta.map((segment) => segment.tag);
  return String(field.xmlPath || "").split("/").filter(Boolean);
}

function resolveDirectPath(root, segments, field) {
  let cursor = root;
  for (const segment of segments) {
    if (cursor.localName === segment) continue;
    const matches = Array.from(cursor.children).filter((child) => child.localName === segment);
    const index = segment === field.repeatTag ? Math.max(0, Number(field.occurrence || 1) - 1) : 0;
    cursor = matches[index];
    if (!cursor) return null;
  }
  return cursor;
}

function readTez310(document, fieldId) {
  const tagByField = {
    deceasedName: "CDB00040",
    deceasedAddress: "CDB00010",
    heirName: "CDD00010",
    heirKana: "CDF00040",
    heirAddress: "CDF00020",
    heirNumber: "CDF00055"
  };
  if (fieldId === "deathDate") {
    const date = findElement(document, "CDB00050");
    if (!date) return "";
    const era = Number(directChild(date, "era")?.textContent || 0);
    const yy = Number(directChild(date, "yy")?.textContent || 0);
    const mm = Number(directChild(date, "mm")?.textContent || 0);
    const dd = Number(directChild(date, "dd")?.textContent || 0);
    const year = era === 5 ? yy + 2018 : era === 4 ? yy + 1988 : era === 3 ? yy + 1925 : era === 2 ? yy + 1911 : 0;
    return year && mm && dd ? `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}` : "";
  }
  const element = findElement(document, tagByField[fieldId]);
  if (!element) return "";
  if (fieldId === "heirNumber") {
    return directChild(element, "kojinbango")?.textContent.trim()
      || directChild(element, "hojinbango")?.textContent.trim()
      || "";
  }
  return element.textContent.trim();
}

function findElement(root, localName) {
  if (!localName) return null;
  return Array.from(root.getElementsByTagName("*")).find((element) => element.localName === localName) || null;
}

function directChild(element, localName) {
  return Array.from(element?.children || []).find((child) => child.localName === localName) || null;
}
