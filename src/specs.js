export const officialSpecs = [
  {
    item: 9,
    taxType: "income",
    label: "所得税",
    name: "XML構造設計書及び帳票フィールド仕様書【所得税関係】",
    href: "https://www.e-tax.nta.go.jp/shiyo/download/e-tax09.CAB",
    updatedAt: "令和7年10月30日",
    size: "約8.1MB"
  },
  {
    item: 10,
    taxType: "corporate",
    label: "法人税",
    name: "XML構造設計書及び帳票フィールド仕様書【法人税関係】",
    href: "https://www.e-tax.nta.go.jp/shiyo/download/e-tax10.CAB",
    updatedAt: "令和8年5月1日",
    size: "約30.1MB"
  },
  {
    item: 11,
    taxType: "consumption",
    label: "消費税",
    name: "XML構造設計書及び帳票フィールド仕様書【消費税関係】",
    href: "https://www.e-tax.nta.go.jp/shiyo/download/e-tax11.CAB",
    updatedAt: "令和6年10月31日",
    size: "約2.0MB"
  },
  {
    item: 12,
    taxType: "asset",
    label: "資産税",
    name: "XML構造設計書及び帳票フィールド仕様書【資産税関係】",
    href: "https://www.e-tax.nta.go.jp/shiyo/download/e-tax12.CAB",
    updatedAt: "令和7年10月30日",
    size: "約2.5MB"
  },
  {
    item: 13,
    taxType: "withholding",
    label: "源泉所得税",
    name: "XML構造設計書及び帳票フィールド仕様書【源泉所得税関係】",
    href: "https://www.e-tax.nta.go.jp/shiyo/download/e-tax13.CAB",
    updatedAt: "令和6年5月13日",
    size: "約511KB"
  }
];

const commonTaxpayer = [
  { id: "taxpayerName", label: "納税者名", xmlPath: "Taxpayer/Name", type: "text", required: true },
  { id: "taxpayerKana", label: "フリガナ", xmlPath: "Taxpayer/Kana", type: "text" },
  { id: "taxpayerId", label: "利用者識別番号", xmlPath: "Taxpayer/UserId", type: "text", pattern: "^\\d{16}$", hint: "16桁の数字" },
  { id: "address", label: "住所", xmlPath: "Taxpayer/Address", type: "text", required: true },
  { id: "phone", label: "電話番号", xmlPath: "Taxpayer/Phone", type: "text" }
];

const filingBase = [
  { id: "filingYear", label: "申告年分", xmlPath: "Filing/Year", type: "number", required: true, value: "2026" },
  { id: "taxOffice", label: "提出先税務署", xmlPath: "Filing/TaxOffice", type: "text", required: true },
  { id: "filingDate", label: "提出日", xmlPath: "Filing/Date", type: "date", required: true }
];

export const formDefinitions = {
  income: {
    taxType: "income",
    title: "所得税 確定申告書",
    rootElement: "IncomeTaxReturn",
    namespace: "urn:etax:prototype:income-tax:r8",
    sections: [
      { id: "basic", label: "基本", fields: [...commonTaxpayer, ...filingBase] },
      {
        id: "income",
        label: "所得",
        fields: [
          { id: "salaryIncome", label: "給与収入", xmlPath: "Income/Salary", type: "number", value: "0" },
          { id: "businessIncome", label: "事業所得", xmlPath: "Income/Business", type: "number", value: "0" },
          { id: "miscIncome", label: "雑所得", xmlPath: "Income/Misc", type: "number", value: "0" }
        ]
      },
      {
        id: "deduction",
        label: "控除",
        fields: [
          { id: "socialInsurance", label: "社会保険料控除", xmlPath: "Deductions/SocialInsurance", type: "number", value: "0" },
          { id: "lifeInsurance", label: "生命保険料控除", xmlPath: "Deductions/LifeInsurance", type: "number", value: "0" },
          { id: "donation", label: "寄附金控除", xmlPath: "Deductions/Donation", type: "number", value: "0" }
        ]
      }
    ]
  },
  corporate: {
    taxType: "corporate",
    title: "法人税 申告書",
    rootElement: "CorporateTaxReturn",
    namespace: "urn:etax:prototype:corporate-tax:r8",
    sections: [
      {
        id: "corp",
        label: "法人情報",
        fields: [
          { id: "corporateName", label: "法人名", xmlPath: "Corporation/Name", type: "text", required: true },
          { id: "corporateNumber", label: "法人番号", xmlPath: "Corporation/Number", type: "text", pattern: "^\\d{13}$", hint: "13桁の数字" },
          { id: "representative", label: "代表者氏名", xmlPath: "Corporation/Representative", type: "text" },
          { id: "headOffice", label: "本店所在地", xmlPath: "Corporation/Address", type: "text", required: true },
          ...filingBase
        ]
      },
      {
        id: "profit",
        label: "所得計算",
        fields: [
          { id: "revenue", label: "益金の額", xmlPath: "TaxBase/Revenue", type: "number", value: "0" },
          { id: "expense", label: "損金の額", xmlPath: "TaxBase/Expense", type: "number", value: "0" },
          { id: "taxableIncome", label: "課税所得", xmlPath: "TaxBase/TaxableIncome", type: "number", value: "0" }
        ]
      }
    ]
  },
  consumption: {
    taxType: "consumption",
    title: "消費税 申告書",
    rootElement: "ConsumptionTaxReturn",
    namespace: "urn:etax:prototype:consumption-tax:r8",
    sections: [
      { id: "basic", label: "基本", fields: [...commonTaxpayer, ...filingBase] },
      {
        id: "sales",
        label: "課税売上",
        fields: [
          { id: "taxableSales10", label: "課税売上 10%", xmlPath: "Sales/Taxable10", type: "number", value: "0" },
          { id: "taxableSales8", label: "課税売上 軽減8%", xmlPath: "Sales/Reduced8", type: "number", value: "0" },
          { id: "inputTax", label: "控除対象仕入税額", xmlPath: "TaxCredit/InputTax", type: "number", value: "0" }
        ]
      }
    ]
  },
  asset: {
    taxType: "asset",
    title: "資産税 申告書",
    rootElement: "AssetTaxReturn",
    namespace: "urn:etax:prototype:asset-tax:r8",
    sections: [
      { id: "basic", label: "基本", fields: [...commonTaxpayer, ...filingBase] },
      {
        id: "asset",
        label: "財産",
        fields: [
          { id: "realEstate", label: "土地・建物", xmlPath: "Assets/RealEstate", type: "number", value: "0" },
          { id: "securities", label: "有価証券", xmlPath: "Assets/Securities", type: "number", value: "0" },
          { id: "cashDeposit", label: "現金・預貯金", xmlPath: "Assets/CashDeposit", type: "number", value: "0" },
          { id: "liabilities", label: "債務", xmlPath: "Assets/Liabilities", type: "number", value: "0" }
        ]
      }
    ]
  },
  withholding: {
    taxType: "withholding",
    title: "源泉所得税 納付書",
    rootElement: "WithholdingTaxReturn",
    namespace: "urn:etax:prototype:withholding-tax:r8",
    sections: [
      {
        id: "payer",
        label: "支払者",
        fields: [
          { id: "payerName", label: "支払者名", xmlPath: "Payer/Name", type: "text", required: true },
          { id: "payerId", label: "利用者識別番号", xmlPath: "Payer/UserId", type: "text", pattern: "^\\d{16}$", hint: "16桁の数字" },
          { id: "payerAddress", label: "所在地", xmlPath: "Payer/Address", type: "text", required: true },
          ...filingBase
        ]
      },
      {
        id: "payment",
        label: "支払",
        fields: [
          { id: "salaryPayment", label: "給与等支払額", xmlPath: "Payment/Salary", type: "number", value: "0" },
          { id: "withheldTax", label: "源泉徴収税額", xmlPath: "Payment/WithheldTax", type: "number", value: "0" },
          { id: "people", label: "人員", xmlPath: "Payment/People", type: "number", value: "0" }
        ]
      }
    ]
  }
};
