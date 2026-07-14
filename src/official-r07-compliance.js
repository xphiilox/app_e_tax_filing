import { R07_CROSS_CHECKS, R07_FIELD_SPEC, R07_PAGES, R07_SPEC_COUNTS } from "./official-r07-field-spec.js";

const LEGACY_TAG_ALIASES = {
  ABA00010: "filingYear", ABA00030: "taxOffice", ABA00040: "filingDate", ABA00080: "postalCode",
  ABA00090: "address", ABA00120: "januaryAddress", ABA00125: "individualNumber", ABA00130: "taxpayerKana",
  ABA00140: "taxpayerName", ABA00160: "occupation", ABA00170: "tradeName", ABA00180: "householder",
  ABA00190: "relationship", ABA00200: "birthDate", ABA00220: "phone", ABC00040: "addressSecond",
  ABC00050: "tradeNameSecond", ABC00060: "kanaSecond", ABC00070: "nameSecond", ABD00050: "withholdingBreakdownIncome",
  ABD00060: "withholdingBreakdownTax", ABD00070: "withholdingTotalSecond", ABH00300: "donationAmountSecond"
};

export function enhanceOfficialR07Definition(definition) {
  if (definition?.rootElement !== "KOA020" || definition?.version !== "23.0") return definition;
  if (definition.officialFieldSpec) return definition;
  const original = definition.sections.flatMap((section) => section.fields);
  const technical = original.filter((field) => field.xmlPath.startsWith("IT/") || field.xmlPath.startsWith("KOA020/@"));
  technical.push(
    { id: "deceasedName", label: "被相続人の氏名（準確定）", xmlPath: "$control/TEZ310/deceasedName", type: "text" },
    { id: "deceasedAddress", label: "被相続人の死亡時住所（準確定）", xmlPath: "$control/TEZ310/deceasedAddress", type: "text" },
    { id: "deathDate", label: "死亡年月日（準確定）", xmlPath: "$control/TEZ310/deathDate", type: "date" },
    { id: "heirName", label: "相続人代表の氏名（準確定）", xmlPath: "$control/TEZ310/heirName", type: "text" },
    { id: "heirKana", label: "相続人代表のフリガナ（準確定）", xmlPath: "$control/TEZ310/heirKana", type: "text" },
    { id: "heirAddress", label: "相続人代表の住所（準確定）", xmlPath: "$control/TEZ310/heirAddress", type: "text" },
    { id: "heirNumber", label: "相続人代表の個人番号（準確定）", xmlPath: "$control/TEZ310/heirNumber", type: "text", pattern: "^\\d{12}$", hint: "12桁の数字" }
  );
  const legacyByTag = new Map(original.map((field) => [field.xmlPath.split("/").at(-1), field]));
  const grouped = new Map();
  for (const source of R07_FIELD_SPEC) {
    const field = { ...source };
    const legacy = legacyByTag.get(field.tag);
    if (legacy && !field.component) field.legacyId = legacy.id;
    if (field.tag === "ABA00010" && field.component === "era") field.value = "5";
    if (field.tag === "ABA00010" && field.component === "yy") field.value = String(legacy?.value || "7");
    const key = `${field.page}:${field.group}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(field);
  }
  const sections = [
    { id: "identity", label: "送信・作成情報", fields: technical.map((field) => ({ ...field, page: 1 })) },
    ...[...grouped.entries()].map(([key, fields], index) => ({
      id: `official-${index + 1}`,
      label: fields[0].group,
      page: fields[0].page,
      fields
    }))
  ];
  return {
    ...definition,
    sections,
    layout: { pages: R07_PAGES },
    officialFieldSpec: true,
    specCounts: R07_SPEC_COUNTS,
    crossChecks: R07_CROSS_CHECKS
  };
}

export function synchronizeOfficialValues(definition, values, includeLegacyValues = false) {
  if (!definition?.officialFieldSpec) return;
  const fields = definition.sections.flatMap((section) => section.fields).filter((field) => field.item);
  const byTag = Map.groupBy(fields, (field) => field.tag);
  if (includeLegacyValues) {
    for (const [tag, legacyId] of Object.entries(LEGACY_TAG_ALIASES)) {
      const source = clean(values[legacyId]);
      if (!source || !byTag.has(tag)) continue;
      const target = byTag.get(tag).filter((field) => field.occurrence === 1);
      if (target.length === 1) values[target[0].id] = source;
      else assignCompound(target, source, tag, values);
    }
    const assignFirst = (tag, ...legacyIds) => {
      const field = (byTag.get(tag) || []).find((entry) => entry.occurrence === 1 && !entry.component);
      const value = legacyIds.map((id) => clean(values[id])).find(Boolean);
      if (field && value) values[field.id] = value;
    };
    assignFirst("ABD00030", "payerId", "payerAddress");
    assignFirst("ABD00040", "payerName");
    assignFirst("ABD00050", "withholdingBreakdownIncome", "salaryPayment");
    assignFirst("ABD00060", "withholdingBreakdownTax", "withheldTax");
  }
  const filingKind = (byTag.get("ABA00020") || [])[0];
  if (filingKind && !clean(values[filingKind.id])) values[filingKind.id] = "1";
  calculateOfficialFields(definition, values);
}

function assignCompound(fields, source, tag, values) {
  let parts = [];
  if (["ABA00010", "ABC00010", "ABK00010", "ABM00010", "ABO00010", "ABT10010", "ABV10010", "ABV20010"].includes(tag)) {
    parts = ["5", source.replace(/\D/g, "")];
  } else if (tag === "ABA00080") {
    const digits = source.replace(/\D/g, ""); parts = [digits.slice(0, 3), digits.slice(3, 7)];
  } else if (["ABA00040", "ABA00200"].includes(tag)) {
    const date = japaneseDate(source); parts = date ? [date.era, date.yy, date.mm, date.dd] : [];
  } else if (["ABA00220", "ABS10060"].includes(tag)) {
    const digits = source.replace(/\D/g, "");
    parts = digits.length === 11 ? [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)] : [digits.slice(0, 2), digits.slice(2, 6), digits.slice(6)];
  }
  fields.forEach((field, index) => { if (parts[index] != null) values[field.id] = String(parts[index]); });
}

export function calculateOfficialFields(definition, values) {
  if (!definition?.officialFieldSpec) return {};
  const fields = definition.sections.flatMap((section) => section.fields).filter((field) => field.item);
  const byTag = Map.groupBy(fields, (field) => field.tag);
  const changed = {};
  const tagValues = (tag) => (byTag.get(tag) || []).filter((field) => !field.component).map((field) => numeric(values[field.id]));
  const first = (tag) => tagValues(tag)[0] || 0;
  const sum = (tag) => tagValues(tag).reduce((total, value) => total + value, 0);
  const computed = fields.filter((field) => field.calculation && field.occurrence === 1);
  for (const field of computed) {
    const line = normalize(field.note).match(/【計算】([^\n/]+)/)?.[1];
    if (!line) continue;
    const operandTags = [...line.matchAll(/[A-Z]{3}\d{5}/g)].map((match) => match[0]);
    const hasOperand = operandTags.some((tag) => (byTag.get(tag) || []).some((entry) => clean(values[entry.id])));
    if (!hasOperand) continue;
    const tokens = [...line.matchAll(/([A-Z]{3}\d{5})(の計)?|([＋－×])|(\d+(?:\.\d+)?)％/g)].map((match) => match[0]);
    let result = 0;
    let operator = "+";
    for (const token of tokens) {
      if (["＋", "－", "×"].includes(token)) { operator = { "＋": "+", "－": "-", "×": "*" }[token]; continue; }
      let value;
      if (token.endsWith("％")) value = Number.parseFloat(token) / 100;
      else {
        const tag = token.slice(0, 8);
        value = token.includes("の計") ? sum(tag) : first(tag);
      }
      if (operator === "+") result += value;
      else if (operator === "-") result -= value;
      else if (operator === "*") result *= value;
    }
    if (field.note.includes("赤字の場合は0")) result = Math.max(0, result);
    if (field.tag === "ABB00720" && result > 0) result = Math.floor(result / 100) * 100;
    if (field.tag === "ABB00750") result = result > 0 ? Math.floor(result / 100) * 100 : 0;
    if (field.tag === "ABB00760") result = result < 0 ? Math.abs(result) : 0;
    result = Math.trunc(result);
    if (values[field.id] !== String(result)) {
      values[field.id] = String(result);
      changed[field.id] = String(result);
    }
  }
  return changed;
}

export function validateOfficialFields(definition, values) {
  if (!definition?.officialFieldSpec) return [];
  const fields = definition.sections.flatMap((section) => section.fields).filter((field) => field.item);
  const errors = [];
  const byTag = Map.groupBy(fields, (field) => field.tag);
  const firstText = (tag) => clean(values[(byTag.get(tag) || [])[0]?.id]);
  const firstNumber = (tag) => numeric(firstText(tag));
  for (const field of fields) {
    const value = clean(values[field.id]);
    if (!value) continue;
    if (field.inputType === "数値" && !/^-?\d+$/.test(value)) errors.push(`${field.label}${occurrence(field)} は半角整数で入力してください。`);
    const rangeError = checkRange(field.range, value);
    if (rangeError) errors.push(`${field.label}${occurrence(field)}: ${rangeError}`);
    const formatError = checkFormat(field.format, value);
    if (formatError) errors.push(`${field.label}${occurrence(field)}: ${formatError}`);
    const typeLength = field.commonType.match(/(?:string|char)\((\d+)\)/)?.[1];
    if (typeLength && [...value].length > Number(typeLength)) errors.push(`${field.label}${occurrence(field)} は${typeLength}文字以内で入力してください。`);
    if (field.note.includes("カタカナ") && !/^[ァ-ヶー・ 　]*$/.test(value)) errors.push(`${field.label}${occurrence(field)} は全角カタカナで入力してください。`);
    if (field.note.includes("万円未満") && numeric(value) % 10000 !== 0) errors.push(`${field.label}${occurrence(field)} は万円未満を切り捨てた金額で入力してください。`);
    if (field.note.includes("千円未満") && numeric(value) % 1000 !== 0) errors.push(`${field.label}${occurrence(field)} は千円未満を切り捨てた金額で入力してください。`);
    if (field.note.includes("百円未満") && numeric(value) % 100 !== 0) errors.push(`${field.label}${occurrence(field)} は百円未満を切り捨てた金額で入力してください。`);
  }
  const filingKind = firstText("ABA00020");
  if (firstText("ABA00030") && !/^\d{5}$/.test(clean(values.taxOfficeCode))) errors.push("税務署名を入力した場合、5桁の税務署番号が必要です。");
  if (!["2", "4"].includes(filingKind) && firstNumber("ABB00710") >= 1 && firstNumber("ABB00710") !== firstNumber("ABD00070")) {
    errors.push("源泉徴収税額（第一表 ABB00710）と所得内訳の合計（第二表 ABD00070）が一致していません。");
  }
  for (const field of byTag.get("ABD00060") || []) {
    if (!clean(values[field.id])) continue;
    const same = (tag) => (byTag.get(tag) || []).find((entry) => entry.occurrence === field.occurrence);
    if (!clean(values[same("ABD00030")?.id])) errors.push(`所得内訳 ${field.occurrence}件目: 支払者の法人番号又は所在地が必要です。`);
    if (!clean(values[same("ABD00040")?.id])) errors.push(`所得内訳 ${field.occurrence}件目: 支払者の名称が必要です。`);
  }
  validateHousingCrossChecks(byTag, values, errors, "ABB00650", false);
  validateHousingCrossChecks(byTag, values, errors, "ABB00663", firstText("ABB01000") !== "3");
  const account = byTag.get("ABB00950") || [];
  const accountValue = (component) => clean(values[account.find((field) => field.component === component)?.id]);
  if (accountValue("yubinkyoku_NM") && ["kinyukikan_NM", "@kinyukikan_KB", "shiten_NM", "@shiten_KB", "yokin"].some(accountValue)) {
    errors.push("還付口座は、金融機関口座とゆうちょ銀行の記号番号を同時に入力できません。");
  }
  const provideConsent = firstText("ABZ00000") === "1";
  const useConsent = firstText("ABZ40000") === "1";
  const individualNumber = firstText("ABA00125");
  const kana = firstText("ABA00130");
  const accountFields = account.map((field) => clean(values[field.id]));
  const bankComplete = ["kinyukikan_NM", "@kinyukikan_KB", "shiten_NM", "@shiten_KB", "yokin", "koza"].every((component) => accountValue(component));
  const postComplete = accountValue("yubinkyoku_NM") && accountValue("koza").replace(/\D/g, "").length === 13;
  if ((provideConsent || useConsent) && !individualNumber) errors.push("口座情報の同意を選択した場合、個人番号（マイナンバー）は必須です。");
  if (provideConsent && !kana) errors.push("口座情報提供に同意した場合、フリガナ（第一表）は必須です。");
  if (provideConsent && !bankComplete && !postComplete) errors.push("口座情報提供に同意した場合、還付口座を金融機関口座またはゆうちょ記号番号のいずれかで完全に入力してください。");
  if (useConsent && accountFields.some(Boolean)) errors.push("公金受取口座の利用に同意した場合、還付口座欄は入力できません。");
  const eraFields = byTag.get("ABA00010") || [];
  const era = clean(values[eraFields.find((field) => field.component === "era")?.id]);
  const year = numeric(values[eraFields.find((field) => field.component === "yy")?.id]);
  const basic = firstNumber("ABB00550");
  if (firstText("ABB00550")) {
    if ((era === "4" || (era === "5" && year === 1)) && basic !== 380000) errors.push("基礎控除は、平成分または令和元年分では380,000円です。");
    if (era === "5" && year >= 2 && year <= 6 && (basic < 0 || basic > 480000)) errors.push("基礎控除は0円以上480,000円以下です。");
    if (era === "5" && year >= 7 && (basic < 0 || basic > 950000)) errors.push("令和7年分以後の基礎控除は0円以上950,000円以下です。");
  }
  for (const tag of ["ABB00555", "ABB00560"]) {
    const amount = firstNumber(tag);
    if (!firstText(tag)) continue;
    if ((era === "4" || (era === "5" && year === 1)) && amount < 380000) errors.push(`${tag}は、平成分または令和元年分では380,000円以上です。`);
    if (era === "5" && year >= 2 && amount < 0) errors.push(`${tag}は0円以上です。`);
  }
  if (firstText("ABB00900") && firstNumber("ABB00900") > firstNumber("ABB00750") / 2) errors.push("延納届出額（ABB00900）は納める税金（ABB00750）の2分の1以下で入力してください。");
  if (["3", "4"].includes(filingKind)) {
    const requiredSupplement = [
      ["deceasedName", "被相続人の氏名"], ["deceasedAddress", "被相続人の死亡時住所"], ["deathDate", "死亡年月日"],
      ["heirName", "相続人代表の氏名"], ["heirKana", "相続人代表のフリガナ"], ["heirAddress", "相続人代表の住所"], ["heirNumber", "相続人代表の個人番号"]
    ];
    for (const [id, label] of requiredSupplement) if (!clean(values[id])) errors.push(`準確定申告では、TEZ310の${label}が必須です。`);
    if (clean(values.heirKana) && !/^[ァ-ヶー・ 　]+$/.test(clean(values.heirKana))) errors.push("相続人代表のフリガナは全角カタカナで入力してください。");
  }
  return [...new Set(errors)];
}

function validateHousingCrossChecks(byTag, values, errors, amountTag, skip) {
  if (skip || numeric(values[(byTag.get(amountTag) || [])[0]?.id]) < 1) return;
  const forbidden = new Set(amountTag === "ABB00650" ? ["31|3||", "35|||", "35|||1", "36|2||", "36|5||", "37|5||"] : ["31|3||", "35|||", "35|||1"]);
  for (let occurrence = 1; occurrence <= 3; occurrence += 1) {
    const get = (tag) => clean(values[(byTag.get(tag) || []).find((field) => field.occurrence === occurrence)?.id]);
    const key = ["ABL00670", "ABL00680", "ABL00690", "ABL00700"].map(get).join("|");
    if (forbidden.has(key)) errors.push(`${amountTag}を適用する場合、特例適用条文 ${occurrence}件目（${key.replaceAll("|", "-")}）は使用できません。`);
  }
}

function checkRange(rule, value) {
  if (!rule) return "";
  const x = Number(value);
  const normalized = rule.replaceAll(",", "").replaceAll("１", "1").replaceAll("＝", "=");
  let match = normalized.match(/^(-?\d+)≦x≦(-?\d+)$/);
  if (match && (x < Number(match[1]) || x > Number(match[2]))) return `${rule} の範囲で入力してください。`;
  match = normalized.match(/^(-?\d+)≦x$/);
  if (match && x < Number(match[1])) return `${rule} の範囲で入力してください。`;
  match = normalized.match(/^x=(-?\d+)$/);
  if (match && x !== Number(match[1])) return `${normalized} となる値を入力してください。`;
  const codes = [...normalized.matchAll(/(?:^|\n)(-?\d+)[:.]/g)].map((entry) => entry[1]);
  if (codes.length && !codes.includes(value)) return `指定値（${codes.join("、")}）のいずれかを入力してください。`;
  return "";
}

function checkFormat(format, value) {
  if (!format) return "";
  const compact = String(format).replaceAll(",", "");
  if (/^9+$/.test(compact) && !/^\d+$/.test(value)) return "数字で入力してください。";
  if (/^9+$/.test(compact) && value.length > compact.length) return `${compact.length}桁以内で入力してください。`;
  if (/^[Z0]+$/.test(compact) && !/^-?\d+$/.test(value)) return "数字で入力してください。";
  if (/^[Z0]+$/.test(compact) && value.replace("-", "").length > compact.length) return `${compact.length}桁以内で入力してください。`;
  const fixedZeros = compact.match(/0+$/)?.[0].length || 0;
  if (fixedZeros && numeric(value) % (10 ** fixedZeros) !== 0) return `${10 ** fixedZeros}円未満を切り捨てた金額で入力してください。`;
  return "";
}

function occurrence(field) { return field.repeats > 1 ? `（${field.occurrence}件目）` : ""; }
function clean(value) { return String(value ?? "").trim(); }
function numeric(value) { const parsed = Number(String(value ?? "").replaceAll(",", "")); return Number.isFinite(parsed) ? parsed : 0; }
function normalize(value) { return String(value || "").replaceAll("Ａ", "A").replaceAll("Ｂ", "B").replaceAll("Ｐ", "P").replaceAll("−", "－").replaceAll("-", "－"); }

function japaneseDate(value) {
  const text = clean(value);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    if (year >= 2019) return { era: 5, yy: year - 2018, mm: Number(iso[2]), dd: Number(iso[3]) };
    if (year >= 1989) return { era: 4, yy: year - 1988, mm: Number(iso[2]), dd: Number(iso[3]) };
    if (year >= 1926) return { era: 3, yy: year - 1925, mm: Number(iso[2]), dd: Number(iso[3]) };
  }
  const match = text.match(/(令和|平成|昭和|大正|明治)\s*(\d{1,2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  return match ? { era: { 明治: 1, 大正: 2, 昭和: 3, 平成: 4, 令和: 5 }[match[1]], yy: Number(match[2]), mm: Number(match[3]), dd: Number(match[4]) } : null;
}
