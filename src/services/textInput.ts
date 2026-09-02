export type CompositionKeyboardEvent = {
  isComposing?: boolean;
  keyCode?: number;
};

/**
 * Chromium can report keyCode 229 before/after composition events on CJK IMEs.
 * Treat both signals as composition so Enter confirms the candidate instead of
 * submitting and clearing the controlled input.
 */
export function isImeCompositionKey(event: CompositionKeyboardEvent, composing: boolean): boolean {
  return composing || event.isComposing === true || event.keyCode === 229;
}
