const child = (element: Element, name: string): Element | undefined => Array.from(element.childNodes)
  .find((node): node is Element => node.nodeType === 1 && (node as Element).localName === name);

/** Match the native Enterprise_Designer.XFD2HTMLResourcesCopy ResTag3 contract. */
export function ensureFormResourceBinding(formXml: string, formId: string, language: string): { xml: string; changed: boolean } {
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(formId) || !language.trim()) {
    throw new Error('A verified form GUID and explicit language are required for the Resources binding.');
  }
  const document = new DOMParser().parseFromString(formXml, 'application/xml');
  const root = document.documentElement;
  if (document.getElementsByTagName('parsererror').length || root?.localName !== 'Form') {
    throw new Error('Cannot configure Resources: the HTML Form XML is invalid.');
  }
  let changed = false;
  const append = (parent: Element, name: string): Element => {
    const element = document.createElementNS(root.namespaceURI, name);
    parent.appendChild(element);
    changed = true;
    return element;
  };
  const existing = child(root, 'Resources');
  const resources = existing || append(root, 'Resources');
  if (!existing) { const marker = append(resources, 'FromDesigner'); marker.textContent = 'true'; }
  const data = child(resources, 'Data');
  const currentSource = data?.textContent?.trim() || '';
  const url = new URL(currentSource || 'RUNTIME_SUPPORT.GetFormResources.lims', 'http://starlims.invalid/');
  if (!/\/RUNTIME_SUPPORT\.GetFormResources\.[\w]+$/i.test(url.pathname) || url.origin !== 'http://starlims.invalid') {
    throw new Error('The form uses a custom Resources data source. Review its binding before saving programmatic resources.');
  }
  const params = new Map([...url.searchParams].map(([key, value]) => [key.toLowerCase(), value]));
  const sourceMatches = params.get('formid')?.toLowerCase() === formId.toLowerCase()
    && params.get('languageid') === language && params.get('isprogramatic') === 'Y';
  const source = sourceMatches ? currentSource
    : `${url.pathname.slice(1)}?formID=${encodeURIComponent(formId)}&languageID=${encodeURIComponent(language)}&isProgramatic=Y`;
  for (const [name, value] of Object.entries({ Data: source, KeyItem: 'ResourceId', TextItem: 'ResourceValue', ResolveEscapeChars: 'true' })) {
    const element = child(resources, name) || append(resources, name);
    if (element.textContent !== value) { element.textContent = value; changed = true; }
  }
  return { xml: changed ? new XMLSerializer().serializeToString(document) : formXml, changed };
}

/** Read-only structural diagnostics; this is not a Designer or runtime validation. */
export function inspectFormResourceBinding(formXml: string, formId: string, language: string) {
  const document = new DOMParser().parseFromString(formXml, 'application/xml');
  const root = document.documentElement;
  const warnings: string[] = [];
  if (!root || root.localName !== 'Form' || document.getElementsByTagName('parsererror').length) {
    return { status: 'unavailable', warnings: ['Invalid HTML Form XML.'], runtimeVerified: false };
  }
  const embeddedGuid = child(root, 'Guid')?.textContent || '';
  if (embeddedGuid.toLowerCase() !== formId.toLowerCase()) warnings.push('Form XML Guid differs from the enterprise GUID. The enterprise GUID is used for Resources binding.');
  const missingColumnTypes: string[] = [];
  for (const element of Array.from(document.getElementsByTagName('*'))) {
    if (element.localName !== '__array__Columns') continue;
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType !== 1) continue;
      const column = node as Element;
      if (column.localName === 'item' && !child(column, 'xtype')?.textContent?.trim()) {
        missingColumnTypes.push(child(column, 'Id')?.textContent || '(unnamed)');
      }
    }
  }
  if (missingColumnTypes.length) warnings.push('Column definitions are missing xtype. Designer may deserialize them as plain Objects. Compare against a Designer-generated form of the same control type.');
  let status: string;
  try { status = ensureFormResourceBinding(formXml, formId, language).changed ? 'repair_required' : 'valid'; }
  catch (error) { status = 'unsupported'; warnings.push(error instanceof Error ? error.message : String(error)); }
  return { status, formId, embeddedGuid, missingColumnTypes, warnings, runtimeVerified: false };
}
