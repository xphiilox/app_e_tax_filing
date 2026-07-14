export function createDefaultHtmlTemplate(definition, page) {
  if (definition.officialFieldSpec && page.number === 1) return createOfficialFirstForm(definition, page);
  if (definition.officialFieldSpec && page.number === 2) return createOfficialSecondForm(definition, page);
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

function createOfficialFirstForm(definition, page) {
  const fields = officialPageFields(definition, 1);
  const rows = {
    revenue: [
      [38, 39, "事業　営業等", "ア"], [40, 41, "事業　農業", "イ"], [42, 43, 44, "不動産", "ウ"],
      [45, "配当", "エ"], [46, 47, "給与", "オ"], [48, "公的年金等", "カ"],
      [49, 50, "雑　業務", "キ"], [51, 52, "雑　その他", "ク"], [53, "総合譲渡　短期", "ケ"],
      [54, "総合譲渡　長期", "コ"], [55, "一時", "サ"]
    ],
    income: [
      [56, "事業　営業等", "1"], [57, "事業　農業", "2"], [58, 59, "不動産", "3"], [60, "利子", "4"],
      [61, "配当", "5"], [62, 63, "給与", "6"], [64, "公的年金等", "7"], [65, "雑　業務", "8"],
      [66, "雑　その他", "9"], [67, "⑦から⑨までの計", "10"], [68, "総合譲渡・一時", "11"], [69, "合計", "12"]
    ],
    deduction: [
      [70, "社会保険料控除", "13"], [71, 72, "医療費控除", "14"], [73, "社会保険料控除", "15"],
      [74, "小規模企業共済等掛金控除", "16"], [75, "生命保険料控除", "17"], [76, "地震保険料控除", "18"],
      [77, "寄附金控除", "19"], [78, 79, "寡婦、ひとり親控除", "20"], [80, "勤労学生、障害者控除", "21"],
      [81, 82, 83, "配偶者（特別）控除", "22"], [84, 85, "扶養控除", "23"], [86, 87, 88, "特定親族特別控除", "24"],
      [89, "基礎控除", "25"], [90, "⑬から㉕までの計", "26"], [91, "合計", "30"]
    ],
    tax: [
      [92, "課税される所得金額", "31"], [93, "上の㉛に対する税額", "32"], [94, "配当控除", "33"],
      [95, 96, 97, "その他の税額控除", "34"], [98, 99, 100, "住宅借入金等特別控除", "35"],
      [101, "政党等寄附金等特別控除", "36～38"], [102, 103, "住宅耐震改修特別控除等", "39～41"],
      [104, "差引所得税額", "42"], [106, "災害減免額", "43"], [107, "再差引所得税額", "44"],
      [108, "復興特別所得税額", "45"], [109, "所得税及び復興特別所得税の額", "46"],
      [105, 110, "外国税額控除等", "47～48"], [111, "源泉徴収税額", "49"], [112, "申告納税額", "50"],
      [113, "予定納税額", "51"], [114, "第3期分の税額　納める税金", "52"], [115, "第3期分の税額　還付される税金", "53"],
      [116, "修正前の第3期分の税額", "54"], [117, "第3期分の税額の増加額", "55"]
    ],
    other: [
      [118, "公的年金等以外の合計所得金額", "56"], [119, "配偶者の合計所得金額", "57"],
      [120, "専従者給与（控除）額の合計額", "58"], [121, "青色申告特別控除額", "59"],
      [122, "雑所得・一時所得等の源泉徴収税額の合計額", "60"], [123, "未納付の源泉徴収税額", "61"],
      [124, "本年分で差し引く繰越損失額", "62"], [125, "平均課税対象金額", "63"],
      [126, 127, "変動・臨時所得金額", "64"], [128, "申告期限までに納付する金額", "65"], [129, "延納届出額", "66"]
    ]
  };
  const body = `
  <main class="nta-sheet first-form">
    ${officialHeader(fields, false)}
    <section class="identity-form">
      <div class="identity-row identity-top">
        ${officialFieldBlock("納税地", fields, [10, 11], "postal")}
        ${officialFieldBlock("個人番号（マイナンバー）", fields, [17], "number-id")}
        ${officialFieldBlock("生年月日", fields, [24, 25, 26, 27], "birth")}
      </div>
      <div class="identity-row identity-main">
        ${officialFieldBlock("現在の住所又は居所・事業所等", fields, [12, 13], "address")}
        <div class="person-stack">
          ${officialFieldBlock("フリガナ", fields, [18], "kana")}
          ${officialFieldBlock("氏名", fields, [19], "name")}
        </div>
      </div>
      <div class="identity-row identity-bottom">
        ${officialFieldBlock("令和8年1月1日の住所", fields, [14, 15, 16], "january")}
        ${officialFieldBlock("職業", fields, [20], "job")}
        ${officialFieldBlock("屋号・雅号", fields, [21], "trade")}
        ${officialFieldBlock("世帯主の氏名", fields, [22], "householder")}
        ${officialFieldBlock("世帯主との続柄", fields, [23], "relation")}
      </div>
      <div class="identity-row flags-row">
        <span class="flags-title">振替継続希望</span>
        ${flagField(fields, 9, "納税地")}${flagField(fields, 31, "種類")}${flagField(fields, 32, "青色")}${flagField(fields, 33, "分離")}
        ${flagField(fields, 34, "国外")}${flagField(fields, 35, "損失")}${flagField(fields, 36, "修正")}${flagField(fields, 37, "特農")}
        ${officialFieldBlock("整理番号", fields, [], "serial")}
        ${officialFieldBlock("電話番号", fields, [28, 29, 30], "phone")}
      </div>
    </section>
    <section class="first-columns">
      <div class="form-column left-column">
        ${officialBand("収入金額等", "green", rows.revenue, fields)}
        ${officialBand("所得金額等", "blue", rows.income, fields)}
        ${officialBand("所得から差し引かれる金額", "red", rows.deduction, fields)}
      </div>
      <div class="form-column right-column">
        ${officialBand("税金の計算", "purple", rows.tax, fields)}
        ${officialBand("その他", "pink", rows.other, fields)}
        <section class="refund-box">
          <h2>還付される税金の受取場所</h2>
          <div class="refund-grid">${renderItems(fields, [130,131,132,133,134,135,136])}</div>
          <div class="consent-row"><span>公金受取口座登録の同意</span>${renderItems(fields,[137,138,139,140,141])}</div>
        </section>
        ${officialFooter(fields)}
      </div>
    </section>
    <p class="paper-guidance">○ この申告書を提出される方は、住民税・事業税の申告書を提出する必要はありません。</p>
    ${technicalControls(definition)}
  </main>`;
  return officialDocument(page.label, body);
}

function createOfficialSecondForm(definition, page) {
  const fields = officialPageFields(definition, 2);
  const body = `
  <main class="nta-sheet second-form">
    ${officialHeader(fields, true)}
    <section class="second-columns">
      <div class="second-left">
        <section class="address-card">
          <div class="address-lines"><b>住所</b>${renderItems(fields,[145,146])}</div>
          <div class="address-lines"><b>屋号</b>${renderItems(fields,[147])}</div>
          <div class="address-lines"><b>フリガナ<br>氏名</b>${renderItems(fields,[148,149])}</div>
        </section>
        ${secondTable("所得の内訳（所得税及び復興特別所得税の源泉徴収税額）", fields, 150, 158, "income-detail")}
        ${secondTable("総合課税の譲渡所得、一時所得に関する事項", fields, 159, 164, "transfer-detail")}
      </div>
      <div class="second-right">
        ${secondTable("社会保険料控除・小規模企業共済等掛金控除", fields, 184, 186, "insurance-table")}
        ${secondTable("生命保険料控除", fields, 187, 196, "insurance-table tall")}
        ${secondTable("地震保険料控除", fields, 197, 200, "insurance-table")}
        <section class="choice-strip"><b>本人に関する事項</b>${renderItems(fields,[204,205,206,207,208,209,210])}</section>
        ${secondTable("雑損控除に関する事項", fields, 175, 183, "damage-table")}
        ${secondTable("寄附金控除に関する事項", fields, 201, 203, "donation-table")}
        ${secondTable("特例適用条文等", fields, 174, 174, "law-table")}
      </div>
    </section>
    ${secondTable("配偶者や親族に関する事項", fields, 211, 240, "wide-table relatives")}
    ${secondTable("事業専従者に関する事項", fields, 165, 173, "wide-table workers")}
    ${secondTable("住民税・事業税に関する事項", fields, 241, 276, "wide-table resident-tax")}
    <section class="second-footer">
      <div class="organize-box">${renderItems(fields,[277,278])}</div>
      <div class="accountant-box"><b>税理士署名・電話番号</b>${renderItems(fields,[279,280,281,282])}</div>
    </section>
  </main>`;
  return officialDocument(page.label, body);
}

function officialDocument(title, body) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(title)}</title><style>${officialCss()}</style></head><body>${body}
<script>document.addEventListener("etax:rendered",()=>{document.querySelectorAll(".nta-input").forEach((input)=>{if(input.value.startsWith("-"))input.classList.add("negative")})});</script>
</body></html>`;
}

function officialCss() {
  return `
  :root{--black:#211d1e;--orange:#f2a24b;--green:#218b43;--blue:#1e9dca;--red:#be1648;--purple:#4d347f;--pink:#df4c93;--paper:#fff}
  *{box-sizing:border-box}html,body{margin:0;background:#d8dde0;color:var(--black);font-family:"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif}
  body{padding:12px}.nta-sheet{position:relative;width:794px;height:1123px;margin:auto;overflow:hidden;background:var(--paper);box-shadow:0 2px 12px #0003;padding:22px 36px 18px;font-size:9px;line-height:1.08}
  .nta-header{height:50px;display:grid;grid-template-columns:150px 1fr 132px;align-items:end;gap:8px}.submitted{display:flex;align-items:end;gap:1px;font-size:8px;border-bottom:1px solid;padding-bottom:4px}.submitted .nta-input{width:22px;height:16px;border-width:0 0 1px}.submitted .nta-input:first-child{width:52px}.submitted span{white-space:nowrap}.nta-title{display:flex;align-items:end;justify-content:center;gap:5px;white-space:nowrap;font-weight:800}.nta-title .reiwa{font-size:22px}.nta-title .year-box{position:relative;display:inline-flex;width:43px;height:28px;border:1px solid;font-size:22px}.nta-title .year-box i{display:grid;width:20px;place-items:center;font-style:normal}.nta-title .year-box>.nta-input{width:22px;height:26px;border-width:0 0 0 1px;font:700 18px/1 monospace;text-align:center;padding:0}.year-era-hidden,.nta-title>.nta-input{display:none}.nta-title .tax-name{font-size:8px;line-height:1.05}.nta-title .form-name{font-size:22px;margin-left:9px}.form-code{align-self:center;border:2px solid;padding:7px 9px;font:15px/1 monospace;letter-spacing:6px;text-align:center}.side-title{position:absolute;right:10px;top:60px;writing-mode:vertical-rl;font-size:16px;font-weight:800}.side-title em{color:#ed0873;font-style:normal;margin-top:8px}
  .identity-form{border:2px solid;margin-top:4px}.identity-row{display:grid;border-bottom:1px solid}.identity-row:last-child{border:0}.identity-top{grid-template-columns:2fr 2fr 1.35fr;height:28px}.identity-main{grid-template-columns:1.12fr .88fr;height:59px}.identity-bottom{grid-template-columns:2.2fr .8fr 1.05fr 1.05fr .55fr;height:27px}.official-field{display:grid;grid-template-columns:auto 1fr;min-width:0;border-right:1px solid}.official-field:last-child{border-right:0}.official-field>label{display:flex;align-items:center;padding:2px 4px;font-weight:700;white-space:normal}.official-field-inputs{display:flex;align-items:stretch;min-width:0;gap:1px;padding:2px}.person-stack{display:grid;grid-template-rows:1fr 1.55fr}.person-stack .official-field:first-child{border-bottom:1px solid}.flags-row{height:27px;grid-template-columns:90px repeat(8,29px) 78px 1fr}.flags-title,.flag-field{display:flex;align-items:center;justify-content:center;border-right:1px solid}.flag-field{gap:1px;color:#e18c34;font-weight:700;font-size:7px}.flag-field .nta-input{width:13px}.nta-input{display:block;min-width:0;width:100%;height:100%;border:1px solid var(--orange);border-radius:0;outline:0;background:#fffdf7;color:#17354e;padding:1px 3px;font:700 9px/1.05 "Yu Gothic",sans-serif;text-align:right}.nta-input:focus{background:#fff2a9;box-shadow:inset 0 0 0 1px #bb7600}.nta-input.negative{color:#b42318}.postal .nta-input,.number-id .nta-input,.birth .nta-input,.phone .nta-input{letter-spacing:2px}.address .nta-input,.kana .nta-input,.name .nta-input{text-align:left}.identity-main .official-field-inputs{padding:3px}.identity-main .nta-input{font-size:11px}
  .first-columns{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:3px}.form-column{min-width:0}.official-band{position:relative;border:2px solid;border-left:26px solid;margin-bottom:0}.official-band h2{position:absolute;left:-24px;top:0;bottom:0;margin:0;width:22px;display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;color:#fff;font-size:16px;letter-spacing:5px}.official-band.green{border-left-color:var(--green)}.official-band.blue{border-left-color:var(--blue)}.official-band.red{border-left-color:var(--red)}.official-band.purple{border-left-color:var(--purple)}.official-band.pink{border-left-color:var(--pink)}.official-row{display:grid;grid-template-columns:minmax(0,1fr) 32px minmax(118px,1.25fr);min-height:20px;border-bottom:1px solid}.official-row:last-child{border-bottom:0}.official-row-label{display:flex;align-items:center;padding:1px 5px;font-weight:700;font-size:9px}.official-row-no{display:flex;align-items:center;justify-content:center;border-left:1px solid;border-right:1px solid;font-size:10px}.official-row-inputs{display:flex;gap:1px;padding:1px}.official-row-inputs .nta-input{font-size:10px;background-color:#fffdf7;background-image:repeating-linear-gradient(90deg,transparent 0,transparent 22px,#efb26f 22px,#efb26f 23px)}.left-column .official-band.green .official-row,.left-column .official-band.blue .official-row{min-height:21px}.left-column .official-band.red .official-row{min-height:20px}.right-column .official-row{min-height:20px}.right-column .official-row-label{font-size:8px}.refund-box{border:2px solid;margin-top:3px}.refund-box h2{margin:0;padding:2px 4px;border-bottom:1px solid;font-size:9px}.refund-grid{display:grid;grid-template-columns:repeat(4,1fr);min-height:46px}.refund-grid .nta-input{border-width:0 1px 1px 0}.consent-row{display:flex;align-items:center;border-top:1px solid;min-height:20px}.consent-row span{padding:2px 5px;white-space:nowrap}.consent-row .nta-input{width:22px;height:16px;margin:1px}.official-footer{display:grid;grid-template-columns:1fr 58px;border:1px solid;margin-top:3px;min-height:63px}.organizer-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:1px;padding:3px}.organizer-grid span{border:1px solid #d3b080;display:grid;place-items:center;color:#d28c3a;font-size:8px}.confirm-box{border-left:1px solid;display:grid;place-items:center;writing-mode:vertical-rl;font-size:8px}.paper-guidance{margin:4px 0 0;font-size:8px}.technical-data{display:none}
  .second-columns{display:grid;grid-template-columns:1fr 1fr;gap:8px}.address-card{height:216px;border:2px solid;padding:70px 8px 8px}.address-lines{display:grid;grid-template-columns:55px 1fr;align-items:center;margin-bottom:6px}.address-lines .nta-input{height:22px;border-width:0 0 1px;border-color:#333;text-align:left}.second-table{border:2px solid;margin-top:8px}.second-table h2{position:relative;margin:-15px 0 2px -2px;font-size:10px;background:white;width:max-content;padding-right:5px}.second-table-grid{display:grid;grid-template-columns:repeat(4,1fr)}.second-table-grid .field-wrap{min-width:0;border-right:1px solid;border-bottom:1px solid;padding:1px;min-height:25px}.second-table-grid .field-wrap label{display:block;height:11px;overflow:hidden;font-size:7px}.second-table-grid .nta-input{height:15px}.income-detail{min-height:174px}.transfer-detail{min-height:67px}.insurance-table{min-height:90px}.insurance-table.tall{min-height:128px}.choice-strip{display:flex;align-items:center;border:2px solid;margin-top:4px;min-height:48px}.choice-strip b{padding:3px}.choice-strip .nta-input{width:26px;height:20px}.damage-table{min-height:72px}.donation-table{min-height:55px}.law-table{min-height:36px}.wide-table{margin-top:14px}.wide-table .second-table-grid{grid-template-columns:repeat(8,1fr)}.wide-table .field-wrap{min-height:29px}.relatives{min-height:144px}.workers{min-height:68px}.resident-tax{min-height:150px}.second-footer{display:grid;grid-template-columns:1.1fr .9fr;gap:8px;margin-top:8px}.organize-box,.accountant-box{display:flex;border:1px solid;min-height:50px;padding:3px}.organize-box .nta-input,.accountant-box .nta-input{height:24px}.accountant-box{align-items:center}.accountant-box b{white-space:nowrap;margin-right:4px}
  @media(max-width:820px){body{padding:4px}.nta-sheet{transform-origin:top left;width:794px}.nta-sheet{zoom:calc((100vw - 8px)/794)}}
  @media print{@page{size:210mm 297mm;margin:0}html,body{width:210mm;height:297mm;background:#fff}body{padding:0}.nta-sheet{width:210mm;height:297mm;box-shadow:none;padding:5.8mm 9.5mm 4.8mm}.nta-input{background:#fff!important;color:#111}.technical-data{display:none}}
  `;
}

function officialHeader(fields, second) {
  const yearItems = second ? [142,143] : [1,2];
  const filingItems = second ? [144] : [3];
  const submittedItems = second ? [] : [4,5,6,7,8];
  const yearFields = fieldsForItems(fields, yearItems);
  const eraField = yearFields.find((field) => field.component === "era");
  const yearField = yearFields.find((field) => field.component === "yy");
  return `<header class="nta-header"><div class="submitted">${second ? "" : renderItems(fields,submittedItems)}<span>税務署長</span></div><div class="nta-title"><span class="reiwa">令和</span><span class="year-box"><i>0</i>${yearField ? renderOfficialInput(yearField) : ""}${eraField ? `<span class="year-era-hidden">${renderOfficialInput(eraField)}</span>` : ""}</span><span class="reiwa">年分の</span><span class="tax-name">所得税及び<br>復興特別所得税の</span><span class="form-name">申告書</span>${renderItems(fields,filingItems)}</div><div class="form-code">FA${second ? "2305" : "2205"}</div></header><div class="side-title">第${second ? "二" : "一"}表<em>（令和七年分用）</em></div>`;
}

function officialPageFields(definition, page) {
  return definition.sections.flatMap((section) => section.fields).filter((field) => field.page === page && field.item).sort((a,b) => a.item - b.item || a.occurrence - b.occurrence);
}

function itemsFromRow(row) { return row.filter((value) => Number.isInteger(value)); }
function rowLabel(row) { return row.find((value, index) => typeof value === "string" && index < row.length - 1) || ""; }
function rowNumber(row) { return [...row].reverse().find((value) => typeof value === "string") || ""; }
function fieldsForItems(fields, items) { const set = new Set(items); return fields.filter((field) => set.has(field.item)); }

function officialBand(title, color, rows, fields) {
  return `<section class="official-band ${color}"><h2>${escapeHtml(title)}</h2>${rows.map((row) => `<div class="official-row"><div class="official-row-label">${escapeHtml(rowLabel(row))}</div><div class="official-row-no">${escapeHtml(rowNumber(row))}</div><div class="official-row-inputs">${renderFieldInputs(fieldsForItems(fields,itemsFromRow(row)))}</div></div>`).join("")}</section>`;
}

function officialFieldBlock(label, fields, items, className="") {
  return `<div class="official-field ${className}"><label>${escapeHtml(label)}</label><div class="official-field-inputs">${renderFieldInputs(fieldsForItems(fields,items))}</div></div>`;
}

function flagField(fields, item, label) { return `<label class="flag-field">${escapeHtml(label)}${renderFieldInputs(fieldsForItems(fields,[item]))}</label>`; }

function renderFieldInputs(fields) { return fields.map((field) => renderOfficialInput(field)).join(""); }
function renderItems(fields, items) { return renderFieldInputs(fieldsForItems(fields,items)); }

function renderOfficialInput(field) {
  const numeric = field.type === "number" ? ' inputmode="numeric"' : "";
  return `<input class="nta-input" type="text"${numeric} aria-label="${escapeHtml(field.label)}" data-etax-field="${escapeHtml(field.id)}" data-etax-path="${escapeHtml(field.xmlPath)}">`;
}

function officialFooter(fields) {
  return `<section class="official-footer"><div class="organizer-grid">${"ABCDEFGHIJKL".split("").map((c)=>`<span>${c}</span>`).join("")}</div><div class="confirm-box">整理欄・確認</div></section>`;
}

function technicalControls(definition) {
  const fields = definition.sections.flatMap((section)=>section.fields).filter((field)=>!field.item && field.page===1);
  return `<section class="technical-data" aria-hidden="true">${renderFieldInputs(fields)}</section>`;
}

function secondTable(title, fields, start, end, className="") {
  const selected = fields.filter((field)=>field.item>=start&&field.item<=end);
  return `<section class="second-table ${className}"><h2>○ ${escapeHtml(title)}</h2><div class="second-table-grid">${selected.map((field)=>`<label class="field-wrap"><span>${escapeHtml(field.name||field.label)}</span>${renderOfficialInput(field)}</label>`).join("")}</div></section>`;
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
