export function createDefaultHtmlTemplate(definition, page) {
  const sourcePage = page.number;
  const pageFields = definition.sections
    .map((section) => ({ ...section, fields: section.fields.filter((field) => field.page === sourcePage) }))
    .filter((section) => section.fields.length > 0);
  const identity = pageFields.find((section) => section.id === "identity");
  const content = pageFields.filter((section) => section.id !== "identity");
  const leftSections = content.filter((_, index) => index % 2 === 0);
  const rightSections = content.filter((_, index) => index % 2 === 1);

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(page.label)}</title>
  <style>
    :root { --ink:#171717; --line:#504535; --paper:#fffefa; --entry:#07345a; --accent:#087d68; }
    * { box-sizing:border-box; }
    html, body { margin:0; min-height:100%; background:#d8dde0; color:var(--ink); font-family:"Yu Gothic","Hiragino Kaku Gothic ProN",sans-serif; }
    body { padding:12px; }
    .sheet { width:100%; max-width:794px; min-height:calc((100vw - 24px) * 1.414); margin:0 auto; background:var(--paper); border:1px solid #5f574c; box-shadow:0 3px 14px #0002; padding:2.2%; }
    .sheet-header { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:end; border-bottom:2px solid var(--ink); padding-bottom:7px; }
    .sheet-header p { margin:0 0 3px; font-size:clamp(7px,1.2vw,11px); }
    .sheet-header h1 { margin:0; font-size:clamp(13px,2.2vw,22px); letter-spacing:.04em; }
    .page-name { display:flex; align-items:center; gap:6px; font-size:clamp(9px,1.5vw,14px); font-weight:800; }
    .copy-mark { border:2px solid #be3048; color:#be3048; padding:2px 5px; }
    .identity-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border-top:1px solid var(--line); border-left:1px solid var(--line); margin-top:8px; }
    .identity-cell { min-width:0; border-right:1px solid var(--line); border-bottom:1px solid var(--line); padding:3px 4px; }
    .identity-cell.wide { grid-column:span 2; }
    .identity-cell label { display:block; color:#4c4338; font-size:clamp(5px,.85vw,8px); }
    .etax-input { display:block; width:100%; min-width:0; min-height:1.35em; border:0; border-radius:2px; outline:0; background:#eef8ff; color:var(--entry); padding:1px 4px; font:700 clamp(7px,1.1vw,11px)/1.3 inherit; white-space:nowrap; text-align:right; }
    .etax-input:hover { background:#e1f3ff; }
    .etax-input:focus { background:#fff7cf; box-shadow:inset 0 0 0 1.5px #d99a00; }
    .identity-cell .etax-input { margin-top:2px; text-align:left; }
    .sheet-columns { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; align-items:start; }
    .form-section { border:1px solid var(--line); margin-bottom:7px; }
    .form-section h2 { margin:0; background:#e5f3ee; border-bottom:1px solid var(--line); padding:3px 5px; color:#075b4d; font-size:clamp(7px,1.05vw,10px); }
    .field-row { display:grid; grid-template-columns:24px minmax(0,1fr) minmax(72px,42%); min-height:18px; border-bottom:1px solid #b7aa96; align-items:stretch; }
    .field-row:last-child { border-bottom:0; }
    .field-no { display:grid; place-items:center; border-right:1px solid #b7aa96; color:#665c50; font-size:clamp(5px,.8vw,8px); }
    .field-label { display:flex; align-items:center; min-width:0; border-right:1px solid #b7aa96; padding:2px 4px; font-size:clamp(5px,.85vw,8px); line-height:1.15; }
    .field-row .etax-input { align-self:stretch; letter-spacing:.06em; }
    .details-only { grid-column:1 / -1; }
    .runtime-note { margin:8px 0 0; color:#667078; font-size:7px; text-align:right; }
    @media (max-width:560px) { body { padding:5px; } .sheet { min-height:calc((100vw - 10px) * 1.414); padding:1.5%; } .sheet-columns { gap:4px; } .field-row { grid-template-columns:17px minmax(0,1fr) minmax(48px,40%); min-height:14px; } }
    @media print { @page { size:A4 portrait; margin:0; } html,body { width:210mm; min-height:297mm; background:#fff; } body { padding:0; } .sheet { width:210mm; max-width:none; min-height:297mm; border:0; box-shadow:none; padding:5mm; } .etax-input { background:transparent !important; box-shadow:none !important; } .runtime-note { display:none; } }
  </style>
</head>
<body>
  <main class="sheet">
    <header class="sheet-header">
      <div>
        <p>令和7年分</p>
        <h1>所得税及び復興特別所得税の申告書</h1>
      </div>
      <div class="page-name">${escapeHtml(page.label)}</div>
    </header>
    ${identity ? renderIdentity(identity.fields) : ""}
    <div class="sheet-columns">
      <div${rightSections.length ? "" : ' class="details-only"'}>${leftSections.map(renderSection).join("\n")}</div>
      ${rightSections.length ? `<div>${rightSections.map(renderSection).join("\n")}</div>` : ""}
    </div>
    <p class="runtime-note">水色の欄へ直接入力できます。入力値はe-Tax XMLへ同期されます。</p>
  </main>
  <script>
    // e-Tax XMLの反映後に追加の表示加工を行えます。
    document.addEventListener("etax:rendered", () => {
      document.querySelectorAll(".field-row .etax-input").forEach((input) => {
        if (input.value.startsWith("-")) input.style.color = "#b42318";
      });
    });
  </script>
</body>
</html>`;
}

export function createHtmlPreviewDocument(source, xmlText, fields = [], values = {}) {
  const runtime = runtimeScript(xmlText, fields, values);
  const csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; img-src data:;">';
  let documentSource = source.includes("<head>") ? source.replace("<head>", `<head>\n  ${csp}`) : `${csp}\n${source}`;
  documentSource = documentSource.includes("</body>")
    ? documentSource.replace("</body>", `${runtime}\n</body>`)
    : `${documentSource}\n${runtime}`;
  return documentSource;
}

function renderIdentity(fields) {
  return `<section class="identity-grid">
${fields.map((field) => `      <div class="identity-cell${["address", "januaryAddress", "taxpayerName"].includes(field.id) ? " wide" : ""}">
        <label>${escapeHtml(field.label)}</label>
        ${renderInput(field)}
      </div>`).join("\n")}
    </section>`;
}

function renderSection(section) {
  return `<section class="form-section">
        <h2>${escapeHtml(section.label)}</h2>
${section.fields.map((field, index) => `        <div class="field-row">
          <span class="field-no">${index + 1}</span>
          <span class="field-label">${escapeHtml(field.label)}</span>
          ${renderInput(field)}
        </div>`).join("\n")}
      </section>`;
}

function renderInput(field) {
  const numeric = field.type === "number" ? ' inputmode="numeric"' : "";
  return `<input class="etax-input" type="text"${numeric} aria-label="${escapeHtml(field.label)}" data-etax-field="${escapeHtml(field.id)}" data-etax-path="${escapeHtml(field.xmlPath)}">`;
}

function runtimeScript(xmlText, fields, values) {
  const safeXml = JSON.stringify(xmlText).replaceAll("<", "\\u003c");
  const safeFields = JSON.stringify(fields.map(({ id, xmlPath, type, label }) => ({ id, xmlPath, type, label }))).replaceAll("<", "\\u003c");
  const safeValues = JSON.stringify(values).replaceAll("<", "\\u003c");
  return `<script>
  (() => {
    const xmlText = ${safeXml};
    const fields = ${safeFields};
    const values = ${safeValues};
    const fieldById = new Map(fields.map((field) => [field.id, field]));
    const fieldByPath = new Map(fields.map((field) => [field.xmlPath, field]));
    const xml = new DOMParser().parseFromString(xmlText, "application/xml");
    const elements = Array.from(xml.getElementsByTagName("*"));
    const ids = new Map(elements.map((element) => [element.getAttribute("ID"), element]).filter(([id]) => id));
    const children = (element) => Object.fromEntries(Array.from(element.children).map((child) => [child.localName, child.textContent.trim()]));
    const format = (element) => {
      const value = children(element);
      if (element.localName === "ZEIMUSHO") return value.zeimusho_NM || value.zeimusho_CD || "";
      if (["TEISYUTSU_DAY", "BIRTHDAY"].includes(element.localName)) {
        const era = {1:"明治",2:"大正",3:"昭和",4:"平成",5:"令和"}[value.era] || "";
        return value.yy ? era + value.yy + "年" + (value.mm || "") + "月" + (value.dd || "") + "日" : "";
      }
      if (element.localName === "NENBUN") return value.yy || "";
      if (element.localName === "NOZEISHA_ZIP") return [value.zip1, value.zip2].filter(Boolean).join("-");
      if (element.localName === "NOZEISHA_BANGO") return value.kojinbango || value.hojinbango || "";
      if (element.localName === "NOZEISHA_TEL") return [value.tel1, value.tel2, value.tel3].filter(Boolean).join("-");
      return element.children.length ? element.textContent.trim() : element.textContent.trim();
    };
    const find = (path) => {
      const name = String(path || "").split("/").filter(Boolean).at(-1);
      const element = elements.find((candidate) => candidate.localName === name);
      if (!element) return null;
      return element.getAttribute("IDREF") ? ids.get(element.getAttribute("IDREF")) || null : element;
    };
    window.etax = {
      xml: xmlText,
      document: xml,
      value(path) { const element = find(path); return element ? format(element) : ""; },
      update(fieldId, value) {
        parent.postMessage({ type: "etax-field-change", fieldId, value: String(value ?? "") }, "*");
      }
    };
    document.querySelectorAll("[data-etax-path]").forEach((target) => {
      const field = fieldById.get(target.dataset.etaxField) || fieldByPath.get(target.dataset.etaxPath);
      const fieldId = field?.id || target.dataset.etaxField;
      const rawValue = fieldId && Object.hasOwn(values, fieldId) ? String(values[fieldId] ?? "") : window.etax.value(target.dataset.etaxPath);
      target.title = target.dataset.etaxPath;
      if (target.matches("input, textarea, select")) {
        target.value = rawValue;
      } else {
        target.textContent = rawValue;
        target.contentEditable = "true";
        target.setAttribute("role", "textbox");
        target.spellcheck = false;
      }
      target.addEventListener("input", () => {
        if (!fieldId) return;
        const nextValue = target.matches("input, textarea, select") ? target.value : target.textContent;
        window.etax.update(fieldId, nextValue);
      });
    });
    window.addEventListener("message", (event) => {
      if (event.data?.type === "etax-print") window.print();
      if (event.data?.type === "etax-values") {
        Object.entries(event.data.values || {}).forEach(([fieldId, value]) => {
          const target = document.querySelector('[data-etax-field="' + CSS.escape(fieldId) + '"]');
          if (target) target.value = String(value ?? "");
        });
      }
    });
    document.dispatchEvent(new CustomEvent("etax:rendered", { detail: { xml, etax: window.etax } }));
  })();
<\/script>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
