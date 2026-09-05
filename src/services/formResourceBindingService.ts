import { getEnterpriseService } from './enterpriseService';
import { ensureFormResourceBinding, inspectFormResourceBinding } from './formResourceBinding';
import { saveItemWithGate } from './writeGateService';

export async function prepareHtmlFormResourceBinding(resourceUri: string, language: string) {
  if (!resourceUri.includes('/HTMLForms/Resources/')) return undefined;
  const service = getEnterpriseService();
  const uri = resourceUri.replace('/Resources/', '/XML/');
  const name = uri.slice(uri.lastIndexOf('/') + 1);
  const { items } = await service.search(name, undefined, true);
  const formId = items.find((item) => (item.uri || item.id) === uri)?.guid;
  if (!formId) throw new Error('Cannot verify the HTML form GUID from the enterprise tree. Resources save was blocked.');
  const checkout = (await service.getCheckedOutItems()).find((item) => item.uri === uri || item.guid === formId);
  if (!checkout || (checkout.language && checkout.language !== language)) {
    throw new Error(`Form Resources language ${language} does not match the verified checkout language ${checkout?.language || '(not checked out)'}. Resolve the checkout language before saving; no resource data was written.`);
  }
  const before = await service.getItemCode(uri, language);
  return { uri, formId, language, before, ...ensureFormResourceBinding(before, formId, language) };
}

export async function saveHtmlFormResourceBinding(binding: Awaited<ReturnType<typeof prepareHtmlFormResourceBinding>>) {
  if (!binding) return { formBindingVerified: false, formBindingUpdated: false };
  if (binding.changed) {
    await saveItemWithGate({ source: 'agent', action: 'save', uri: binding.uri, language: binding.language,
      approved: true, type: 'HTMLFORMXML', code: binding.xml, expectedRemoteContent: binding.before });
  }
  const actual = await getEnterpriseService().getItemCode(binding.uri, binding.language);
  if (ensureFormResourceBinding(actual, binding.formId, binding.language).changed) {
    throw new Error('Resources were saved, but the HTML Form loading binding could not be verified. Read both documents before retrying.');
  }
  return { formBindingVerified: true, formBindingUpdated: binding.changed };
}

export async function inspectHtmlFormResources(resourceUri: string, language: string) {
  if (!resourceUri.includes('/HTMLForms/Resources/')) return { status: 'not_applicable', runtimeVerified: false };
  try {
    const service = getEnterpriseService();
    const uri = resourceUri.replace('/Resources/', '/XML/');
    const { items } = await service.search(uri.slice(uri.lastIndexOf('/') + 1), undefined, true);
    const formId = items.find((item) => (item.uri || item.id) === uri)?.guid;
    if (!formId) throw new Error('Enterprise GUID could not be resolved.');
    const checkout = (await service.getCheckedOutItems()).find((item) => item.uri === uri || item.guid === formId);
    return { uri, checkoutLanguage: checkout?.language || null, writableInRequestedLanguage: checkout?.language ? checkout.language === language : null, ...inspectFormResourceBinding(await service.getItemCode(uri, language), formId, language) };
  } catch (error) {
    return { status: 'unavailable', warnings: [error instanceof Error ? error.message : String(error)], runtimeVerified: false };
  }
}
