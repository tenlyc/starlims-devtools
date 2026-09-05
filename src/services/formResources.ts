export type FormResourceEntry = {
  resourceId: string;
  resourceValue: string;
  guid?: string;
};

export type ParsedFormResources = {
  xml: string;
  resources: FormResourceEntry[];
  format: 'programmatic' | 'designer';
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

function resourceFormat(document: Document): 'programmatic' | 'designer' {
  const root = (document.documentElement.localName || document.documentElement.nodeName).toLowerCase();
  if (root === 'resources') return 'designer';
  if (root === 'resourcesdataset' || root === 'newdataset' || root === 'dataset') return 'programmatic';
  throw new Error(`Unsupported Form Resources root element '${document.documentElement.nodeName}'. Use ResourcesDataset for SCM_API or Resources for designer-paste input.`);
}

function resourceRows(document: Document, format: 'programmatic' | 'designer'): Element[] {
  const rowName = format === 'designer' ? 'Resource' : 'ResourcesTable';
  return Array.from(document.getElementsByTagName('*')).filter((element) =>
    ((element.localName || element.nodeName).toLowerCase() === rowName.toLowerCase())
  );
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
  const format = resourceFormat(document);
  // A Form's <Resources><Data>...</Data></Resources> is a loading binding,
  // never a resource list. Do not silently interpret it as an empty dataset.
  const expectedRow = format === 'designer' ? 'resource' : 'resourcestable';
  for (const node of Array.from(document.documentElement.childNodes)) {
    if (node.nodeType !== 1) continue;
    const element = node as Element;
    if (element.namespaceURI === 'http://www.w3.org/2001/XMLSchema') continue;
    if ((element.localName || element.nodeName).toLowerCase() !== expectedRow) {
      throw new Error('Expected resource data rows, not Form XML or a Resources loading binding. Use ResourcesDataset/ResourcesTable or designer Resources/Resource.');
    }
  }
  const idName = format === 'designer' ? 'Id' : 'ResourceId';
  const valueName = format === 'designer' ? 'Value' : 'ResourceValue';
  const rows = resourceRows(document, format);
  for (const row of rows) {
    if (row.parentNode !== document.documentElement || !directChild(row, valueName)) {
      throw new Error('Resource rows must be direct children and include a value element (an empty element is allowed).');
    }
  }
  const resources = rows.map((row) => ({
    resourceId: directChild(row, idName)?.textContent || '',
    resourceValue: directChild(row, valueName)?.textContent || '',
    guid: directChild(row, 'Guid')?.textContent || undefined
  }));
  const ids = new Set<string>();
  for (const entry of resources) {
    if (ids.has(entry.resourceId)) throw new Error(`Form Resources contains duplicate ResourceId '${entry.resourceId}'.`);
    ids.add(entry.resourceId);
  }
  const rowName = format === 'designer' ? 'Resource' : 'ResourcesTable';
  if (resources.some((entry) => !entry.resourceId.trim())) {
    throw new Error(`Form Resources contains a ${rowName} row without a valid ID.`);
  }
  return { xml, resources, format };
}

function appendTextElement(document: Document, parent: Element, name: string, value: string): Element {
  const element = parent.namespaceURI ? document.createElementNS(parent.namespaceURI, name) : document.createElement(name);
  element.appendChild(document.createTextNode(value));
  parent.appendChild(element);
  return element;
}

function serializeProgrammaticResources(resources: FormResourceEntry[]): string {
  const outputDocument = document.implementation.createDocument('http://tempuri.org/ResourcesDataset.xsd', 'ResourcesDataset');
  const root = outputDocument.documentElement;
  for (const entry of resources) {
    const row = outputDocument.createElementNS(root.namespaceURI, 'ResourcesTable');
    appendTextElement(outputDocument, row, 'Guid', entry.guid || crypto.randomUUID());
    appendTextElement(outputDocument, row, 'ResourceId', entry.resourceId);
    appendTextElement(outputDocument, row, 'ResourceValue', entry.resourceValue);
    root.appendChild(row);
  }
  return new XMLSerializer().serializeToString(outputDocument);
}

export function toProgrammaticFormResources(payload: string, currentPayload?: string): string {
  const parsed = parseFormResources(payload);
  if (parsed.format === 'programmatic') return parsed.xml;
  if (!currentPayload) return serializeProgrammaticResources(parsed.resources);

  const current = parseFormResources(currentPayload);
  const desired = new Map(parsed.resources.map((entry) => [entry.resourceId, entry]));
  const merged = current.resources.map((entry) => {
    const replacement = desired.get(entry.resourceId);
    if (!replacement) return entry;
    desired.delete(entry.resourceId);
    return { ...entry, resourceValue: replacement.resourceValue };
  });
  for (const entry of desired.values()) {
    merged.push(entry);
  }
  return serializeProgrammaticResources(merged);
}

export function setFormResourceValue(payload: string, resourceId: string, resourceValue: string): { xml: string; created: boolean } {
  const id = resourceId.trim();
  if (!id) throw new Error('ResourceId is required.');
  const document = parseDocument(toProgrammaticFormResources(payload));
  const rows = resourceRows(document, 'programmatic');
  let row = rows.find((candidate) => directChild(candidate, 'ResourceId')?.textContent === id);
  const created = !row;

  if (!row) {
    const rowName = rows[0]?.localName || 'ResourcesTable';
    row = document.documentElement.namespaceURI
      ? document.createElementNS(document.documentElement.namespaceURI, rowName)
      : document.createElement(rowName);
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
