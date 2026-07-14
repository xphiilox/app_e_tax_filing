import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildOfficialPko0420Xml, createOfficialPko0420Definition } from "../src/official-pko0420.js";

const definition = createOfficialPko0420Definition();
const fields = definition.sections.flatMap((section) => section.fields);
const values = Object.fromEntries(fields.map((field) => [field.id, field.value || ""]));
Object.assign(values, {
  taxpayerId: "1234567890123456", taxOfficeCode: "01101", creationDate: "2026-07-14",
  pko_1_1: "5", pko_2_1: "8", pko_3_1: "1", pko_4_1: "麹町",
  pko_5_1: "5", pko_6_1: "8", pko_7_1: "7", pko_8_1: "14",
  pko_10_1: "100", pko_11_1: "0013", pko_12_1: "東京都千代田区霞が関1-1-1",
  pko_16_1: "ヤマダ タロウ", pko_17_1: "山田 太郎", pko_18_1: "会社員",
  pko_19_1: "03", pko_20_1: "1234", pko_21_1: "5678",
  pko_22_1: "5", pko_23_1: "8", pko_24_1: "300000", pko_25_1: "180000",
  pko_30_1: "5", pko_31_1: "8", pko_39_1: "1", pko_40_1: "業況の変化により申告納税見積額が予定納税基準額を下回るため。",
  pko_42_1: "5", pko_43_1: "8", pko_47_1: "3200000", pko_107_1: "180000",
  pko_108_1: "90000", pko_109_1: "90000", pko_110_1: "1"
});

assert.equal(definition.procedure, "PKO0420");
assert.equal(definition.procedureVersion, "26.0.0");
assert.equal(definition.rootElement, "KOZ280");
assert.equal(definition.version, "21.0");
assert.equal(definition.specCounts.sourceRows, 114);
assert.equal(definition.specCounts.fields, 117);

const xml = buildOfficialPko0420Xml(definition, values);
assert.match(xml, /<PKO0420 id="PKO0420-1" VR="26\.0\.0">/);
assert.match(xml, /<KOZ280 VR="21\.0"/);
assert.match(xml, /<procedure_CD>PKO0420<\/procedure_CD>/);
assert.match(xml, /<GEC00000 IDREF="ZEIMUSHO"\/>/);

const directory = mkdtempSync(path.join(tmpdir(), "pko0420-"));
try {
  validateXml(xml, path.join(directory, "PKO0420-sample.xml"));
  const allValues = { taxpayerId: "1234567890123456", taxOfficeCode: "01101", softwareName: "e-Tax Filing Designer", creatorName: "本人", creationDate: "2026-07-14" };
  for (const field of fields.filter((entry) => entry.item)) allValues[field.id] = representativeValue(field);
  validateXml(buildOfficialPko0420Xml(definition, allValues), path.join(directory, "PKO0420-all-fields.xml"));
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  procedure: "PKO0420 26.0.0",
  form: "KOZ280 21.0",
  schema: "shotoku/PKO0420-260.xsd",
  sourceRows: 114,
  generatedFields: 117
}, null, 2));

function validateXml(source, xmlPath) {
  writeFileSync(xmlPath, source);
  execFileSync("xmllint", [
    "--nonet", "--noout", "--schema",
    path.resolve("e-taxall/19XMLスキーマ/shotoku/PKO0420-260.xsd"),
    xmlPath
  ], { stdio: "pipe" });
}

function representativeValue(field) {
  const components = { era: "5", yy: "8", mm: "1", dd: "1", zip1: "100", zip2: "0001", tel1: "03", tel2: "1234", tel3: "5678" };
  if (components[field.component]) return components[field.component];
  if (field.commonType === "zeimusho") return "麹町";
  if (field.commonType === "n-kana") return "ヤマダタロウ";
  if (field.commonType === "name") return "山田太郎";
  if (field.commonType === "address") return "東京都千代田区";
  if (field.commonType === "shokugyo") return "会社員";
  if (["kubun", "kubun2"].includes(field.commonType)) return field.range.match(/(?:^|\n)\s*(\d+)/)?.[1] || "1";
  if (field.type === "number") return "0";
  if (field.commonType.includes("string(3)")) return "特例";
  return "申請内容";
}
