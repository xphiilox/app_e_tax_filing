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
    const parts = field.xmlPath.split("/");
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
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${definition.rootElement} xmlns="${definition.namespace}">`,
    body,
    `</${definition.rootElement}>`
  ].join("\n");
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
  const parser = new DOMParser();
  const parsed = parser.parseFromString(documentText, "application/xml");
  if (parsed.querySelector("parsererror")) {
    throw new Error("XML/XSDとして読み込めませんでした。");
  }

  const root = parsed.documentElement;
  const elements = [...parsed.querySelectorAll("element[name], xs\\:element[name], xsd\\:element[name]")];
  const fields = elements
    .map((element, index) => element.getAttribute("name") || `field${index + 1}`)
    .filter((name, index, all) => name && all.indexOf(name) === index)
    .slice(0, 80)
    .map((name) => ({
      id: toId(name),
      label: name,
      xmlPath: `Imported/${name}`,
      type: "text"
    }));

  if (fields.length === 0) {
    [...root.children].slice(0, 80).forEach((child) => {
      fields.push({
        id: toId(child.localName),
        label: child.localName,
        xmlPath: `Imported/${child.localName}`,
        type: "text",
        value: child.textContent.trim()
      });
    });
  }

  return {
    taxType: "imported",
    title: `${root.localName} 取込定義`,
    rootElement: root.localName || "ImportedReturn",
    namespace: root.namespaceURI || "urn:etax:prototype:imported",
    sections: [{ id: "imported", label: "取込項目", fields }]
  };
}

function toId(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_");
}
