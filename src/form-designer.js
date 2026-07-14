const DEFAULTS = {
  text: { text: "見出し", x: 12, y: 12, width: 42, height: 7, fontSize: 10 },
  field: { text: "入力項目", x: 12, y: 24, width: 45, height: 8, fontSize: 10 },
  line: { text: "", x: 12, y: 38, width: 70, height: 1, fontSize: 10 },
  box: { text: "", x: 12, y: 48, width: 70, height: 22, fontSize: 10 }
};

export function createDesignerItem(type, index = 0) {
  const base = DEFAULTS[type] || DEFAULTS.field;
  return {
    id: `designer-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    ...base,
    x: base.x + (index % 5) * 3,
    y: base.y + (index % 5) * 3,
    fieldId: "",
    xmlPath: "",
    rules: { calculation: "", required: false, min: "", max: "", pattern: "", message: "" }
  };
}

export function cloneDesignerItem(item) {
  return {
    ...structuredClone(item),
    id: `designer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    x: round(item.x + 3),
    y: round(item.y + 3)
  };
}

export function compileDesignerTemplate(definition, page, design) {
  const items = design.items || [];
  const markup = items.map(renderItem).join("\n");
  const safeRules = JSON.stringify(items.filter((item) => item.type === "field" && item.fieldId).map((item) => ({
    fieldId: item.fieldId,
    rules: item.rules || {}
  }))).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${escapeHtml(page.label)}</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;background:#d7dde1;color:#172026;font-family:"Yu Gothic","Hiragino Kaku Gothic ProN",sans-serif}
    body{padding:12px}.designer-sheet{position:relative;width:210mm;height:297mm;margin:auto;overflow:hidden;background:#fff;box-shadow:0 3px 14px #0003}
    .compiled-item{position:absolute;display:flex;align-items:center;overflow:hidden;white-space:pre-wrap}.compiled-text{padding:.5mm}.compiled-field{border:.25mm solid #4d5960;background:#fffdf5;padding:.6mm}
    .compiled-field input{width:100%;height:100%;min-width:0;border:0;outline:0;background:#eef8ff;color:#07345a;padding:.5mm 1mm;font:inherit}.compiled-field input:focus{background:#fff3b8;box-shadow:inset 0 0 0 .3mm #bd7b00}
    .compiled-field.invalid{border-color:#b42318;background:#fff0ef}.compiled-field.invalid input{background:#fff0ef}.compiled-line{border-top:.35mm solid #172026}.compiled-box{border:.35mm solid #172026}
    .sheet-meta{position:absolute;right:4mm;bottom:2mm;color:#7a858b;font:6pt/1 monospace}
    @media(max-width:820px){body{padding:4px}.designer-sheet{zoom:calc((100vw - 8px)/794)}}
    @media print{@page{size:A4 portrait;margin:0}html,body{width:210mm;height:297mm;background:#fff}body{padding:0}.designer-sheet{box-shadow:none}.compiled-field input{background:#fff}.sheet-meta{display:none}}
  </style>
</head>
<body>
  <main class="designer-sheet">
${markup}
    <span class="sheet-meta">${escapeHtml(definition.procedure || definition.rootElement)} / ${escapeHtml(page.label)}</span>
  </main>
  <script>
    const designerRules=${safeRules};
    let applyingDesignerRules=false;
    const target=(id)=>document.querySelector('[data-etax-field="'+CSS.escape(id)+'"]');
    const number=(id)=>{const value=Number(String(target(id)?.value||"").replaceAll(",",""));return Number.isFinite(value)?value:0};
    const evaluate=(expression)=>{
      const source=String(expression||"").replace(/[A-Za-z_$][\\w$]*/g,(id)=>String(number(id)));
      if(!/^[0-9+\\-*/().%\\s]+$/.test(source))throw new Error("使用できない計算式です");
      return Function('"use strict";return ('+source+')')();
    };
    const applyRules=()=>{
      if(applyingDesignerRules)return;applyingDesignerRules=true;
      try{
        for(const entry of designerRules){
          const input=target(entry.fieldId);if(!input)continue;const rule=entry.rules||{};
          if(rule.calculation){try{const next=String(Math.trunc(evaluate(rule.calculation)));if(input.value!==next){input.value=next;input.dispatchEvent(new Event("input",{bubbles:true}))}}catch(error){input.title=error.message}}
          const value=input.value.trim();const numeric=Number(value);let message="";
          if(rule.required&&!value)message=rule.message||"必須項目です";
          else if(value&&rule.min!==""&&numeric<Number(rule.min))message=rule.message||"最小値を下回っています";
          else if(value&&rule.max!==""&&numeric>Number(rule.max))message=rule.message||"最大値を超えています";
          else if(value&&rule.pattern){try{if(!new RegExp(rule.pattern).test(value))message=rule.message||"入力形式が正しくありません"}catch{message="正規表現が不正です"}}
          input.closest(".compiled-field")?.classList.toggle("invalid",Boolean(message));input.setCustomValidity(message);if(message)input.title=message;
        }
      }finally{applyingDesignerRules=false}
    };
    document.addEventListener("etax:rendered",applyRules);
    document.addEventListener("input",()=>queueMicrotask(applyRules));
  </script>
</body>
</html>`;
}

function renderItem(item) {
  const style = `left:${number(item.x)}mm;top:${number(item.y)}mm;width:${number(item.width)}mm;height:${number(item.height)}mm;font-size:${number(item.fontSize)}pt`;
  if (item.type === "field") {
    const mapping = item.fieldId && item.xmlPath
      ? `<input type="text" aria-label="${escapeHtml(item.text || item.fieldId)}" data-etax-field="${escapeHtml(item.fieldId)}" data-etax-path="${escapeHtml(item.xmlPath)}">`
      : `<span>${escapeHtml(item.text || "未マッピング項目")}</span>`;
    return `    <label class="compiled-item compiled-field" style="${style}" title="${escapeHtml(item.xmlPath || "XML未割当")}">${mapping}</label>`;
  }
  if (item.type === "line") return `    <div class="compiled-item compiled-line" style="${style}"></div>`;
  if (item.type === "box") return `    <div class="compiled-item compiled-box" style="${style}"></div>`;
  return `    <div class="compiled-item compiled-text" style="${style}">${escapeHtml(item.text)}</div>`;
}

function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(0, round(parsed)) : 0; }
function round(value) { return Math.round(Number(value) * 10) / 10; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
