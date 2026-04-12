/**
 * Inline Completion Provider for AI-powered code completions
 * Provides Copilot-like suggestions in the Monaco editor
 */

import * as monaco from 'monaco-editor';
import { createAIModel, AIConfig, ChatMessage } from '../ai/AIModelProvider';
import { editorStore } from '../stores/editorStore';
import { useAIStore } from '../stores/aiStore';

class InlineCompletionService {
  private isEnabled: boolean = true;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceDelay: number = 300;
  private currentCompletion: { insertText: string } | null = null;
  private providerDisposable: monaco.IDisposable | null = null;

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
   * Set debounce delay
   */
  setDebounceDelay(delay: number): void {
    this.debounceDelay = delay;
  }

  /**
   * Register the inline completions provider with Monaco
   */
  register(monacoInstance: typeof monaco): void {
    // Register a completion provider for code suggestions
    this.providerDisposable = monacoInstance.languages.registerCompletionItemProvider(
      { pattern: '**' },
      {
        provideCompletionItems: async (model, position, context, token) => {
          if (!this.isEnabled) return null;

          // Only trigger on certain characters or manually
          const lastChar = model.getLineContent(position.lineNumber).charAt(position.column - 2);
          if (lastChar && ![' ', '\t', '\n', '.', ':'].includes(lastChar)) {
            return null;
          }

          return this.handleCompletion(model, position);
        }
      }
    );

    console.log('Inline completion service registered');
  }

  /**
   * Handle completion request
   */
  private async handleCompletion(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): Promise<monaco.languages.CompletionList | null> {
    // Check if AI is configured
    const aiConfig = useAIStore.getState().config;
    if (!aiConfig || !aiConfig.apiKey) {
      return null;
    }

    // Cancel previous debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Wait for debounce delay
    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        try {
          const completion = await this.getCompletion(model, position);
          if (completion) {
            this.currentCompletion = completion;

            resolve({
              suggestions: [{
                kind: monaco.languages.CompletionItemKind.Snippet,
                label: 'AI Completion',
                insertText: completion.insertText,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column
                },
                detail: 'AI-powered code completion',
                command: {
                  id: 'editor.action.inlineSuggest.commit',
                  title: 'Accept'
                }
              }],
              incomplete: false
            });
          } else {
            resolve(null);
          }
        } catch (error) {
          console.error('Inline completion error:', error);
          resolve(null);
        }
      }, this.debounceDelay);
    });
  }

  /**
   * Get AI completion for current context
   */
  private async getCompletion(
    model: monaco.editor.ITextModel,
    position: monaco.Position
  ): Promise<{ insertText: string } | null> {
    const aiConfig = useAIStore.getState().config;
    if (!aiConfig || !aiConfig.apiKey) {
      return null;
    }

    try {
      // Create and initialize the model
      const modelInstance = createAIModel(aiConfig.provider);
      const config: AIConfig = {
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        baseUrl: aiConfig.baseUrl,
        model: aiConfig.model,
        resourceName: aiConfig.resourceName,
        apiVersion: aiConfig.apiVersion
      };

      const initialized = await modelInstance.initialize(config);
      if (!initialized) {
        console.warn('AI model not initialized');
        return null;
      }

      // Build context from open files
      const context = this.buildContext(model, position);
      const currentLine = model.getLineContent(position.lineNumber);

      // Build messages for completion
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are an AI code completion assistant for STARLIMS SSL (Server Script Language).
STARLIMS is a laboratory information management system.
The code uses SSL with keywords starting with colons (:IF, :FOR, :WHILE, :PROCEDURE, :CLASS, :TRY, etc.)
Complete the current line or suggest the next lines. Keep completions concise (max 50 tokens).
Only output the code completion, no explanations, no markdown.`
        },
        {
          role: 'user',
          content: `Complete this code:\n${context}\nCurrent line: ${currentLine}\nCursor is at the end of the current line.`
        }
      ];

      // Get completion from AI
      const response = await modelInstance.chat({
        messages,
        maxTokens: 100,
        temperature: 0.2
      });

      const completionText = response.content.trim();
      if (!completionText) {
        return null;
      }

      // Clean up the completion text
      const cleanText = completionText.replace(/^```\w*\n?/, '').replace(/```$/, '').trim();

      return {
        insertText: cleanText
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
    const endLine = Math.min(model.getLineCount(), position.lineNumber);

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
          lines.push(...functions.map(f => `    ${f}`));
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

    const procRegex = /:PROCEDURE\s+(\w+)[^:]*?/g;
    let match;
    while ((match = procRegex.exec(content)) !== null) {
      functions.push(`:PROCEDURE ${match[1]}... :ENDPROC`);
    }

    const classRegex = /:CLASS\s+(\w+)[^:]*?/g;
    while ((match = classRegex.exec(content)) !== null) {
      functions.push(`:CLASS ${match[1]}... :ENDCLASS`);
    }

    return functions.slice(0, 10);
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
