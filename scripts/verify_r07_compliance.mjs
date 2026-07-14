import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildOfficialR07Xml } from "../src/official-r07.js";
import { calculateOfficialFields, validateOfficialFields } from "../src/official-r07-compliance.js";
import { R07_CROSS_CHECKS, R07_FIELD_SPEC, R07_PAGES, R07_SPEC_COUNTS } from "../src/official-r07-field-spec.js";

const schema = path.resolve("schemas/r07/shotoku/RKO0010-250.xsd");
const definition = { rootElement: "KOA020", version: "23.0", officialFieldSpec: true, sections: [{ fields: R07_FIELD_SPEC }] };
const byTag = Map.groupBy(R07_FIELD_SPEC, (field) => field.tag);
const sourceFields = R07_FIELD_SPEC.filter((field) => field.occurrence === 1);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "r07-compliance-"));
const results = { metadata: {}, xsd: {}, validation: {}, calculation: {}, correlation: {}, supplement: {} };

try {
  assert.deepEqual(R07_SPEC_COUNTS, { sourceRows: 788, expandedFields: 894, uniqueTags: 719, inputChecks: 278, calculations: 70, ranges: 277, crossChecks: 12 });
  assert.equal(R07_PAGES.length, 8);
  assert.equal(R07_CROSS_CHECKS.length, 12);
  assert.equal(new Set(R07_FIELD_SPEC.map((field) => field.tag)).size, 719);
  assert.equal(sourceFields.length, 788);
  results.metadata = { ...R07_SPEC_COUNTS, pages: R07_PAGES.length, status: "pass" };

  let xsdCases = 0;
  for (const [tag, entries] of byTag) {
    const values = baseValues();
    const fields = entries.filter((field) => field.occurrence === 1);
    if (fields.some((field) => field.idref === "ABA00070")) setTag(values, "ABA00070", "5");
    fields.forEach((field) => { values[field.id] = validValue(field); });
    assertXsd(buildOfficialR07Xml(definition, values), `tag-${tag}`);
    xsdCases += 1;
  }

  const repeatedTags = [...new Set(R07_FIELD_SPEC.filter((field) => field.repeats > 1).map((field) => field.tag))];
  for (const tag of repeatedTags) {
    const values = baseValues();
    for (const field of byTag.get(tag)) values[field.id] = validValue(field);
    assertXsd(buildOfficialR07Xml(definition, values), `repeat-${tag}`);
    xsdCases += 1;
  }
  const compoundTags = [...new Set(R07_FIELD_SPEC.filter((field) => field.component).map((field) => field.tag))];
  assert.equal(compoundTags.length, 36);
  results.xsd = { uniqueTagCases: 719, repeatedTagCases: repeatedTags.length, compoundCases: compoundTags.length, totalCases: xsdCases, status: "pass" };

  const ranged = sourceFields.filter((field) => field.range);
  assert.equal(ranged.length, 277);
  let boundaryCases = 0;
  for (const field of ranged) {
    const valid = contextFor(field);
    valid[field.id] = validValue(field);
    const validErrors = validateOfficialFields(definition, valid);
    assert.equal(relevantErrors(validErrors, field).length, 0, `${field.tag} valid: ${validErrors.join(" / ")}`);
    for (const invalid of invalidRangeCases(field)) {
      const values = contextFor(field);
      values[field.id] = invalid;
      const errors = validateOfficialFields(definition, values);
      assert(errors.length > 0, `${field.tag} did not reject ${invalid} for ${field.range}`);
      boundaryCases += 1;
    }
  }
  const formatted = sourceFields.filter((field) => field.format);
  let formatCases = 0;
  for (const field of formatted) {
    const values = contextFor(field);
    values[field.id] = "X";
    assert(validateOfficialFields(definition, values).length > 0, `${field.tag} format did not reject X (${field.format})`);
    formatCases += 1;
  }
  const taxOfficeInvalid = baseValues();
  setTag(taxOfficeInvalid, "ABA00030", "麹町");
  taxOfficeInvalid.taxOfficeCode = "1";
  assert(validateOfficialFields(definition, taxOfficeInvalid).some((error) => error.includes("税務署番号")));
  results.validation = { inputCheckRows: 278, rangeRows: ranged.length, boundaryCases, formatRows: formatted.length, formatCases, taxOfficeLookupCase: 1, status: "pass" };

  const calculated = sourceFields.filter((field) => field.calculation);
  assert.equal(calculated.length, 70);
  let calculationCases = 0;
  for (const field of calculated) {
    const values = baseValues();
    const expected = prepareFormulaCase(field, values);
    const isolated = { ...definition, sections: [{ fields: R07_FIELD_SPEC.map((entry) => entry.id === field.id ? entry : { ...entry, calculation: "" }) }] };
    calculateOfficialFields(isolated, values);
    assert.equal(Number(values[field.id]), expected, `${field.tag}: expected ${expected}, got ${values[field.id]}`);
    calculationCases += 1;
  }
  results.calculation = { formulas: calculated.length, cases: calculationCases, status: "pass" };

  let correlationCases = 0;
  {
    const values = baseValues(); setTag(values, "ABA00020", "1"); setTag(values, "ABB00710", "100"); setTag(values, "ABD00070", "99");
    assert(validateOfficialFields(definition, values).some((error) => error.includes("一致していません"))); correlationCases += 1;
  }
  {
    const values = baseValues(); setTag(values, "ABD00060", "100");
    const errors = validateOfficialFields(definition, values);
    assert(errors.some((error) => error.includes("法人番号又は所在地"))); assert(errors.some((error) => error.includes("支払者の名称"))); correlationCases += 2;
  }
  const housing = [
    ["ABB00650", false, ["31", "3", "", ""]], ["ABB00650", false, ["35", "", "", ""]], ["ABB00650", false, ["35", "", "", "1"]],
    ["ABB00650", false, ["36", "2", "", ""]], ["ABB00650", false, ["36", "5", "", ""]], ["ABB00650", false, ["37", "5", "", ""]],
    ["ABB00663", true, ["31", "3", "", ""]], ["ABB00663", true, ["35", "", "", ""]], ["ABB00663", true, ["35", "", "", "1"]]
  ];
  for (const [amountTag, needsType, parts] of housing) {
    const values = baseValues(); setTag(values, amountTag, "100"); if (needsType) setTag(values, "ABB01000", "3");
    ["ABL00670", "ABL00680", "ABL00690", "ABL00700"].forEach((tag, index) => { if (parts[index]) setTag(values, tag, parts[index]); });
    assert(validateOfficialFields(definition, values).some((error) => error.includes(amountTag)), `${amountTag} ${parts.join("|")} was accepted`);
    correlationCases += 1;
  }
  assert.equal(correlationCases, 12);
  results.correlation = { specificationRules: 12, rejectedCases: correlationCases, status: "pass" };

  const quasiMissing = baseValues(); setTag(quasiMissing, "ABA00020", "3");
  assert.equal(validateOfficialFields(definition, quasiMissing).filter((error) => error.includes("TEZ310")).length, 7);
  const quasi = { ...quasiMissing, deceasedName: "国税太郎", deceasedAddress: "東京都", deathDate: "2025-12-01", heirName: "国税花子", heirKana: "コクゼイハナコ", heirAddress: "東京都", heirNumber: "123456789012" };
  assert.equal(validateOfficialFields(definition, quasi).filter((error) => error.includes("TEZ310")).length, 0);
  const quasiXml = buildOfficialR07Xml(definition, quasi);
  assert(quasiXml.includes("<kyo:TEZ310"));
  assertXsd(quasiXml, "quasi-with-TEZ310");
  results.supplement = { missingRequiredCases: 7, tez310Generated: true, xsdValid: true, status: "pass" };

  const report = {
    specification: "所得税申告 KOA020 Ver23.0 / RKO0010 Ver25.0.0",
    generatedAt: new Date().toISOString(),
    result: "pass",
    unverifiedItems: 0,
    results
  };
  fs.mkdirSync("reports", { recursive: true });
  fs.writeFileSync("reports/r07-compliance-report.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

function baseValues() {
  return { taxpayerId: "1234567890123456", taxpayerName: "テスト", address: "東京都千代田区", taxOffice: "麹町", taxOfficeCode: "01101", creationDate: "2026-07-14", creatorName: "テスト", softwareName: "compliance-test" };
}

function contextFor(field) {
  const values = baseValues();
  setTag(values, "ABA00020", "2");
  if (["ABB00550", "ABB00555", "ABB00560"].includes(field.tag)) { setComponent(values, "ABA00010", "era", "5"); setComponent(values, "ABA00010", "yy", "7"); }
  if (field.tag === "ABB00900") setTag(values, "ABB00750", "1000");
  return values;
}

function setTag(values, tag, value, occurrence = 1) {
  const field = (byTag.get(tag) || []).find((entry) => entry.occurrence === occurrence && !entry.component) || (byTag.get(tag) || []).find((entry) => entry.occurrence === occurrence);
  assert(field, `Missing tag ${tag}`);
  values[field.id] = String(value);
}

function setComponent(values, tag, component, value, occurrence = 1) {
  const field = (byTag.get(tag) || []).find((entry) => entry.occurrence === occurrence && entry.component === component);
  assert(field, `Missing ${tag}/${component}`);
  values[field.id] = String(value);
}

function validValue(field) {
  const components = { era: "5", yy: "7", mm: "1", dd: "1", tel1: "03", tel2: "1234", tel3: "5678", zip1: "100", zip2: "0001", kinyukikan_NM: "銀行", "@kinyukikan_KB": "1", shiten_NM: "本店", "@shiten_KB": "1", yokin: "1", koza: "1234567", yubinkyoku_NM: "" };
  if (field.component) return components[field.component] ?? "1";
  const range = normalize(field.range);
  const code = range.match(/(?:^|\n)(-?\d+)[:.]/)?.[1];
  if (code) return code;
  const lower = range.match(/(-?\d+)≦x/)?.[1];
  if (lower) return lower;
  if (/x=1/.test(range)) return "1";
  if (field.commonType === "bango") return "123456789012";
  if (field.commonType === "n-kana" || field.note.includes("カタカナ")) return "テスト";
  const mask = String(field.format || "").replaceAll(",", "");
  if (/0+$/.test(mask)) return "0";
  if (field.inputType === "数値" || /Z|9/.test(mask)) return "1";
  return "テスト";
}

function invalidRangeCases(field) {
  if (field.tag === "ABB00550") return ["950001"];
  if (["ABB00555", "ABB00560"].includes(field.tag)) return ["-1"];
  if (field.tag === "ABB00900") return ["501"];
  const rule = normalize(field.range);
  const codes = [...rule.matchAll(/(?:^|\n)(-?\d+)[:.]/g)].map((match) => Number(match[1]));
  if (codes.length) return [String(Math.max(...codes) + 10)];
  let match = rule.match(/^(-?\d+)≦x≦(-?\d+)$/);
  if (match) return [String(Number(match[1]) - 1), String(Number(match[2]) + 1)];
  match = rule.match(/^(-?\d+)≦x$/);
  if (match) return [String(Number(match[1]) - 1)];
  match = rule.match(/^x=(-?\d+)$/);
  if (match) return [String(Number(match[1]) + 1)];
  throw new Error(`Unclassified range: ${field.tag} ${field.range}`);
}

function relevantErrors(errors, field) {
  return errors.filter((error) => error.includes(field.label) || error.includes(field.tag));
}

function prepareFormulaCase(field, values) {
  const line = normalize(field.note).match(/【計算】([^\n/]+)/)?.[1];
  assert(line, field.tag);
  const tokens = [...line.matchAll(/([A-Z]{3}\d{5})(の計)?|([＋－×])|(\d+(?:\.\d+)?)％/g)].map((match) => match[0]);
  let result = 0;
  let operator = "+";
  let tagIndex = 0;
  for (const token of tokens) {
    if (["＋", "－", "×"].includes(token)) { operator = { "＋": "+", "－": "-", "×": "*" }[token]; continue; }
    let value;
    if (token.endsWith("％")) value = Number.parseFloat(token) / 100;
    else {
      const tag = token.slice(0, 8);
      const entries = (byTag.get(tag) || []).filter((entry) => !entry.component);
      const unit = 1000 + (tagIndex * 100);
      if (token.includes("の計")) {
        entries.forEach((entry) => { values[entry.id] = String(unit); });
        value = unit * entries.length;
      } else {
        assert(entries[0], `Missing formula operand ${tag}`);
        values[entries[0].id] = String(unit);
        value = unit;
      }
      tagIndex += 1;
    }
    if (operator === "+") result += value;
    else if (operator === "-") result -= value;
    else result *= value;
  }
  if (field.note.includes("赤字の場合は0")) result = Math.max(0, result);
  if (field.tag === "ABB00720" && result > 0) result = Math.floor(result / 100) * 100;
  if (field.tag === "ABB00750") result = result > 0 ? Math.floor(result / 100) * 100 : 0;
  if (field.tag === "ABB00760") result = result < 0 ? Math.abs(result) : 0;
  return Math.trunc(result);
}

function assertXsd(xml, name) {
  const file = path.join(temp, `${name.replace(/[^A-Za-z0-9_.-]/g, "_")}.xml`);
  fs.writeFileSync(file, xml);
  const result = spawnSync("xmllint", ["--nonet", "--noout", "--schema", schema, file], { encoding: "utf8" });
  assert.equal(result.status, 0, `${name}: ${result.stderr}`);
}

function normalize(value) {
  return String(value || "").replaceAll(",", "").replaceAll("１", "1").replaceAll("＝", "=").replaceAll("Ａ", "A").replaceAll("Ｂ", "B").replaceAll("Ｐ", "P").replaceAll("−", "－").replaceAll("-", "－");
}
