const normalize = (value?: string): string => (value || '').trim().toUpperCase().replace(/[\s_-]+/g, '');

type ExtensionLanguage = { id: string; aliases?: string[]; itemTypes?: string[]; monacoLanguage?: string };
let extensionLanguages: ExtensionLanguage[] = [];

export function configureExtensionLanguages(languages: ExtensionLanguage[]): void {
  extensionLanguages = languages.filter((language) => language.id?.trim());
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ai-languages:changed'));
}

/** Resolve STARLIMS item metadata to a Monaco language id. */
export function resolveEditorLanguage(fileType: string, scriptLanguage?: string): string {
  const language = normalize(scriptLanguage);
  const normalizedType = normalize(fileType);
  const extension = extensionLanguages.find((candidate) =>
    [candidate.id, ...(candidate.aliases || [])].some((alias) => normalize(alias) === language)
    || (candidate.itemTypes || []).some((type) => normalize(type) === normalizedType)
  );
  if (extension) return extension.monacoLanguage || extension.id;
  if (['SSL', 'STARLIMS', 'STARLIMSSCRIPT'].includes(language)) return 'ssl';
  if (['JS', 'JSCRIPT', 'JAVASCRIPT', 'ECMASCRIPT'].includes(language)) return 'javascript';
  if (['SQL', 'SLSQL', 'TSQL', 'PLSQL'].includes(language)) return 'slsql';
  if (language === 'XML') return 'xml';
  if (language === 'JSON') return 'json';
  if (language === 'HTML') return 'html';

  switch (normalizedType) {
    case 'SS':
    case 'APPSS':
    case 'SERVERSCRIPT':
    case 'APPSERVERSCRIPT':
      return 'ssl';
    case 'CS':
    case 'APPCS':
    case 'CLIENTSCRIPT':
    case 'APPCLIENTSCRIPT':
    case 'HTMLFORMCODE':
    case 'XFDFORMCODE':
      return 'javascript';
    case 'DS':
    case 'APPDS':
    case 'DATASOURCE':
    case 'DATASOURCESCRIPT':
    case 'APPDATASOURCESCRIPT':
      return 'slsql';
    case 'HTMLFORMXML':
    case 'XFDFORMXML':
    case 'HTMLFORMRESOURCES':
    case 'XFDFORMRESOURCES':
    case 'HTMLFORM':
    case 'XFDFORM':
    case 'TABLE':
      return 'xml';
    case 'HTMLFORMGUIDE':
      return 'json';
    case 'SERVERLOG':
      return 'starlimslog';
    default:
      return 'plaintext';
  }
}
