# e-Tax Filing Designer

e-Tax の「XML構造設計書及び帳票フィールド仕様書」を元に、ブラウザで入力画面・帳票プレビュー・XML出力を行う Web アプリのプロトタイプです。

対象は e-Tax 仕様書一覧の項番9〜13です。

- 9: 所得税
- 10: 法人税
- 11: 消費税
- 12: 資産税
- 13: 源泉所得税

## 起動

```sh
docker compose up --build
```

ブラウザで `http://localhost:8080` を開きます。

## 仕様ファイルの取得

公式 CAB を取得する補助スクリプトを用意しています。

```sh
sh scripts/download_specs.sh
```

CAB 展開後、公式の XML 構造設計書・帳票フィールド仕様書から `src/specs.js` と同じ形の JSON 定義を作れば、同じ画面生成エンジンで帳票を増やせます。

## 構造定義XMLから帳票を表示する

画面左側の「構造定義XMLを読み込む」から定義ファイルを選ぶと、セクション、入力項目、必須条件、入力形式を読み取り、確定申告の入力画面と帳票プレビューを生成します。

定義XMLの基本形は `examples/income-tax-definition.xml` を参照してください。

```xml
<filingDefinition title="帳票名" rootElement="TaxReturn" namespace="urn:example">
  <section id="basic" label="基本情報">
    <field id="name" label="氏名" path="Taxpayer/Name" type="text" required="true" />
  </section>
</filingDefinition>
```

対応する読込形式は次の3種類です。

- 上記形式の構造定義XML
- e-Taxで公開されているXSD（要素階層、`appinfo` の日本語名、型、`minOccurs` を反映）
- 入力済みXML（末端要素を入力項目として値も取り込む）

## 令和7年分 所得税申告書

起動時には、国税庁公開の令和7年分「所得税及び復興特別所得税の申告書」を表示します。公式PDFの4ページを帳票面として使用し、第一表・第二表の入力欄をXML要素へ対応付けています。

- 帳票・XML構造定義: `examples/r07-income-tax-definition.xml`
- 公式XMLスキーマ: `assets/forms/r07-income-tax/KOA020-023.xsd`（KOA020 Ver23.0）
- 帳票画像: `assets/forms/r07-income-tax/page-1.png` から `page-4.png`

構造定義の各 `field` は、`path` に公式XMLタグ、`page` と `x` / `y` / `width` / `height` に帳票上の配置を持ちます。

## 現状の実装範囲

- 税目別の帳票選択
- 入力フォームの動的生成
- 必須・形式チェック
- 罫線付き帳票プレビュー
- XML プレビューと XML ダウンロード
- 構造定義XML・e-Tax XSD・入力済みXML・JSON定義の取込
- Docker/nginx によるブラウザ実行環境

このリポジトリに含む帳票定義はプロトタイプ用です。実運用では国税庁公開の最新仕様書から生成した定義で置き換えてください。
