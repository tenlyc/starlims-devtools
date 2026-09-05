/** Form code, guide and Resources are checked in together with the parent Form. */
export function checkinTargetUri(uri: string): string {
  return uri.trim().replace(/\\/g, '/').replace(/\/+(?=$)/, '')
    .replace(/(\/(?:HTMLForms|XFDForms))\/(?:Resources|CodeBehind|Guide)\//i, '$1/XML/');
}

/** Fail closed: a malformed/unavailable checkout list is not an empty list. */
export function pendingCheckoutIds(data: unknown): string[] {
  if (typeof data === 'string') {
    const doc = (() => {
      try { return new DOMParser().parseFromString(data, 'application/xml'); }
      catch { throw new Error('Invalid checkout status XML; check-in cannot be verified.'); }
    })();
    if (doc.documentElement?.localName !== 'DataSet' || doc.getElementsByTagName('parsererror').length) throw new Error('Invalid checkout status XML; check-in cannot be verified.');
    return Array.from(doc.getElementsByTagName('*')).filter((e) => e.localName === 'PendingCheckins').map((row) => {
      const id = Array.from(row.childNodes).find((node) => node.nodeType === 1 && (node as Element).localName === 'CHILDID')?.textContent;
      if (!id?.trim()) throw new Error('Checkout status row has no item GUID.');
      return id.trim().toLowerCase();
    });
  }
  const items = Array.isArray(data) ? data : data && typeof data === 'object' && 'items' in data ? (data as { items: unknown }).items : undefined;
  if (!Array.isArray(items)) throw new Error('Checkout status is unavailable; check-in cannot be verified.');
  return items.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid checkout status row.');
    const row = item as Record<string, unknown>;
    const id = row.guid || row.GUID || row.CHILDID || row.id || row.uri;
    if (typeof id !== 'string' || !id.trim()) throw new Error('Checkout status row has no item identifier.');
    return checkinTargetUri(id.split(':HTMLFORM')[0]).toLowerCase();
  });
}

export function assertCheckinAccepted(response: { success?: unknown; data?: unknown; message?: unknown; error?: unknown }): void {
  const data = response.data;
  const error = response.success !== true || (typeof data === 'string' && /^\s*ERROR\b/i.test(data))
    || (data && typeof data === 'object' && 'success' in data && data.success === false);
  if (error) throw new Error(`STARLIMS rejected check-in: ${String(response.message || response.error || (typeof data === 'string' ? data : 'unsuccessful response'))}`);
}
