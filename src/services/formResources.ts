export type FormResourceEntry = {
  resourceId: string;
  resourceValue: string;
  guid?: string;
};

export type ParsedFormResources = {
  xml: string;
  resources: FormResourceEntry[];
};

const XML_PREFIX = /^\s*(?:<\?xml[\s\S]*?\?>\s*)?</i;

export function normalizeFormResourcesUri(uri: string): string {
  const normalized = uri.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const match = normalized.match(/^(.*\/(?:HTMLForms|XFDForms))\/(?:XML|CodeBehind|Guide|Resources)\/([^/]+)$/i);
  if (!match) {
    throw new Error('Form Resources requires a URI ending in /HTMLForms/Resources/<form> (the XML, CodeBehind, or Guide URI for the same form is also accepted).');
  }
  return `${match[1]}/Resources/${match[2]}`;
}

export function decodeFormResourcePayload(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed || XML_PREFIX.test(trimmed)) return payload;
  try {
    const binary = atob(trimmed.replace(/\s+/g, ''));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    return XML_PREFIX.test(decoded) ? decoded : payload;
  } catch {
    return payload;
  }
}

function directChild(element: Element, name: string): Element | undefined {
  return Array.from(element.childNodes).find((node): node is Element =>
    node.nodeType === 1 && (((node as Element).localName || node.nodeName).toLowerCase() === name.toLowerCase())
  );
}

function resourceRows(document: Document): Element[] {
  return Array.from(document.getElementsByTagName('*')).filter((element) => Boolean(directChild(element, 'ResourceId')));
}

function parseDocument(xml: string): Document {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = document.getElementsByTagName('parsererror')[0];
  if (!document.documentElement || parserError) {
    throw new Error(`Invalid Form Resources XML${parserError?.textContent ? `: ${parserError.textContent.trim()}` : '.'}`);
  }
  return document;
}

export function parseFormResources(payload: string): ParsedFormResources {
  const xml = decodeFormResourcePayload(payload);
  const document = parseDocument(xml);
  const resources = resourceRows(document).map((row) => ({
    resourceId: directChild(row, 'ResourceId')?.textContent || '',
    resourceValue: directChild(row, 'ResourceValue')?.textContent || '',
    guid: directChild(row, 'Guid')?.textContent || undefined
  })).filter((entry) => entry.resourceId.length > 0);
  return { xml, resources };
}

function appendTextElement(document: Document, parent: Element, name: string, value: string): Element {
  const element = document.createElement(name);
  element.appendChild(document.createTextNode(value));
  parent.appendChild(element);
  return element;
}

export function setFormResourceValue(payload: string, resourceId: string, resourceValue: string): { xml: string; created: boolean } {
  const id = resourceId.trim();
  if (!id) throw new Error('ResourceId is required.');
  const document = parseDocument(decodeFormResourcePayload(payload));
  const rows = resourceRows(document);
  let row = rows.find((candidate) => directChild(candidate, 'ResourceId')?.textContent === id);
  const created = !row;

  if (!row) {
    row = document.createElement(rows[0]?.nodeName || 'ResourcesTable');
    appendTextElement(document, row, 'Guid', crypto.randomUUID());
    appendTextElement(document, row, 'ResourceId', id);
    appendTextElement(document, row, 'ResourceValue', resourceValue);
    document.documentElement.appendChild(row);
  } else {
    const valueElement = directChild(row, 'ResourceValue') || appendTextElement(document, row, 'ResourceValue', '');
    while (valueElement.firstChild) valueElement.removeChild(valueElement.firstChild);
    valueElement.appendChild(document.createTextNode(resourceValue));
  }

  return { xml: new XMLSerializer().serializeToString(document), created };
}

export async function formResourceVersion(xml: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(xml));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
