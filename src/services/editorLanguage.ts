const normalize = (value?: string): string => (value || '').trim().toUpperCase().replace(/[\s_-]+/g, '');

/** Resolve STARLIMS item metadata to a Monaco language id. */
export function resolveEditorLanguage(fileType: string, scriptLanguage?: string): string {
  const language = normalize(scriptLanguage);
  if (['SSL', 'STARLIMS', 'STARLIMSSCRIPT'].includes(language)) return 'ssl';
  if (['JS', 'JSCRIPT', 'JAVASCRIPT', 'ECMASCRIPT'].includes(language)) return 'javascript';
  if (['SQL', 'SLSQL', 'TSQL', 'PLSQL'].includes(language)) return 'slsql';
  if (language === 'XML') return 'xml';
  if (language === 'JSON') return 'json';
  if (language === 'HTML') return 'html';

  switch (normalize(fileType)) {
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
      return 'plaintext';
    default:
      return 'plaintext';
  }
}
