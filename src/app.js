import { formDefinitions, officialSpecs } from "./specs.js";
import { buildXml, definitionFromXml } from "./xml.js";

const state = {
  activeTaxType: "income",
  activeSection: "basic",
  activePage: 1,
  values: {},
  customDefinition: null,
  importedFileName: "",
  validation: []
};

const taxNav = document.querySelector("#taxNav");
const specMeta = document.querySelector("#specMeta");
const formTitle = document.querySelector("#formTitle");
const sectionTabs = document.querySelector("#sectionTabs");
const filingForm = document.querySelector("#filingForm");
const paperPreview = document.querySelector("#paperPreview");
const xmlPreview = document.querySelector("#xmlPreview");
const statusGrid = document.querySelector("#statusGrid");
const validationSummary = document.querySelector("#validationSummary");
const pageTabs = document.querySelector("#pageTabs");

function getDefinition() {
  return state.customDefinition || formDefinitions[state.activeTaxType];
}

function getFields(definition = getDefinition()) {
  return definition.sections.flatMap((section) => section.fields);
}

async function init() {
  hydrateDefaults();
  renderNav();
  render();
  document.querySelector("#loadOfficialR07").addEventListener("click", loadOfficialR07);
  document.querySelector("#loadSample").addEventListener("click", loadSample);
  document.querySelector("#downloadXml").addEventListener("click", downloadXml);
  document.querySelector("#copyXml").addEventListener("click", copyXml);
  document.querySelector("#validateButton").addEventListener("click", () => {
    validate();
    render();
  });
  document.querySelector("#definitionFile").addEventListener("change", importDefinition);
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
  renderTabs(definition);
  renderPageTabs(definition);
  renderForm(definition);
  renderPaper(definition);
  renderXml(definition);
  renderValidation();
}

function renderStatus(definition) {
  const requiredCount = getFields(definition).filter((field) => field.required).length;
  const filledCount = getFields(definition).filter((field) => String(state.values[field.id] ?? "").trim()).length;
  statusGrid.innerHTML = `
    <article><span>読込元</span><strong>${definition.sourceType ? escapeHtml(sourceLabel(definition.sourceType)) : "項番9-13"}</strong></article>
    <article><span>入力項目</span><strong>${filledCount}/${getFields(definition).length}</strong></article>
    <article><span>必須項目</span><strong>${requiredCount}</strong></article>
    <article><span>出力形式</span><strong>XML</strong></article>
  `;
}

function renderTabs(definition) {
  if (!definition.sections.some((section) => section.id === state.activeSection)) {
    state.activeSection = definition.sections[0].id;
  }

  sectionTabs.innerHTML = "";
  definition.sections.forEach((section) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = section.id === state.activeSection ? "active" : "";
    button.textContent = section.label;
    button.addEventListener("click", () => {
      state.activeSection = section.id;
      render();
    });
    sectionTabs.append(button);
  });
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
    });
    pageTabs.append(button);
  });
}

function renderForm(definition) {
  const template = document.querySelector("#fieldTemplate");
  const section = definition.sections.find((entry) => entry.id === state.activeSection) || definition.sections[0];
  filingForm.innerHTML = "";

  section.fields.forEach((field) => {
    const node = template.content.cloneNode(true);
    const label = node.querySelector(".field-label");
    const input = node.querySelector("input");
    const hint = node.querySelector("small");
    label.textContent = field.required ? `${field.label} *` : field.label;
    input.name = field.id;
    input.type = field.type || "text";
    input.value = state.values[field.id] ?? field.value ?? "";
    input.required = Boolean(field.required);
    if (field.pattern) input.pattern = field.pattern;
    hint.textContent = field.hint || field.xmlPath;
    input.addEventListener("input", (event) => {
      state.values[field.id] = event.target.value;
      renderPaper(definition);
      renderXml(definition);
    });
    filingForm.append(node);
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
  const fields = getFields(definition).filter((field) => field.page === page.number && field.position);
  const controls = fields.map((field) => {
    const position = field.position;
    const value = state.values[field.id] ?? field.value ?? "";
    const style = `left:${position.x}%;top:${position.y}%;width:${position.width}%;height:${position.height}%;text-align:${position.align}`;
    return `<input class="paper-input" data-field-id="${escapeHtml(field.id)}" aria-label="${escapeHtml(field.label)}" title="${escapeHtml(field.label)}" type="${escapeHtml(field.type || "text")}" value="${escapeHtml(value)}" style="${style}">`;
  }).join("");

  paperPreview.className = "paper official-paper-shell";
  paperPreview.innerHTML = `
    <div class="official-paper-page">
      <img src="${escapeHtml(page.image)}" alt="${escapeHtml(`${definition.title} ${page.label}`)}">
      ${controls}
    </div>
  `;

  paperPreview.querySelectorAll(".paper-input").forEach((input) => {
    input.addEventListener("input", (event) => {
      state.values[event.target.dataset.fieldId] = event.target.value;
      renderXml(definition);
    });
  });
}

function renderXml(definition) {
  xmlPreview.textContent = buildXml(definition, state.values);
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
}

function renderValidation() {
  if (state.validation.length === 0) {
    validationSummary.textContent = "エラーなし";
    validationSummary.className = "ok";
    return;
  }
  validationSummary.textContent = `${state.validation.length}件の確認事項`;
  validationSummary.className = "error";
}

function loadSample() {
  Object.assign(state.values, {
    taxpayerName: "山田 太郎",
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
  validate();
  render();
}

function downloadXml() {
  validate();
  render();
  if (state.validation.length > 0) return;

  const definition = getDefinition();
  const blob = new Blob([buildXml(definition, state.values)], { type: "application/xml" });
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
    const definition = file.name.toLowerCase().endsWith(".json") ? JSON.parse(text) : definitionFromXml(text);
    applyDefinition(definition, file.name);
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = "";
  }
}

async function loadOfficialR07() {
  try {
    const response = await fetch("./examples/r07-income-tax-definition.xml");
    if (!response.ok) throw new Error("令和7年帳票定義を読み込めませんでした。");
    applyDefinition(definitionFromXml(await response.text()), "令和7年 帳票・XML構造定義 / KOA020 Ver23.0");
  } catch (error) {
    console.error(error);
  }
}

function applyDefinition(definition, fileName) {
  assertDefinition(definition);
  state.customDefinition = definition;
  state.activeTaxType = definition.taxType === "imported" ? state.activeTaxType : definition.taxType;
  state.importedFileName = fileName;
  state.activeSection = definition.sections[0].id;
  state.activePage = definition.layout?.pages?.[0]?.number || 1;
  definition.sections.flatMap((section) => section.fields).forEach((field) => {
    state.values[field.id] = field.value ?? "";
  });
  state.validation = [];
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
