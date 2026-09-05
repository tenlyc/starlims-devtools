export interface TableReadBackOptions {
  delays?: number[];
  sleep?: (milliseconds: number) => Promise<void>;
}

function tableDocument(xml: string): Element {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.getElementsByTagName('parsererror').length || document.documentElement?.localName !== 'TableDTO') {
    throw new Error('Expected a complete, valid TableDTO XML document.');
  }
  return document.documentElement;
}

export const tableFieldNames = (tableXml: string): string[] => {
  const fields = Array.from(tableDocument(tableXml).children).find((child) => child.localName === '__array__Fields');
  return Array.from(fields?.children || []).map((field) =>
    Array.from(field.children).find((child) => child.localName === 'Name')?.textContent?.trim() || ''
  ).filter(Boolean);
};

export function tableDefinitionId(xml: string): string {
  return Array.from(tableDocument(xml).children).find((child) => child.localName === 'Id')?.textContent?.trim() || '';
}

// These properties describe provider bookkeeping, not the requested schema.
// Compare every other value, including field types/lengths/nullability,
// captions, indexes and relations. Missing and extra entries must both fail.
const PROVIDER_METADATA = new Set(['Id', 'DdlState', 'CommitState', 'CommitError', 'IsMetadataDirty']);
const childNamed = (element: Element, name: string): Element | undefined => Array.from(element.children).find((child) => child.localName === name);

function fieldCaptions(field: Element): Map<string, string> {
  const result = new Map<string, string>();
  const add = (language: string, caption: string) => {
    if (!language || result.has(language)) throw new Error('Invalid or duplicate table caption language.');
    result.set(language, caption);
  };
  const typed = childNamed(field, '__array__Captions');
  if (typed?.children.length) {
    for (const caption of Array.from(typed.children)) add(childNamed(caption, 'LangId')?.textContent || '', childNamed(caption, 'Caption')?.textContent || '');
  } else {
    for (const row of (childNamed(field, 'SCaptions')?.textContent || '').split(';').filter((value) => value.trim())) {
      const parts = row.split(',');
      if (parts.length < 3) throw new Error('Invalid SCaptions entry: expected FIELD,LANGUAGE,CAPTION.');
      add(parts[1], parts.slice(2).join(','));
    }
  }
  return result;
}

/** Native CompareFields prepares SCaptions only for existing fields. New fields
 * need typed Captions or the provider silently drops their translations. */
export function prepareTableCaptionXml(xml: string): string {
  const root = tableDocument(xml);
  const document = root.ownerDocument;
  const xsi = 'http://www.w3.org/2001/XMLSchema-instance';
  for (const field of Array.from(childNamed(root, '__array__Fields')?.children || [])) {
    const captions = fieldCaptions(field);
    let array = childNamed(field, '__array__Captions');
    if (!array) {
      array = document.createElement('__array__Captions');
      array.setAttributeNS(xsi, 'xsi:type', 'object');
      field.appendChild(array);
    }
    if (!array.children.length) {
      for (const [language, caption] of captions) {
        const item = document.createElement('item');
        item.setAttributeNS(xsi, 'xsi:type', 'FieldCaptionDTO');
        for (const [name, value] of [['LangId', language], ['Caption', caption]]) {
          const child = document.createElement(name);
          child.setAttributeNS(xsi, 'xsi:type', 'string');
          child.textContent = value;
          item.appendChild(child);
        }
        array.appendChild(item);
      }
    }
    const compact = childNamed(field, 'SCaptions');
    if (compact) compact.textContent = Array.from(captions, ([language, caption]) => `${childNamed(field, 'Name')?.textContent || ''},${language},${caption}`).join(';');
  }
  return new XMLSerializer().serializeToString(document);
}

function canonicalElement(element: Element): string {
  const isField = element.localName === 'item' && Boolean(childNamed(element, 'SCaptions') || childNamed(element, '__array__Captions'));
  const children = Array.from(element.children).filter((child) => !PROVIDER_METADATA.has(child.localName)
    && !(isField && ['SCaptions', '__array__Captions'].includes(child.localName)));
  const attributes = Array.from(element.attributes)
    .filter((attribute) => attribute.namespaceURI !== 'http://www.w3.org/2000/xmlns/' && attribute.localName !== 'type')
    .map((attribute) => [attribute.namespaceURI || '', attribute.localName, attribute.value]).sort();
  return JSON.stringify([element.localName, attributes, isField ? Array.from(fieldCaptions(element)).filter(([, caption]) => caption !== '').sort() : null,
    children.length ? children.map(canonicalElement).sort() : (element.children.length ? '' : element.textContent || '')]);
}

export function tableDefinitionVersion(xml: string): string {
  return canonicalElement(tableDocument(xml));
}

const defaultSleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function waitForTableReadBack(
  read: () => Promise<string>,
  requestedXml: string,
  beforeXml: string,
  options: TableReadBackOptions = {}
): Promise<string> {
  const requestedFields = tableFieldNames(requestedXml);
  const requestedDefinition = tableDefinitionVersion(requestedXml);
  const delays = options.delays || [0, 150, 350, 750, 1250, 2000];
  const sleep = options.sleep || defaultSleep;
  let latest = beforeXml;

  // TableProvider.Modify can return before the committed definition is visible
  // to TableGetById. Verify semantically because STARLIMS also canonicalizes the
  // submitted DTO (ids, element order and formatting can all change).
  for (const delay of delays) {
    if (delay) await sleep(delay);
    latest = await read();
    if (tableDefinitionVersion(latest) === requestedDefinition) return latest;
  }

  const actualFields = new Set(tableFieldNames(latest));
  const missingFields = requestedFields.filter((field) => !actualFields.has(field));
  throw new Error(missingFields.length
    ? `Table save could not be verified after read-back; missing fields: ${missingFields.join(', ')}.`
    : 'Table save returned success but read-back did not contain the requested changes.');
}
