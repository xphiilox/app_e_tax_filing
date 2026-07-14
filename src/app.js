import { formDefinitions, officialSpecs } from "./specs.js";
import { buildXml, definitionFromXml } from "./xml.js";
import { createDefaultHtmlTemplate, createHtmlPreviewDocument } from "./html-renderer.js";
import { extractOfficialR07Values, isOfficialR07Instance } from "./official-r07-xml-state.js";
import {
  calculateOfficialFields,
  enhanceOfficialR07Definition,
  synchronizeOfficialValues,
  validateOfficialFields
} from "./official-r07-compliance.js";

const state = {
  activeTaxType: "income",
  activeSection: "basic",
  activePage: 1,
  values: {},
  customDefinition: null,
  importedFileName: "",
  validation: [],
  xsdValidation: { status: "idle", errors: [] },
  layoutSources: new Map(),
  xmlText: ""
};

const taxNav = document.querySelector("#taxNav");
const specMeta = document.querySelector("#specMeta");
const formTitle = document.querySelector("#formTitle");
const paperPreview = document.querySelector("#paperPreview");
const xmlPreview = document.querySelector("#xmlPreview");
const statusGrid = document.querySelector("#statusGrid");
const validationSummary = document.querySelector("#validationSummary");
const pageTabs = document.querySelector("#pageTabs");
const xsdResult = document.querySelector("#xsdResult");
const layoutEditor = document.querySelector("#layoutEditor");
const layoutEditorPage = document.querySelector("#layoutEditorPage");
const layoutEditorStatus = document.querySelector("#layoutEditorStatus");
const layoutSource = document.querySelector("#layoutSource");
const autoApplyLayout = document.querySelector("#autoApplyLayout");
let layoutApplyTimer;

function getDefinition() {
  return state.customDefinition || formDefinitions[state.activeTaxType];
}

function getFields(definition = getDefinition()) {
  return definition.sections.flatMap((section) => section.fields);
}

function currentXml(definition = getDefinition()) {
  if (definition.officialFieldSpec && state.xmlText) return state.xmlText;
  return buildXml(definition, state.values);
}

function replaceOfficialXml(definition, values) {
  state.xmlText = buildXml(definition, values);
  state.values = extractOfficialR07Values(definition, state.xmlText);
}

async function init() {
  hydrateDefaults();
  renderNav();
  render();
  document.querySelector("#loadOfficialR07").addEventListener("click", () => loadOfficialR07());
  document.querySelector("#loadSample").addEventListener("click", loadSample);
  document.querySelector("#downloadXml").addEventListener("click", downloadXml);
  document.querySelector("#downloadPdf").addEventListener("click", printCurrentPaper);
  document.querySelector("#copyXml").addEventListener("click", copyXml);
  document.querySelector("#applyXmlToForm").addEventListener("click", applyEditedXmlToForm);
  document.querySelector("#xsdValidateButton").addEventListener("click", validateXsd);
  document.querySelector("#applyLayoutSource").addEventListener("click", applyLayoutSource);
  document.querySelector("#resetLayoutSource").addEventListener("click", resetLayoutSource);
  layoutSource.addEventListener("input", handleLayoutSourceInput);
  document.querySelector("#validateButton").addEventListener("click", () => {
    validate();
    render();
  });
  document.querySelector("#definitionFile").addEventListener("change", importDefinition);
  window.addEventListener("message", handlePreviewMessage);
  await loadOfficialR07();
}

function hydrateDefaults() {
  Object.values(formDefinitions).forEach((definition) => {
    definition.sections.forEach((section) => {
      section.fields.forEach((field) => {
        state.values[field.id] ??= field.value ?? "";
      });
    });
  });
  state.values.filingDate ||= new Date().toISOString().slice(0, 10);
  state.values.creationDate ||= new Date().toISOString().slice(0, 10);
}

function renderNav() {
  taxNav.innerHTML = "";
  officialSpecs.forEach((spec) => {
    const button = document.createElement("button");
    button.className = spec.taxType === state.activeTaxType && (!state.customDefinition || state.customDefinition.taxType === spec.taxType) ? "active" : "";
    button.innerHTML = `<span>${spec.item}</span><strong>${spec.label}</strong>`;
    button.addEventListener("click", async () => {
      state.activeTaxType = spec.taxType;
      if (spec.taxType === "income") {
        await loadOfficialR07();
        return;
      }
      state.customDefinition = null;
      state.importedFileName = "";
      state.activeSection = formDefinitions[spec.taxType].sections[0].id;
      state.activePage = 1;
      state.validation = [];
      renderNav();
      render();
    });
    taxNav.append(button);
  });
}

function render() {
  const definition = getDefinition();
  const spec = state.customDefinition ? null : officialSpecs.find((entry) => entry.taxType === definition.taxType);
  formTitle.textContent = definition.title;
  specMeta.innerHTML = spec
    ? `項番${spec.item} / ${spec.updatedAt}<br><a href="${spec.href}" target="_blank" rel="noreferrer">公式CAB ${spec.size}</a>`
    : `<strong>${escapeHtml(state.importedFileName)}</strong><br>${sourceLabel(definition.sourceType)}から生成した帳票を表示中`;

  renderStatus(definition);
  renderPageTabs(definition);
  renderPaper(definition);
  renderLayoutEditor(definition);
  renderXml(definition);
  renderValidation();
  renderXsdValidation();
}

function renderStatus(definition) {
  const requiredCount = getFields(definition).filter((field) => field.required).length;
  const filledCount = getFields(definition).filter((field) => String(state.values[field.id] ?? "").trim()).length;
  statusGrid.innerHTML = `
    <article><span>読込元</span><strong>${definition.sourceType ? escapeHtml(sourceLabel(definition.sourceType)) : "項番9-13"}</strong></article>
    <article><span>入力項目</span><strong>${filledCount}/${getFields(definition).length}</strong></article>
    <article><span>必須項目</span><strong>${requiredCount}</strong></article>
    <article><span>準拠仕様</span><strong>${definition.specCounts ? `全${definition.specCounts.sourceRows}行` : "XML"}</strong></article>
  `;
}

function renderPageTabs(definition) {
  pageTabs.innerHTML = "";
  const pages = definition.layout?.pages || [];
  pageTabs.hidden = pages.length === 0;
  pages.forEach((page) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = page.number === state.activePage ? "active" : "";
    button.textContent = page.label;
    button.addEventListener("click", () => {
      state.activePage = page.number;
      renderPageTabs(definition);
      renderPaper(definition);
      renderLayoutEditor(definition);
    });
    pageTabs.append(button);
  });
}

function renderPaper(definition) {
  if (definition.layout?.pages?.length) {
    renderOfficialPaper(definition);
    return;
  }
  paperPreview.className = "paper";
  const active = definition.sections.find((section) => section.id === state.activeSection) || definition.sections[0];
  const visibleSections = [active].map((section) => {
    const rows = section.fields
      .map((field) => {
        const value = state.values[field.id] ?? field.value ?? "";
        return `<tr><th>${escapeHtml(field.label)}</th><td>${escapeHtml(formatValue(field, value))}</td><td>${escapeHtml(field.xmlPath)}</td></tr>`;
      })
      .join("");
    return `<section><h3>${escapeHtml(section.label)}</h3><table>${rows}</table></section>`;
  });

  paperPreview.innerHTML = `
    <div class="paper-head">
      <p>電子申告帳票</p>
      <h2>${escapeHtml(definition.title)}</h2>
      <span>${escapeHtml(definition.rootElement)}</span>
    </div>
    ${visibleSections.join("")}
  `;
}

function renderOfficialPaper(definition) {
  const page = definition.layout.pages.find((entry) => entry.number === state.activePage) || definition.layout.pages[0];
  state.activePage = page.number;
  const source = getLayoutSource(definition, page);
  const previewDocument = createHtmlPreviewDocument(source, currentXml(definition), getFields(definition), state.values, definition.officialFieldSpec);
  paperPreview.className = "paper official-paper-shell";
  paperPreview.innerHTML = `
    <iframe class="html-paper-frame" title="${escapeHtml(`${definition.title} ${page.label}`)}" sandbox="allow-scripts allow-modals"></iframe>
    <p class="xml-render-caption"><strong>XML正本</strong> 表示中の正式e-Tax XMLを解析して帳票化し、帳票入力は同じXMLへ即時反映されます。</p>
  `;
  paperPreview.querySelector(".html-paper-frame").srcdoc = previewDocument;
}

function renderLayoutEditor(definition) {
  const page = definition.layout?.pages?.find((entry) => entry.number === state.activePage);
  layoutEditor.hidden = !page;
  if (!page) return;
  layoutEditorPage.textContent = page.label;
  layoutSource.value = getLayoutSource(definition, page);
  setLayoutEditorStatus("反映済み", "applied");
}

function getLayoutSource(definition, page) {
  const key = layoutSourceKey(definition, page);
  if (!state.layoutSources.has(key)) {
    state.layoutSources.set(key, createDefaultHtmlTemplate(definition, page));
  }
  return state.layoutSources.get(key);
}

function layoutSourceKey(definition, page) {
  return `${definition.taxType}:${definition.version || "local"}:${page.number}`;
}

function handleLayoutSourceInput() {
  const definition = getDefinition();
  const page = definition.layout?.pages?.find((entry) => entry.number === state.activePage);
  if (!page) return;
  state.layoutSources.set(layoutSourceKey(definition, page), layoutSource.value);
  setLayoutEditorStatus(autoApplyLayout.checked ? "自動反映待ち" : "未反映", "dirty");
  window.clearTimeout(layoutApplyTimer);
  if (autoApplyLayout.checked) {
    layoutApplyTimer = window.setTimeout(() => {
      renderOfficialPaper(definition);
      setLayoutEditorStatus("反映済み", "applied");
    }, 280);
  }
}

function applyLayoutSource() {
  const definition = getDefinition();
  const page = definition.layout?.pages?.find((entry) => entry.number === state.activePage);
  if (!page) return;
  state.layoutSources.set(layoutSourceKey(definition, page), layoutSource.value);
  renderOfficialPaper(definition);
  setLayoutEditorStatus("反映済み", "applied");
}

function resetLayoutSource() {
  const definition = getDefinition();
  const page = definition.layout?.pages?.find((entry) => entry.number === state.activePage);
  if (!page) return;
  const source = createDefaultHtmlTemplate(definition, page);
  state.layoutSources.set(layoutSourceKey(definition, page), source);
  layoutSource.value = source;
  renderOfficialPaper(definition);
  setLayoutEditorStatus("初期HTMLを反映", "applied");
}

function setLayoutEditorStatus(message, status) {
  layoutEditorStatus.textContent = message;
  layoutEditorStatus.className = `editor-state ${status}`;
}

function renderXml(definition) {
  xmlPreview.textContent = currentXml(definition);
}

function applyEditedXmlToForm() {
  const definition = getDefinition();
  if (!definition.officialFieldSpec) {
    alert("正式e-Tax XML帳票で利用してください。");
    return;
  }
  try {
    const xmlText = xmlPreview.textContent.trim();
    const values = extractOfficialR07Values(definition, xmlText);
    state.xmlText = xmlText;
    state.values = values;
    state.validation = [];
    state.xsdValidation = { status: "idle", errors: [] };
    renderStatus(definition);
    renderPaper(definition);
    renderValidation();
    renderXsdValidation();
    validationSummary.textContent = "XMLから帳票を再描画しました";
    validationSummary.className = "ok";
  } catch (error) {
    state.validation = [error.message];
    renderValidation();
  }
}

function handlePreviewMessage(event) {
  const iframe = paperPreview.querySelector(".html-paper-frame");
  if (!iframe || event.source !== iframe.contentWindow || event.data?.type !== "etax-field-change") return;
  const field = getFields().find((entry) => entry.id === event.data.fieldId);
  if (!field) return;
  const definition = getDefinition();
  if (definition.officialFieldSpec) {
    const xmlValues = extractOfficialR07Values(definition, currentXml(definition));
    xmlValues[field.id] = String(event.data.value ?? "");
    const calculated = calculateOfficialFields(definition, xmlValues);
    replaceOfficialXml(definition, xmlValues);
    if (Object.keys(calculated).length) iframe.contentWindow.postMessage({ type: "etax-values", values: calculated }, "*");
  } else {
    state.values[field.id] = String(event.data.value ?? "");
  }
  state.validation = [];
  state.xsdValidation = { status: "idle", errors: [] };
  renderStatus(definition);
  renderXml(definition);
  renderXsdValidation();
  validationSummary.textContent = "XMLへ同期済み";
  validationSummary.className = "ok";
}

function printCurrentPaper() {
  const iframe = paperPreview.querySelector(".html-paper-frame");
  if (!iframe) return;
  validationSummary.textContent = "PDF保存画面を開いています";
  validationSummary.className = "ok";
  iframe.contentWindow.postMessage({ type: "etax-print" }, "*");
}

function formatValue(field, value) {
  if (field.type === "number" && value !== "") {
    return Number(value).toLocaleString("ja-JP");
  }
  return value || "-";
}

function validate() {
  const definition = getDefinition();
  state.validation = getFields(definition).flatMap((field) => {
    const value = String(state.values[field.id] ?? "").trim();
    if (field.required && !value) return [`${field.label} は必須です。`];
    if (field.pattern && value && !new RegExp(field.pattern).test(value)) {
      return [`${field.label} の形式が不正です。${field.hint || ""}`.trim()];
    }
    return [];
  });
  state.validation.push(...validateOfficialFields(definition, state.values));
}

function renderValidation() {
  if (state.validation.length === 0) {
    validationSummary.textContent = "エラーなし";
    validationSummary.className = "ok";
    validationSummary.removeAttribute("title");
    return;
  }
  validationSummary.textContent = `${state.validation.length}件の確認事項`;
  validationSummary.className = "error";
  validationSummary.title = state.validation.join("\n");
}

async function validateXsd() {
  validate();
  renderValidation();
  if (state.validation.length > 0) {
    state.xsdValidation = { status: "error", errors: ["先に入力チェックの確認事項を修正してください。"] };
    renderXsdValidation();
    return;
  }

  state.xsdValidation = { status: "checking", errors: [] };
  renderXsdValidation();
  try {
    const response = await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=UTF-8" },
      body: currentXml(getDefinition())
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.errors?.[0] || "XSD検証サービスから応答がありません。");
    state.xsdValidation = {
      status: result.valid ? "valid" : "invalid",
      errors: result.errors || [],
      schema: result.schema
    };
  } catch (error) {
    state.xsdValidation = {
      status: "error",
      errors: [`${error.message} Docker Composeで起動しているか確認してください。`]
    };
  }
  renderXsdValidation();
}

function renderXsdValidation() {
  const { status, errors, schema } = state.xsdValidation;
  xsdResult.className = `xsd-result ${status}`;
  xsdResult.innerHTML = "";
  const title = document.createElement("strong");
  title.textContent = {
    idle: "公式XSD: 未検証",
    checking: "公式XSD: 検証中…",
    valid: "公式XSD: 適合",
    invalid: "公式XSD: 不適合",
    error: "公式XSD: 検証できません"
  }[status] || "公式XSD: 未検証";
  xsdResult.append(title);

  if (status === "valid") {
    const detail = document.createElement("p");
    detail.textContent = `${schema || "RKO0010-250.xsd"} に適合しています。`;
    xsdResult.append(detail);
  } else if (errors.length > 0) {
    const list = document.createElement("ol");
    errors.forEach((error) => {
      const item = document.createElement("li");
      item.textContent = error;
      list.append(item);
    });
    xsdResult.append(list);
  } else {
    const detail = document.createElement("p");
    detail.textContent = "「XSD検証」で出力XMLを国税庁の手続ルートXSDに照合します。";
    xsdResult.append(detail);
  }
}

function loadSample() {
  Object.assign(state.values, {
    taxpayerName: "山田 太郎",
    filingYear: "7",
    taxpayerKana: "ヤマダ タロウ",
    postalCode: "1000013",
    individualNumber: "123456789012",
    birthDate: "昭和55年1月1日",
    taxpayerId: "1234567890123456",
    address: "東京都千代田区霞が関1-1-1",
    januaryAddress: "東京都千代田区霞が関1-1-1",
    occupation: "会社員",
    householder: "山田 太郎",
    relationship: "本人",
    phone: "0312345678",
    taxOffice: "麹町",
    filingDate: "令和8年2月16日",
    creationDate: new Date().toISOString().slice(0, 10),
    softwareName: "e-Tax Filing Designer",
    creatorName: "山田 太郎",
    taxOfficeCode: "01101",
    incomeSalary: "6200000",
    amountSalary: "4520000",
    basicDeduction: "480000",
    regularDeductionsTotal: "1340000",
    taxableIncome: "3180000",
    incomeTax: "220500",
    withholdingTax: "143000",
    declaredTax: "77500",
    taxPayable: "77500",
    salaryIncome: "6200000",
    businessIncome: "0",
    miscIncome: "120000",
    socialInsurance: "820000",
    lifeInsurance: "40000",
    donation: "30000",
    corporateName: "サンプル株式会社",
    corporateNumber: "1234567890123",
    representative: "山田 花子",
    headOffice: "東京都港区芝1-1-1",
    revenue: "48200000",
    expense: "39100000",
    taxableIncome: "9100000",
    taxableSales10: "22000000",
    taxableSales8: "1800000",
    inputTax: "1450000",
    realEstate: "32000000",
    securities: "4000000",
    cashDeposit: "8500000",
    liabilities: "12000000",
    payerName: "サンプル株式会社",
    payerId: "1234567890123456",
    payerAddress: "東京都港区芝1-1-1",
    salaryPayment: "2800000",
    withheldTax: "143000",
    people: "8"
  });
  synchronizeOfficialValues(getDefinition(), state.values, true);
  if (getDefinition().officialFieldSpec) replaceOfficialXml(getDefinition(), state.values);
  validate();
  render();
}

function downloadXml() {
  validate();
  render();
  if (state.validation.length > 0) return;

  const definition = getDefinition();
  const blob = new Blob([currentXml(definition)], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${definition.rootElement}.xml`;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyXml() {
  const button = document.querySelector("#copyXml");
  const xml = xmlPreview.textContent;

  try {
    await navigator.clipboard.writeText(xml);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = xml;
    textarea.setAttribute("readonly", "");
    textarea.className = "copy-fallback";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("XMLをコピーできませんでした。");
  }

  button.textContent = "Copied";
  button.classList.add("copied");
  window.setTimeout(() => {
    button.textContent = "Copy";
    button.classList.remove("copied");
  }, 1800);
}

async function importDefinition(event) {
  const [file] = event.target.files;
  if (!file) return;
  const text = await file.text();
  try {
    if (!file.name.toLowerCase().endsWith(".json") && isOfficialR07Instance(text)) {
      await loadOfficialR07(text, file.name);
      return;
    }
    const definition = file.name.toLowerCase().endsWith(".json") ? JSON.parse(text) : definitionFromXml(text);
    applyDefinition(definition, file.name);
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = "";
  }
}

async function loadOfficialR07(instanceXml = "", fileName = "令和7年 帳票・XML構造定義・帳票フィールド仕様 / KOA020 Ver23.0") {
  try {
    const response = await fetch("./examples/r07-income-tax-definition.xml");
    if (!response.ok) throw new Error("令和7年帳票定義を読み込めませんでした。");
    applyDefinition(enhanceOfficialR07Definition(definitionFromXml(await response.text())), fileName, instanceXml);
  } catch (error) {
    console.error(error);
    if (instanceXml) alert(error.message);
  }
}

function applyDefinition(definition, fileName, instanceXml = "") {
  definition = enhanceOfficialR07Definition(definition);
  assertDefinition(definition);
  state.customDefinition = definition;
  state.activeTaxType = definition.taxType === "imported" ? state.activeTaxType : definition.taxType;
  state.importedFileName = fileName;
  state.activeSection = definition.sections[0].id;
  state.activePage = definition.layout?.pages?.[0]?.number || 1;
  definition.sections.flatMap((section) => section.fields).forEach((field) => {
    state.values[field.id] = field.value ?? "";
  });
  state.values.creationDate ||= new Date().toISOString().slice(0, 10);
  synchronizeOfficialValues(definition, state.values);
  if (definition.officialFieldSpec) {
    state.xmlText = instanceXml || buildXml(definition, state.values);
    state.values = extractOfficialR07Values(definition, state.xmlText);
  } else {
    state.xmlText = "";
  }
  state.validation = [];
  state.xsdValidation = { status: "idle", errors: [] };
  state.layoutSources = new Map();
  renderNav();
  render();
}

function assertDefinition(definition) {
  if (!definition || !definition.rootElement || !Array.isArray(definition.sections)) {
    throw new Error("帳票定義として必要なrootElementまたはsectionsがありません。");
  }
  if (definition.sections.length === 0 || definition.sections.some((section) => !Array.isArray(section.fields))) {
    throw new Error("入力項目を含む帳票定義ではありません。");
  }
}

function sourceLabel(sourceType) {
  return {
    definition: "定義XML",
    xsd: "XSD",
    xml: "XML"
  }[sourceType] || "ローカル定義";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();
