export function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildXml(definition, values) {
  const tree = {};
  definition.sections.flatMap((section) => section.fields).forEach((field) => {
    const parts = field.xmlPath.split("/").filter(Boolean);
    let cursor = tree;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        cursor[part] = values[field.id] ?? field.value ?? "";
      } else {
        cursor[part] ||= {};
        cursor = cursor[part];
      }
    });
  });

  const body = renderNode(tree, 1);
  const namespace = definition.namespace ? ` xmlns="${escapeXml(definition.namespace)}"` : "";
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${definition.rootElement}${namespace}>`,
    body,
    `</${definition.rootElement}>`
  ].filter((line) => line !== "").join("\n");
}

function renderNode(node, depth) {
  const indent = "  ".repeat(depth);
  return Object.entries(node)
    .map(([key, value]) => {
      if (value && typeof value === "object") {
        return `${indent}<${key}>\n${renderNode(value, depth + 1)}\n${indent}</${key}>`;
      }
      return `${indent}<${key}>${escapeXml(value)}</${key}>`;
    })
    .join("\n");
}

export function definitionFromXml(documentText) {
  const parsed = parseXml(documentText);
  const root = parsed.documentElement;

  if (root.localName === "filingDefinition") {
    return definitionFromFilingXml(root);
  }

  if (root.localName === "schema" && root.namespaceURI === "http://www.w3.org/2001/XMLSchema") {
    return definitionFromXsd(root);
  }

  return definitionFromInstance(root);
}

function parseXml(documentText) {
  const parsed = new DOMParser().parseFromString(documentText, "application/xml");
  if (parsed.querySelector("parsererror")) {
    throw new Error("XMLとして読み込めませんでした。構文を確認してください。");
  }
  return parsed;
}

function definitionFromFilingXml(root) {
  const layoutNode = directChildren(root, "layout")[0];
  const layout = layoutNode ? {
    pages: directChildren(layoutNode, "page").map((page, index) => ({
      number: Number(page.getAttribute("number")) || index + 1,
      label: page.getAttribute("label") || `第${index + 1}頁`,
      image: page.getAttribute("image")
    })).filter((page) => page.image)
  } : null;
  const sections = directChildren(root, "section").map((section, sectionIndex) => ({
    id: section.getAttribute("id") || `section-${sectionIndex + 1}`,
    label: section.getAttribute("label") || `セクション ${sectionIndex + 1}`,
    fields: directChildren(section, "field").map((field, fieldIndex) => {
      const xmlPath = field.getAttribute("path") || field.getAttribute("xmlPath");
      if (!xmlPath) throw new Error("fieldにはpath属性が必要です。");
      return {
        id: field.getAttribute("id") || uniqueId(xmlPath, sectionIndex, fieldIndex),
        label: field.getAttribute("label") || lastPathPart(xmlPath),
        xmlPath,
        type: normalizeInputType(field.getAttribute("type")),
        required: parseBoolean(field.getAttribute("required")),
        pattern: field.getAttribute("pattern") || undefined,
        hint: field.getAttribute("hint") || undefined,
        value: field.getAttribute("value") || "",
        page: Number(field.getAttribute("page")) || undefined,
        position: field.hasAttribute("x") ? {
          x: Number(field.getAttribute("x")),
          y: Number(field.getAttribute("y")),
          width: Number(field.getAttribute("width")),
          height: Number(field.getAttribute("height")),
          align: field.getAttribute("align") || "right"
        } : undefined
      };
    })
  }));

  const populatedSections = sections.filter((section) => section.fields.length > 0);
  if (populatedSections.length === 0) {
    throw new Error("sectionとfieldを含む帳票定義ではありません。");
  }

  return {
    taxType: root.getAttribute("taxType") || "imported",
    sourceType: "definition",
    title: root.getAttribute("title") || "取込帳票",
    rootElement: root.getAttribute("rootElement") || "TaxReturn",
    namespace: root.getAttribute("namespace") || "",
    version: root.getAttribute("version") || "",
    schema: root.getAttribute("schema") || "",
    layout,
    sections: populatedSections
  };
}

function definitionFromXsd(schema) {
  const namedTypes = new Map(
    descendants(schema, "complexType")
      .filter((node) => node.getAttribute("name"))
      .map((node) => [node.getAttribute("name"), node])
  );

  const candidates = descendants(schema, "element");
  const rootElement = candidates.find((element) => {
    const parent = element.parentElement;
    return parent === schema || parent?.localName === "sequence" && parent.parentElement?.localName === "group";
  }) || candidates[0];

  if (!rootElement) throw new Error("XSD内に帳票要素が見つかりませんでした。");

  const rootName = elementName(rootElement) || "TaxReturn";
  const rootChildren = childElementDefinitions(rootElement, namedTypes);
  const sections = [];

  if (rootChildren.length === 0) {
    const fields = collectXsdFields(rootElement, namedTypes, [], new Set());
    sections.push({ id: "form", label: schemaTitle(schema) || rootName, fields });
  } else {
    rootChildren.forEach((child, sectionIndex) => {
      const sectionName = elementName(child) || `section-${sectionIndex + 1}`;
      const sectionLabel = annotationText(child) || sectionName;
      const nested = childElementDefinitions(child, namedTypes);
      const fields = nested.length > 0
        ? collectXsdFields(child, namedTypes, [sectionName], new Set())
        : [fieldFromXsdElement(child, [sectionName], sectionIndex)];
      if (fields.length > 0) {
        sections.push({ id: uniqueId(sectionName, sectionIndex), label: sectionLabel, fields });
      }
    });
  }

  if (sections.length === 0 || sections.every((section) => section.fields.length === 0)) {
    throw new Error("XSDから入力項目を抽出できませんでした。");
  }

  return {
    taxType: "imported",
    sourceType: "xsd",
    title: schemaTitle(schema) || `${rootName} 帳票`,
    rootElement: rootName,
    namespace: schema.getAttribute("targetNamespace") || "",
    sections
  };
}

function collectXsdFields(element, namedTypes, path, visiting) {
  const signature = `${elementName(element)}:${element.getAttribute("type") || "inline"}`;
  if (visiting.has(signature)) return [];

  const nextVisiting = new Set(visiting);
  nextVisiting.add(signature);
  const children = childElementDefinitions(element, namedTypes);
  if (children.length === 0) return [fieldFromXsdElement(element, path)];

  return children.flatMap((child, index) => {
    const name = elementName(child) || `field-${index + 1}`;
    const childPath = [...path, name];
    const nested = childElementDefinitions(child, namedTypes);
    return nested.length > 0
      ? collectXsdFields(child, namedTypes, childPath, nextVisiting)
      : [fieldFromXsdElement(child, childPath, index)];
  });
}

function childElementDefinitions(element, namedTypes) {
  let complexType = directChildren(element, "complexType")[0];
  if (!complexType) {
    const typeName = localPart(element.getAttribute("type"));
    complexType = namedTypes.get(typeName);
  }
  if (!complexType) return [];

  const container = findContentContainer(complexType);
  return container ? directChildren(container, "element") : [];
}

function findContentContainer(complexType) {
  const direct = elementChildren(complexType).find((child) => ["sequence", "all", "choice"].includes(child.localName));
  if (direct) return direct;
  const content = elementChildren(complexType).find((child) => ["complexContent", "simpleContent"].includes(child.localName));
  if (!content) return null;
  const extension = elementChildren(content).find((child) => ["extension", "restriction"].includes(child.localName));
  return extension && elementChildren(extension).find((child) => ["sequence", "all", "choice"].includes(child.localName));
}

function fieldFromXsdElement(element, path, index = 0) {
  const name = elementName(element) || `field-${index + 1}`;
  const typeName = localPart(element.getAttribute("type"));
  const label = annotationText(element) || name;
  const maxOccurs = element.getAttribute("maxOccurs");
  const hintParts = [typeName && `型: ${typeName}`, maxOccurs && maxOccurs !== "1" && `繰返し: ${maxOccurs}`].filter(Boolean);
  return {
    id: uniqueId(path.join("_"), index),
    label,
    xmlPath: path.join("/"),
    type: inputTypeFromXsd(typeName),
    required: element.getAttribute("minOccurs") !== "0",
    hint: hintParts.join(" / ") || undefined,
    value: ""
  };
}

function definitionFromInstance(root) {
  const topLevel = elementChildren(root);
  const sections = [];

  const addSection = (node, sectionIndex, includeNodeInPath) => {
    const nodeName = node.localName;
    const basePath = includeNodeInPath ? [nodeName] : [];
    const fields = collectInstanceFields(node, basePath, sectionIndex);
    if (fields.length > 0) {
      sections.push({
        id: uniqueId(nodeName || "form", sectionIndex),
        label: humanLabel(node) || nodeName || "入力項目",
        fields
      });
    }
  };

  if (topLevel.some((child) => elementChildren(child).length > 0)) {
    topLevel.forEach((child, index) => addSection(child, index, true));
  } else {
    addSection(root, 0, false);
  }

  if (sections.length === 0) throw new Error("XML内に入力項目が見つかりませんでした。");

  return {
    taxType: "imported",
    sourceType: "xml",
    title: `${humanLabel(root) || root.localName} 帳票`,
    rootElement: root.localName,
    namespace: root.namespaceURI || "",
    sections
  };
}

function collectInstanceFields(node, path, sectionIndex) {
  const children = elementChildren(node);
  if (children.length === 0) {
    const xmlPath = path.join("/") || node.localName;
    return [{
      id: uniqueId(xmlPath, sectionIndex),
      label: humanLabel(node) || node.localName,
      xmlPath,
      type: inferInputType(node.localName, node.textContent.trim()),
      required: false,
      value: node.textContent.trim()
    }];
  }

  const occurrence = new Map();
  return children.flatMap((child, index) => {
    const count = occurrence.get(child.localName) || 0;
    occurrence.set(child.localName, count + 1);
    if (count > 0) return [];
    return collectInstanceFields(child, [...path, child.localName], `${sectionIndex}-${index}`);
  });
}

function schemaTitle(schema) {
  const documentation = descendants(schema, "documentation")[0]?.textContent?.trim();
  if (!documentation) return "";
  const styleName = documentation.match(/様式名[：:]\s*([^\r\n]+)/)?.[1]?.trim();
  return styleName || documentation.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

function annotationText(element) {
  const annotation = directChildren(element, "annotation")[0];
  if (!annotation) return "";
  const text = descendants(annotation, "appinfo")[0]?.textContent || descendants(annotation, "documentation")[0]?.textContent || "";
  return text.trim().replace(/^['"]|['"]$/g, "");
}

function humanLabel(element) {
  return element.getAttribute("label") || element.getAttribute("name") || element.localName;
}

function inputTypeFromXsd(typeName) {
  const value = typeName.toLowerCase();
  if (/date|day|ymd|年月日/.test(value)) return "date";
  if (/decimal|integer|int|long|short|kingaku|suryo|number|amount|yen/.test(value)) return "number";
  return "text";
}

function inferInputType(name, value) {
  if (/date|day|年月日/i.test(name) || /^\d{4}-\d{2}-\d{2}$/.test(value)) return "date";
  if (/amount|income|tax|price|count|金額|税額|所得|収入/i.test(name) && /^-?\d*$/.test(value)) return "number";
  return "text";
}

function normalizeInputType(type) {
  return ["text", "number", "date", "email", "tel"].includes(type) ? type : "text";
}

function elementName(element) {
  return element.getAttribute("name") || localPart(element.getAttribute("ref"));
}

function localPart(value = "") {
  return value.includes(":") ? value.split(":").pop() : value;
}

function lastPathPart(path) {
  return path.split("/").filter(Boolean).pop() || "入力項目";
}

function parseBoolean(value) {
  return ["true", "1", "yes", "required"].includes(String(value).toLowerCase());
}

function uniqueId(value, ...suffixes) {
  const base = String(value || "field").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "field";
  return [base, ...suffixes].filter((part) => part !== undefined && part !== "").join("-");
}

function elementChildren(node) {
  return [...node.children];
}

function directChildren(node, localName) {
  return elementChildren(node).filter((child) => child.localName === localName);
}

function descendants(node, localName) {
  return [...node.getElementsByTagNameNS("*", localName)];
}
