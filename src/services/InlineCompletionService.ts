/**
 * Inline Completion Service for AI-powered Copilot-like code completions
 * Uses Monaco's InlineCompletionsProvider API for ghost text suggestions
 */

import * as monaco from 'monaco-editor';
import { editorStore } from '../stores/editorStore';
import { loadActiveGenericAgentConfig } from './genericAgentConfig';

export interface InlineCompletionResult {
  insertText: string;
  range: monaco.IRange;
}

class InlineCompletionService {
  private isEnabled = true;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceDelay = 300; // Faster response
  private currentCompletion: InlineCompletionResult | null = null;
  private providerDisposable: monaco.IDisposable | null = null;
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private lastTriggerTime = 0;

  constructor() {
    this.isEnabled = true;
  }

  /**
   * Enable/disable inline completions
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.currentCompletion = null;
    }
  }

  /**
   * Check if completions are enabled
   */
  getEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Set debounce delay
   */
  setDebounceDelay(delay: number): void {
    this.debounceDelay = delay;
  }

  /**
   * Register the inline completions provider with Monaco
   */
  register(monacoInstance: typeof monaco, editor: monaco.editor.IStandaloneCodeEditor): void {
    this.editor = editor;

    // Register inline completions provider
    this.providerDisposable = monacoInstance.languages.registerInlineCompletionsProvider(
      { pattern: '**' },
      {
        provideInlineCompletions: async (model, position, context, token) => {
          if (!this.isEnabled) {
            return null;
          }

          // Don't trigger too frequently
          const now = Date.now();
          if (now - this.lastTriggerTime < this.debounceDelay) {
            return null;
          }

          // For automatic trigger, check if the character before cursor is a trigger
          const triggerKind = context.triggerKind;
          if (triggerKind === monacoInstance.languages.InlineCompletionTriggerKind.Automatic) {
            const lineContent = model.getLineContent(position.lineNumber);
            const charBefore = lineContent.charAt(position.column - 2);

            // Trigger on word characters, brackets, colons, etc.
            const triggerChars = /[a-zA-Z0-9_:().[\]{}>'"]/;
            if (!triggerChars.test(charBefore) && charBefore !== ' ' && charBefore !== '\t') {
              return null;
            }
          }

          this.lastTriggerTime = now;

          try {
            const completion = await this.getCompletion(model, position);
            if (completion && completion.insertText) {
              this.currentCompletion = completion;
              return {
                items: [{
                  insertText: completion.insertText,
                  range: completion.range,
                  command: undefined
                }]
              };
            }
          } catch (error) {
            console.error('Inline completion error:', error);
          }

          return null;
        },

        handleItemDidShow: (completions, item) => {
          console.log('Inline completion shown');
        },

        handlePartialAccept: (completions, item, acceptedCharacters) => {
          console.log('Inline completion partially accepted:', acceptedCharacters);
        },

        disposeInlineCompletions: (completions: any, reason: any) => {
          this.currentCompletion = null;
        }
      }
    );

    // Register Ctrl+Space for manual trigger
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Space, () => {
      this.triggerManualCompletion(editor);
    });

    console.log('Inline completion service registered with Monaco');
  }

  /**
   * Manually trigger inline completion
   */
  private async triggerManualCompletion(editor: monaco.editor.IStandaloneCodeEditor): Promise<void> {
    if (!this.isEnabled) return;

    const model = editor.getModel();
    const position = editor.getPosition();
    if (!model || !position) return;

    try {
      const completion = await this.getCompletion(model, position);
      if (completion && completion.insertText) {
        this.currentCompletion = completion;

        // Use inlineSuggest controller if available
        const inlineSuggestController = editor.getContribution('editor.contrib.inlineSuggest');
        if (inlineSuggestController) {
          // Trigger inline suggest
          (inlineSuggestController as any).startSession?.();
        }
      }
    } catch (error) {
      console.error('Manual trigger error:', error);
    }
  }

  /**
   * Get AI completion for current context
   */
  private async getCompletion(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): Promise<InlineCompletionResult | null> {
    try {
      const config = await loadActiveGenericAgentConfig();
      if (!config || !window.electronAPI) return null;

      // Build context
      const context = this.buildContext(model, position);
      const currentLine = model.getLineContent(position.lineNumber);
      const beforeCursor = currentLine.substring(0, position.column - 1);

      // Build prompt for code completion with SSL rules
      const prompt = `You are completing STARLIMS SSL (Server Script Language).
STARLIMS SSL Syntax Rules - CRITICAL:
1. Every SSL statement must end with semicolon (;), except #include "Module.Script" reference directives
2. Keywords: :PROCEDURE/:ENDPROC, :FUNCTION/:ENDFUNC, :IF/:ENDIF/:ELSE, :FOR/:NEXT, :WHILE/:ENDWHILE, :TRY/:CATCH/:FINALLY/:ENDTRY, :DECLARE, :PARAMETERS
3. Comments: /* comment */; (semicolon AFTER closing */)
4. Assignment: variable := value;
5. Boolean values: .T. (true), .F. (false)
6. String functions: Len(), Substr(), At(), Rat(), Left(), Right(), Alltrim(), Ltrim(), Rtrim(), Upper(), Lower(), LTrim(), RTrim(), LIMSString(), Chr(), Str(), Val(), StrZero()
7. SQL functions: SQLExecute(), RunSql(), Lsearch(), ExecFunction()

CORRECT EXAMPLES:
sResult := "test";
:IF sResult <> "";
    nCount := Len(sResult);
:ENDIF;
SQLExecute("SELECT * FROM TABLE WHERE ID = ?nCode?");
UsrMes({"MESSAGE", "Value=" + LIMSString(nCount)});

Complete the code at the cursor position. Rules:
1. Output ONLY the code to insert after the cursor, no explanations, no markdown
2. Keep completion concise (max 60 tokens)
3. Match the surrounding code style and indentation
4. If completing a block (:IF, :FOR, :WHILE, :PROCEDURE), include the closing keyword (:ENDIF, :ENDFOR, :ENDWHILE, :ENDPROC)
5. Every executable SSL line and comment must end with semicolon; #include reference directives do not
6. Do NOT repeat text that already exists after the cursor

Code before cursor:\n${beforeCursor}\n\nCurrent line (cursor at |):\n${currentLine}\n\nContext:\n${context}\n\nOutput only the code to insert.`;

      let completionText = await window.electronAPI.genericAgentComplete(config, prompt);

      // Clean up the completion text
      completionText = completionText
        .replace(/^```\w*\n?/, '')  // Remove markdown code blocks
        .replace(/```$/, '')
        .trim();

      // Remove any leading/trailing whitespace
      completionText = completionText.replace(/^[\n\r]+/, '').replace(/[\n\r]+$/, '');

      if (!completionText) {
        return null;
      }

      return {
        insertText: completionText,
        range: new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column
        )
      };
    } catch (error) {
      console.error('Failed to get completion:', error);
      return null;
    }
  }

  /**
   * Build context string from open files and current position
   */
  private buildContext(model: monaco.editor.ITextModel, position: monaco.Position): string {
    const lines: string[] = [];
    const currentFileUri = model.uri.toString();

    // Get lines around cursor from current file
    const linesAround = 10;
    const startLine = Math.max(1, position.lineNumber - linesAround);
    const endLine = Math.min(model.getLineCount(), position.lineNumber + 10);

    for (let i = startLine; i <= endLine; i++) {
      const content = model.getLineContent(i);
      const marker = i === position.lineNumber ? '>>> ' : '    ';
      lines.push(`${marker}${content}`);
    }

    // Add context from other open files (function definitions)
    const openFiles = editorStore.getState().openFiles;
    for (const file of openFiles) {
      if (file.uri !== currentFileUri && file.content) {
        const functions = this.extractFunctionDefinitions(file.content);
        if (functions.length > 0) {
          lines.push(`\n// From ${file.name}:`);
          lines.push(...functions.slice(0, 3).map(f => `    ${f}`));
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Extract function definitions from SSL code
   */
  private extractFunctionDefinitions(content: string): string[] {
    const functions: string[] = [];

    // Match :PROCEDURE ... :ENDPROC blocks
    const procRegex = /:PROCEDURE\s+(\w+)[^:]*?:ENDPROC/g;
    let match;
    while ((match = procRegex.exec(content)) !== null) {
      functions.push(match[0].substring(0, 100) + (match[0].length > 100 ? '...' : ''));
    }

    // Match :FUNCTION ... :ENDFUNC blocks
    const funcRegex = /:FUNCTION\s+(\w+)[^:]*?:ENDFUNC/g;
    while ((match = funcRegex.exec(content)) !== null) {
      functions.push(match[0].substring(0, 100) + (match[0].length > 100 ? '...' : ''));
    }

    return functions;
  }

  /**
   * Accept the current completion
   */
  acceptCompletion(): void {
    this.currentCompletion = null;
  }

  /**
   * Dismiss the current completion
   */
  dismissCompletion(): void {
    this.currentCompletion = null;
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.providerDisposable) {
      this.providerDisposable.dispose();
      this.providerDisposable = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

// Singleton instance
let inlineCompletionInstance: InlineCompletionService | null = null;

export function getInlineCompletionService(): InlineCompletionService {
  if (!inlineCompletionInstance) {
    inlineCompletionInstance = new InlineCompletionService();
  }
  return inlineCompletionInstance;
}

export { InlineCompletionService };
export default InlineCompletionService;
