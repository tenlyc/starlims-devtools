/** Editor syntax/artifact names are not STARLIMS localization identifiers. */
export function resolveFormPreviewLanguage(language?: string, sessionLanguage?: string): string {
  const syntaxNames = /^(?:XML|HTML|XFD|JS|JAVASCRIPT|SSL|SQL|STARLIMS|CODEBEHIND|GUIDE|RESOURCES)$/i;
  for (const candidate of [language, sessionLanguage]) {
    const value = candidate?.trim();
    if (value && !syntaxNames.test(value)) return value.toUpperCase();
  }
  return 'ENG';
}
