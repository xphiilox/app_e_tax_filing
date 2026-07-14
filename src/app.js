import { formDefinitions, officialSpecs } from "./specs.js";
import { buildXml, definitionFromXml } from "./xml.js";
import { createDefaultHtmlTemplate, createHtmlPreviewDocument } from "./html-renderer.js";
import { detectSupportedOfficialForm, extractOfficialR07Values } from "./official-r07-xml-state.js";
import { createOfficialPko0420Definition } from "./official-pko0420.js";
import { cloneDesignerItem, compileDesignerTemplate, createDesignerItem } from "./form-designer.js?v=20260714-designer";
import {
  calculateOfficialFields,
  enhanceOfficialR07Definition,
  synchronizeOfficialValues,
  validateOfficialFields
} from "./official-r07-compliance.js?v=20260714-pko0420";

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
  designerLayouts: new Map(),
  designerSelectedId: "",
  designerDrag: null,
  xmlText: ""
};

const taxNav = document.querySelector("#taxNav");
const specMeta = document.querySelector("#specMeta");
const formTitle = document.querySelector("#formTitle");
const paperPreview = document.querySelector("#paperPreview");
const xmlPreview = document.querySelector("#xmlPreview");
const xmlProcedureMeta = document.querySelector("#xmlProcedureMeta");
const statusGrid = document.querySelector("#statusGrid");
const validationSummary = document.querySelector("#validationSummary");
const pageTabs = document.querySelector("#pageTabs");
const xsdResult = document.querySelector("#xsdResult");
const layoutEditor = document.querySelector("#layoutEditor");
const layoutEditorPage = document.querySelector("#layoutEditorPage");
const layoutEditorStatus = document.querySelector("#layoutEditorStatus");
const layoutSource = document.querySelector("#layoutSource");
const autoApplyLayout = document.querySelector("#autoApplyLayout");
const designerCanvas = document.querySelector("#designerCanvas");
const schemaTree = document.querySelector("#schemaTree");
const schemaSearch = document.querySelector("#schemaSearch");
const designerEmptySelection = document.querySelector("#designerEmptySelection");
const designerPropertyFields = document.querySelector("#designerPropertyFields");
const designerMapping = document.querySelector("#designerMapping");
const designerPropertyInputs = {
  text: document.querySelector("#designerText"), x: document.querySelector("#designerX"), y: document.querySelector("#designerY"),
  width: document.querySelector("#designerWidth"), height: document.querySelector("#designerHeight"), fontSize: document.querySelector("#designerFontSize"),
  calculation: document.querySelector("#designerCalculation"), required: document.querySelector("#designerRequired"), min: document.querySelector("#designerMin"),
  max: document.querySelector("#designerMax"), pattern: document.querySelector("#designerPattern"), message: document.querySelector("#designerMessage")
};
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
  document.querySelector("#loadOfficialPko0420").addEventListener("click", () => loadOfficialPko0420());
  document.querySelector("#loadSample").addEventListener("click", loadSample);
  document.querySelector("#downloadXml").addEventListener("click", downloadXml);
  document.querySelector("#downloadPdf").addEventListener("click", printCurrentPaper);
  document.querySelector("#copyXml").addEventListener("click", copyXml);
  document.querySelector("#applyXmlToForm").addEventListener("click", applyEditedXmlToForm);
  document.querySelector("#xsdValidateButton").addEventListener("click", validateXsd);
  document.querySelector("#applyLayoutSource").addEventListener("click", applyLayoutSource);
  document.querySelector("#resetLayoutSource").addEventListener("click", resetLayoutSource);
  document.querySelectorAll("[data-designer-add]").forEach((button) => button.addEventListener("click", () => addDesignerItem(button.dataset.designerAdd)));
  document.querySelector("#duplicateDesignerItem").addEventListener("click", duplicateDesignerItem);
  document.querySelector("#deleteDesignerItem").addEventListener("click", deleteDesignerItem);
  document.querySelector("#applyDesignerLayout").addEventListener("click", applyDesignerLayout);
  schemaSearch.addEventListener("input", () => renderSchemaTree(getDefinition()));
  schemaTree.addEventListener("click", handleSchemaTreeClick);
  designerCanvas.addEventListener("pointerdown", handleDesignerPointerDown);
  designerCanvas.addEventListener("pointermove", handleDesignerPointerMove);
  designerCanvas.addEventListener("pointerup", handleDesignerPointerUp);
  designerMapping.addEventListener("change", updateDesignerMapping);
  Object.values(designerPropertyInputs).forEach((input) => input.addEventListener("input", updateDesignerProperties));
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
  xmlProcedureMeta.textContent = definition.procedure
    ? `${definition.procedure} ${definition.procedureVersion || ""} / ${definition.rootElement} ${definition.version || ""}`
    : definition.rootElement;
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
  const previewDocument = createHtmlPreviewDocument(source, currentXml(definition), getFields(definition), state.values, definition.officialFieldSpec, definition.rootElement);
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
  renderDesigner(definition, page);
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

function getDesigner(definition = getDefinition(), page = definition.layout?.pages?.find((entry) => entry.number === state.activePage)) {
  if (!page) return null;
  const key = layoutSourceKey(definition, page);
  if (!state.designerLayouts.has(key)) state.designerLayouts.set(key, { items: [] });
  return state.designerLayouts.get(key);
}

function renderDesigner(definition = getDefinition(), page = definition.layout?.pages?.find((entry) => entry.number === state.activePage)) {
  const design = getDesigner(definition, page);
  if (!design) return;
  if (!design.items.some((item) => item.id === state.designerSelectedId)) state.designerSelectedId = "";
  designerCanvas.innerHTML = design.items.map((item) => {
    const selected = item.id === state.designerSelectedId ? " selected" : "";
    const mapped = item.fieldId ? getFields(definition).find((field) => field.id === item.fieldId) : null;
    const text = item.type === "field" ? (item.text || mapped?.label || "入力項目") : item.text;
    return `<div class="designer-item ${escapeHtml(item.type)}${selected}" data-designer-id="${escapeHtml(item.id)}" title="${escapeHtml(item.xmlPath || item.type)}" style="left:${designerNumber(item.x)}mm;top:${designerNumber(item.y)}mm;width:${designerNumber(item.width)}mm;height:${designerNumber(item.height)}mm;font-size:${designerNumber(item.fontSize)}pt">${escapeHtml(text)}<span class="resize-handle" data-designer-resize="true"></span></div>`;
  }).join("");
  renderSchemaTree(definition);
  renderDesignerProperties(definition);
}

function renderSchemaTree(definition = getDefinition()) {
  const query = schemaSearch.value.trim().toLowerCase();
  const selected = getDesigner()?.items.find((item) => item.id === state.designerSelectedId);
  const fields = getFields(definition).filter((field) => field.xmlPath && !field.xmlPath.startsWith("$control/"));
  const unique = new Map(fields.map((field) => [`${field.id}:${field.xmlPath}`, field]));
  schemaTree.innerHTML = [...unique.values()]
    .filter((field) => !query || `${field.label} ${field.xmlPath} ${field.tag || ""}`.toLowerCase().includes(query))
    .map((field) => {
      const depth = Math.max(0, field.xmlPath.split("/").length - 1);
      const mapped = selected?.fieldId === field.id ? " mapped" : "";
      return `<button type="button" class="schema-node${mapped}" role="treeitem" data-schema-field="${escapeHtml(field.id)}" style="padding-left:${6 + Math.min(depth, 6) * 8}px"><strong>${escapeHtml(field.tag || field.xmlPath.split("/").at(-1))}</strong><span>${escapeHtml(field.label)}</span><span>${escapeHtml(field.xmlPath)}</span></button>`;
    }).join("") || '<p class="schema-empty">該当項目がありません。</p>';
}

function renderDesignerProperties(definition = getDefinition()) {
  const selected = getDesigner(definition)?.items.find((item) => item.id === state.designerSelectedId);
  designerEmptySelection.hidden = Boolean(selected);
  designerPropertyFields.hidden = !selected;
  const fields = getFields(definition).filter((field) => field.xmlPath && !field.xmlPath.startsWith("$control/"));
  designerMapping.innerHTML = `<option value="">未割当</option>${fields.map((field) => `<option value="${escapeHtml(field.id)}">${escapeHtml(`${field.tag || ""} ${field.label}`.trim())}</option>`).join("")}`;
  if (!selected) return;
  designerPropertyInputs.text.value = selected.text || "";
  designerPropertyInputs.x.value = designerNumber(selected.x);
  designerPropertyInputs.y.value = designerNumber(selected.y);
  designerPropertyInputs.width.value = designerNumber(selected.width);
  designerPropertyInputs.height.value = designerNumber(selected.height);
  designerPropertyInputs.fontSize.value = designerNumber(selected.fontSize);
  designerMapping.value = selected.fieldId || "";
  const rules = selected.rules || {};
  designerPropertyInputs.calculation.value = rules.calculation || "";
  designerPropertyInputs.required.checked = Boolean(rules.required);
  designerPropertyInputs.min.value = rules.min ?? "";
  designerPropertyInputs.max.value = rules.max ?? "";
  designerPropertyInputs.pattern.value = rules.pattern || "";
  designerPropertyInputs.message.value = rules.message || "";
}

function addDesignerItem(type, mapping = null) {
  const design = getDesigner();
  if (!design) return;
  const item = createDesignerItem(type, design.items.length);
  if (mapping && type === "field") Object.assign(item, { fieldId: mapping.id, xmlPath: mapping.xmlPath, text: mapping.label });
  design.items.push(item);
  state.designerSelectedId = item.id;
  renderDesigner();
  setLayoutEditorStatus("デザイン未反映", "dirty");
}

function duplicateDesignerItem() {
  const design = getDesigner();
  const selected = design?.items.find((item) => item.id === state.designerSelectedId);
  if (!selected) return;
  const clone = cloneDesignerItem(selected);
  design.items.push(clone);
  state.designerSelectedId = clone.id;
  renderDesigner();
  setLayoutEditorStatus("デザイン未反映", "dirty");
}

function deleteDesignerItem() {
  const design = getDesigner();
  if (!design || !state.designerSelectedId) return;
  design.items = design.items.filter((item) => item.id !== state.designerSelectedId);
  state.designerSelectedId = "";
  renderDesigner();
  setLayoutEditorStatus("デザイン未反映", "dirty");
}

function handleSchemaTreeClick(event) {
  const button = event.target.closest("[data-schema-field]");
  if (!button) return;
  const field = getFields().find((entry) => entry.id === button.dataset.schemaField);
  if (!field) return;
  const selected = getDesigner()?.items.find((item) => item.id === state.designerSelectedId);
  if (!selected || selected.type !== "field") {
    addDesignerItem("field", field);
    return;
  }
  Object.assign(selected, { fieldId: field.id, xmlPath: field.xmlPath, text: field.label });
  renderDesigner();
  setLayoutEditorStatus("マッピング未反映", "dirty");
}

function updateDesignerMapping() {
  const selected = getDesigner()?.items.find((item) => item.id === state.designerSelectedId);
  if (!selected) return;
  const field = getFields().find((entry) => entry.id === designerMapping.value);
  selected.fieldId = field?.id || "";
  selected.xmlPath = field?.xmlPath || "";
  if (field && (!selected.text || selected.text === "入力項目")) selected.text = field.label;
  renderDesigner();
  setLayoutEditorStatus("マッピング未反映", "dirty");
}

function updateDesignerProperties() {
  const selected = getDesigner()?.items.find((item) => item.id === state.designerSelectedId);
  if (!selected) return;
  selected.text = designerPropertyInputs.text.value;
  selected.x = designerNumber(designerPropertyInputs.x.value);
  selected.y = designerNumber(designerPropertyInputs.y.value);
  selected.width = Math.max(.5, designerNumber(designerPropertyInputs.width.value));
  selected.height = Math.max(.5, designerNumber(designerPropertyInputs.height.value));
  selected.fontSize = Math.max(4, designerNumber(designerPropertyInputs.fontSize.value));
  selected.rules = {
    calculation: designerPropertyInputs.calculation.value.trim(),
    required: designerPropertyInputs.required.checked,
    min: designerPropertyInputs.min.value,
    max: designerPropertyInputs.max.value,
    pattern: designerPropertyInputs.pattern.value,
    message: designerPropertyInputs.message.value
  };
  const element = designerCanvas.querySelector(`[data-designer-id="${CSS.escape(selected.id)}"]`);
  if (element) {
    Object.assign(element.style, {
      left: `${selected.x}mm`, top: `${selected.y}mm`, width: `${selected.width}mm`, height: `${selected.height}mm`, fontSize: `${selected.fontSize}pt`
    });
    if (element.firstChild?.nodeType === Node.TEXT_NODE) element.firstChild.nodeValue = selected.text;
  }
  setLayoutEditorStatus("デザイン未反映", "dirty");
}

function handleDesignerPointerDown(event) {
  const element = event.target.closest("[data-designer-id]");
  if (!element) {
    state.designerSelectedId = "";
    renderDesigner();
    return;
  }
  const design = getDesigner();
  const item = design?.items.find((entry) => entry.id === element.dataset.designerId);
  if (!item) return;
  state.designerSelectedId = item.id;
  const rect = designerCanvas.getBoundingClientRect();
  state.designerDrag = {
    item,
    mode: event.target.dataset.designerResize ? "resize" : "move",
    startX: event.clientX,
    startY: event.clientY,
    original: { x: item.x, y: item.y, width: item.width, height: item.height },
    mmPerPixelX: 210 / rect.width,
    mmPerPixelY: 297 / rect.height
  };
  designerCanvas.setPointerCapture(event.pointerId);
  renderDesigner();
  event.preventDefault();
}

function handleDesignerPointerMove(event) {
  const drag = state.designerDrag;
  if (!drag) return;
  const dx = (event.clientX - drag.startX) * drag.mmPerPixelX;
  const dy = (event.clientY - drag.startY) * drag.mmPerPixelY;
  if (drag.mode === "resize") {
    drag.item.width = Math.max(.5, designerNumber(drag.original.width + dx));
    drag.item.height = Math.max(.5, designerNumber(drag.original.height + dy));
  } else {
    drag.item.x = Math.max(0, Math.min(210 - drag.item.width, designerNumber(drag.original.x + dx)));
    drag.item.y = Math.max(0, Math.min(297 - drag.item.height, designerNumber(drag.original.y + dy)));
  }
  const element = designerCanvas.querySelector(`[data-designer-id="${CSS.escape(drag.item.id)}"]`);
  if (element) Object.assign(element.style, { left: `${drag.item.x}mm`, top: `${drag.item.y}mm`, width: `${drag.item.width}mm`, height: `${drag.item.height}mm` });
  renderDesignerProperties();
  setLayoutEditorStatus("デザイン未反映", "dirty");
}

function handleDesignerPointerUp(event) {
  if (!state.designerDrag) return;
  state.designerDrag = null;
  if (designerCanvas.hasPointerCapture(event.pointerId)) designerCanvas.releasePointerCapture(event.pointerId);
}

function applyDesignerLayout() {
  const definition = getDefinition();
  const page = definition.layout?.pages?.find((entry) => entry.number === state.activePage);
  const design = getDesigner(definition, page);
  if (!page || !design) return;
  if (!design.items.length) {
    alert("文字、入力部品、罫線、枠のいずれかを配置してください。");
    return;
  }
  const source = compileDesignerTemplate(definition, page, design);
  state.layoutSources.set(layoutSourceKey(definition, page), source);
  layoutSource.value = source;
  renderOfficialPaper(definition);
  setLayoutEditorStatus("デザインを実行画面へ反映済み", "applied");
}

function designerNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : 0;
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

async function applyEditedXmlToForm() {
  const definition = getDefinition();
  if (!definition.officialFieldSpec) {
    alert("正式e-Tax XML帳票で利用してください。");
    return;
  }
  try {
    const xmlText = xmlPreview.textContent.trim();
    state.xsdValidation = { status: "checking", errors: [] };
    renderXsdValidation();
    const result = await requestXsdValidation(xmlText);
    state.xsdValidation = {
      status: result.valid ? "valid" : "invalid",
      errors: result.errors || [],
      schema: result.schema
    };
    renderXsdValidation();
    if (!result.valid) return;

    const form = result.forms?.[0]?.id || detectSupportedOfficialForm(xmlText);
    if (!form) throw new Error("XSDには適合しましたが、帳票要素がありません。CONTENTSへ対象帳票を追加してください。");
    if (form !== definition.rootElement) {
      if (form === "KOA020") await loadOfficialR07(xmlText, "XSD検証済み RKO0010 / KOA020 XML");
      else if (form === "KOZ280") await loadOfficialPko0420(xmlText, "XSD検証済み PKO0420 / KOZ280 XML");
      else throw new Error(`帳票 ${form} の画面定義は未対応です。`);
      state.xsdValidation = { status: "valid", errors: [], schema: result.schema };
      renderXsdValidation();
      return;
    }
    const values = extractOfficialR07Values(definition, xmlText);
    state.xmlText = xmlText;
    state.values = values;
    state.validation = [];
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
    const result = await requestXsdValidation(currentXml(getDefinition()));
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

async function requestXsdValidation(xmlText) {
  const response = await fetch("/api/validate", {
    method: "POST",
    headers: { "Content-Type": "application/xml; charset=UTF-8" },
    body: xmlText
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.errors?.[0] || "XSD検証サービスから応答がありません。");
  return result;
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
  if (getDefinition().rootElement === "KOZ280") {
    Object.assign(state.values, {
      pko_1_1: "5", pko_2_1: "8", pko_3_1: "1", pko_4_1: "麹町",
      pko_5_1: "5", pko_6_1: "8", pko_7_1: "7", pko_8_1: "14",
      pko_10_1: "100", pko_11_1: "0013", pko_12_1: "東京都千代田区霞が関1-1-1",
      pko_16_1: "ヤマダ タロウ", pko_17_1: "山田 太郎", pko_18_1: "会社員",
      pko_19_1: "03", pko_20_1: "1234", pko_21_1: "5678",
      pko_22_1: "5", pko_23_1: "8", pko_24_1: "300000", pko_25_1: "180000",
      pko_30_1: "5", pko_31_1: "8", pko_39_1: "1",
      pko_40_1: "業況の変化により、本年分の申告納税見積額が予定納税基準額を下回るため。",
      pko_42_1: "5", pko_43_1: "8", pko_47_1: "3200000", pko_107_1: "180000",
      pko_108_1: "90000", pko_109_1: "90000", pko_110_1: "1"
    });
  }
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
    const officialForm = file.name.toLowerCase().endsWith(".json") ? "" : detectSupportedOfficialForm(text);
    if (officialForm) return await openValidatedOfficialXml(text, file.name);
    const definition = file.name.toLowerCase().endsWith(".json") ? JSON.parse(text) : definitionFromXml(text);
    applyDefinition(definition, file.name);
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.value = "";
  }
}

async function openValidatedOfficialXml(xmlText, fileName) {
  state.xsdValidation = { status: "checking", errors: [] };
  renderXsdValidation();
  const result = await requestXsdValidation(xmlText);
  state.xsdValidation = { status: result.valid ? "valid" : "invalid", errors: result.errors || [], schema: result.schema };
  renderXsdValidation();
  if (!result.valid) throw new Error("XMLが公式XSDに適合しないため、帳票は生成しませんでした。検証結果を確認してください。");
  const form = result.forms?.[0]?.id || detectSupportedOfficialForm(xmlText);
  if (form === "KOA020") await loadOfficialR07(xmlText, fileName);
  else if (form === "KOZ280") await loadOfficialPko0420(xmlText, fileName);
  else throw new Error("XSDには適合しましたが、表示対象の帳票要素がありません。");
  state.xsdValidation = { status: "valid", errors: [], schema: result.schema };
  renderXsdValidation();
}

async function loadOfficialPko0420(instanceXml = "", fileName = "所得-申請 Ver21 / PKO0420 26.0.0 / KOZ280 21.0") {
  try {
    applyDefinition(createOfficialPko0420Definition(), fileName, instanceXml);
  } catch (error) {
    console.error(error);
    if (instanceXml) alert(error.message);
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
  state.designerLayouts = new Map();
  state.designerSelectedId = "";
  state.designerDrag = null;
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
