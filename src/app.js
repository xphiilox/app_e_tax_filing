import { formDefinitions, officialSpecs } from "./specs.js";
import { buildXml, definitionFromXml } from "./xml.js";

const state = {
  activeTaxType: "income",
  activeSection: "basic",
  values: {},
  customDefinition: null,
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

function getDefinition() {
  return state.customDefinition || formDefinitions[state.activeTaxType];
}

function getFields(definition = getDefinition()) {
  return definition.sections.flatMap((section) => section.fields);
}

function init() {
  hydrateDefaults();
  renderNav();
  render();
  document.querySelector("#loadSample").addEventListener("click", loadSample);
  document.querySelector("#downloadXml").addEventListener("click", downloadXml);
  document.querySelector("#validateButton").addEventListener("click", () => {
    validate();
    render();
  });
  document.querySelector("#definitionFile").addEventListener("change", importDefinition);
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
    button.className = spec.taxType === state.activeTaxType && !state.customDefinition ? "active" : "";
    button.innerHTML = `<span>${spec.item}</span><strong>${spec.label}</strong>`;
    button.addEventListener("click", () => {
      state.activeTaxType = spec.taxType;
      state.customDefinition = null;
      state.activeSection = formDefinitions[spec.taxType].sections[0].id;
      state.validation = [];
      renderNav();
      render();
    });
    taxNav.append(button);
  });
}

function render() {
  const definition = getDefinition();
  const spec = officialSpecs.find((entry) => entry.taxType === definition.taxType);
  formTitle.textContent = definition.title;
  specMeta.innerHTML = spec
    ? `項番${spec.item} / ${spec.updatedAt}<br><a href="${spec.href}" target="_blank" rel="noreferrer">公式CAB ${spec.size}</a>`
    : "取込済みのローカル定義を使用中";

  renderStatus(definition);
  renderTabs(definition);
  renderForm(definition);
  renderPaper(definition);
  renderXml(definition);
  renderValidation();
}

function renderStatus(definition) {
  const requiredCount = getFields(definition).filter((field) => field.required).length;
  const filledCount = getFields(definition).filter((field) => String(state.values[field.id] ?? "").trim()).length;
  statusGrid.innerHTML = `
    <article><span>対象仕様</span><strong>項番9-13</strong></article>
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
  const visibleSections = definition.sections.map((section) => {
    const rows = section.fields
      .map((field) => {
        const value = state.values[field.id] ?? field.value ?? "";
        return `<tr><th>${field.label}</th><td>${formatValue(field, value)}</td><td>${field.xmlPath}</td></tr>`;
      })
      .join("");
    return `<section><h3>${section.label}</h3><table>${rows}</table></section>`;
  });

  paperPreview.innerHTML = `
    <div class="paper-head">
      <p>電子申告帳票</p>
      <h2>${definition.title}</h2>
      <span>${definition.rootElement}</span>
    </div>
    ${visibleSections.join("")}
  `;
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
    taxpayerId: "1234567890123456",
    address: "東京都千代田区霞が関1-1-1",
    phone: "0312345678",
    taxOffice: "麹町",
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

async function importDefinition(event) {
  const [file] = event.target.files;
  if (!file) return;
  const text = await file.text();
  try {
    state.customDefinition = file.name.endsWith(".json") ? JSON.parse(text) : definitionFromXml(text);
    state.activeSection = state.customDefinition.sections[0].id;
    state.validation = [];
    renderNav();
    render();
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = "";
  }
}

init();
