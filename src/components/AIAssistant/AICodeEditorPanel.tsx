import { useState, useRef, useEffect } from 'react';
import { useAIStore, AIConfig as StoreAIConfig } from '../../stores/aiStore';
import { createAIModel, AIConfig as AIModelConfig, ChatMessage } from '../../ai/AIModelProvider';

interface CodeContext {
  type: 'selection' | 'file';
  content: string;
  name: string;
}

type CLITYPE = 'claude' | 'opencode' | 'none';

interface AICodeEditorPanelProps {
  initialContext?: CodeContext[];
}

// Shared prompt builder for STARLIMS SSL code generation
function buildSTARLIMSPrompt(contextText: string, instruction: string): string {
  return `You are an expert STARLIMS SSL developer.

STARLIMS SSL Syntax Rules - CRITICAL:

1. EVERY statement MUST end with semicolon (;)
2. Keywords: :PROCEDURE/:ENDPROC, :FUNCTION/:ENDFUNC, :IF/:ENDIF/:ELSE, :FOR/:NEXT, :WHILE/:ENDWHILE, :TRY/:CATCH/:FINALLY/:ENDTRY, :CLASS/:ENDCLASS, :DECLARE, :PARAMETERS, :DEFAULT, :RETURN
3. Comments format: /* comment */; (semicolon AFTER closing */)
4. Assignment: variable := value;
5. Boolean values: .T. (true), .F. (false)
6. String functions: Len(), Substr(), At(), Rat(), Left(), Right(), Alltrim(), Ltrim(), Rtrim(), Upper(), Lower(), LTrim(), RTrim(), LIMSString(), Chr(), Str(), Val(), StrZero()
7. SQL functions: SQLExecute(), RunSql(), Lsearch(), ExecFunction()
8. Control flow examples:
   :FOR i:=1 :TO Len(arr);
       /* loop body */;
   :NEXT;

   :WHILE condition;
       /* loop body */;
   :ENDWHILE;

   :IF condition;
       /* code */;
   :ELSE;
       /* code */;
   :ENDIF;

   :TRY;
       /* code */;
   :CATCH;
       UsrMes("ERROR", GetLastSSLError():FullDescription);
   :FINALLY;
       /* cleanup */;
   :ENDTRY;

CORRECT CODE EXAMPLES:

:PROCEDURE procedureName;
    :PARAMETERS nCode, sName;
    :DECLARE sResult, nCount;
    sResult := "test";
    nCount := Len(sResult);
    :IF sResult <> "";
        nCount := nCount + 1;
    :ELSE;
        nCount := 0;
    :ENDIF;
    SQLExecute("SELECT * FROM TABLE WHERE ID = ?nCode?");
    UsrMes({"MESSAGE", "Value=" + LIMSString(nCount)});
:ENDPROC;

${contextText}
---
User instruction: ${instruction}

Generate the STARLIMS SSL code according to the rules above. Output ONLY the code in markdown code blocks, no explanations. Every line must end with semicolon.`;
}

export function AICodeEditorPanel({ initialContext = [] }: AICodeEditorPanelProps) {
  const [instruction, setInstruction] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [codeContext, setCodeContext] = useState<CodeContext[]>(initialContext);
  const [cliType, setCliType] = useState<CLITYPE>('none');
  const [cliStatus, setCliStatus] = useState<string>('');
  const resultRef = useRef<HTMLDivElement>(null);

  const { config } = useAIStore();

  // Auto-scroll to result
  useEffect(() => {
    if (resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [generatedCode]);

  // Check which CLI is available (via IPC to main process)
  const checkAvailableCLI = async (): Promise<CLITYPE> => {
    try {
      const hasClaude = await window.electronAPI?.cliCheckClaude();
      if (hasClaude) return 'claude';

      const hasOpenCode = await window.electronAPI?.cliCheckOpenCode();
      if (hasOpenCode) return 'opencode';

      return 'none';
    } catch (e) {
      console.error('CLI check error:', e);
      return 'none';
    }
  };

  // Execute Claude CLI (via IPC to main process)
  const executeClaudeCLI = async (): Promise<string> => {
    // Build context from code references
    let contextText = '';
    for (const ctx of codeContext) {
      if (ctx.type === 'selection') {
        contextText += `Selected code:\n\`\`\`ssl\n${ctx.content}\n\`\`\`\n\n`;
      } else {
        contextText += `File: ${ctx.name}\n\`\`\`ssl\n${ctx.content}\n\`\`\`\n\n`;
      }
    }

    const fullPrompt = buildSTARLIMSPrompt(contextText, instruction);

    setCliStatus('正在调用 Claude CLI...');

    try {
      const result = await window.electronAPI?.cliExecuteClaude(fullPrompt);
      return result || '';
    } catch (error: any) {
      throw new Error(error.message || 'Claude CLI execution failed');
    }
  };

  // Execute OpenCode CLI (via IPC to main process)
  const executeOpenCodeCLI = async (): Promise<string> => {
    // Build context from code references
    let contextText = '';
    for (const ctx of codeContext) {
      if (ctx.type === 'selection') {
        contextText += `Selected code:\n\`\`\`ssl\n${ctx.content}\n\`\`\`\n\n`;
      } else {
        contextText += `File: ${ctx.name}\n\`\`\`ssl\n${ctx.content}\n\`\`\`\n\n`;
      }
    }

    const fullPrompt = buildSTARLIMSPrompt(contextText, instruction);

    setCliStatus('正在调用 OpenCode CLI...');

    try {
      const result = await window.electronAPI?.cliExecuteOpenCode(fullPrompt);
      return result || '';
    } catch (error: any) {
      throw new Error(error.message || 'OpenCode CLI execution failed');
    }
  };

  // Use built-in AI model to generate code
  const generateWithAI = async (): Promise<string> => {
    if (!config || !config.apiKey) {
      throw new Error('AI not configured');
    }

    const model = createAIModel(config.provider);
    const aiConfig: AIModelConfig = {
      provider: config.provider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      resourceName: config.resourceName,
      apiVersion: config.apiVersion
    };

    await model.initialize(aiConfig);

    // Build context
    let contextText = '';
    for (const ctx of codeContext) {
      if (ctx.type === 'selection') {
        contextText += `Selected code:\n\`\`\`ssl\n${ctx.content}\n\`\`\`\n\n`;
      } else {
        contextText += `File: ${ctx.name}\n\`\`\`ssl\n${ctx.content}\n\`\`\`\n\n`;
      }
    }

    const fullPrompt = buildSTARLIMSPrompt(contextText, instruction);

    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are an expert STARLIMS SSL developer. Follow the syntax rules provided.' },
      { role: 'user', content: fullPrompt }
    ];

    const response = await model.chat({ messages, maxTokens: 2000 });
    return response.content || '';
  };

  // Handle generate
  const handleGenerate = async () => {
    if (!instruction.trim() || isGenerating) return;
    if (codeContext.length === 0) {
      alert('请先引用代码或文件');
      return;
    }

    setIsGenerating(true);
    setGeneratedCode('');
    setCliStatus('');

    try {
      let result: string;

      // Auto-detect CLI if not set
      if (cliType === 'none') {
        const detected = await checkAvailableCLI();
        setCliType(detected);
        if (detected === 'none') {
          setCliStatus('未检测到 CLI，使用内置 AI...');
        }
      }

      if (cliType === 'claude') {
        result = await executeClaudeCLI();
      } else if (cliType === 'opencode') {
        result = await executeOpenCodeCLI();
      } else {
        result = await generateWithAI();
      }

      // Extract code from markdown - be more strict
      let extractedCode = result.trim();

      // Try to extract from code block first
      const codeMatch = result.match(/```(?:\w+)?\n([\s\S]*?)```/);
      if (codeMatch) {
        extractedCode = codeMatch[1].trim();
      }

      // Clean up common AI artifacts
      // Remove anything before the first :PROCEDURE, :FUNCTION, :CLASS, or :DECLARE (STARLIMS keywords)
      const firstKeywordMatch = extractedCode.match(/:(PROCEDURE|FUNCTION|CLASS|DECLARE|PARAMETERS)/);
      if (firstKeywordMatch && firstKeywordMatch.index && firstKeywordMatch.index > 0) {
        extractedCode = extractedCode.substring(firstKeywordMatch.index);
      }

      // Remove anything after :ENDPROC, :ENDFUNC, :ENDCLASS if it's followed by gibberish
      extractedCode = extractedCode.replace(/:ENDPROC[\s\S]*?$/, ':ENDPROC;');
      extractedCode = extractedCode.replace(/:ENDFUNC[\s\S]*?$/, ':ENDFUNC;');
      extractedCode = extractedCode.replace(/:ENDCLASS[\s\S]*?$/, ':ENDCLASS;');

      // Remove lines that look like prompt instructions or artifacts (starting with non-code chars)
      const lines = extractedCode.split('\n');
      const cleanedLines = lines.filter(line => {
        const trimmed = line.trim();
        // Skip empty lines
        if (!trimmed) return true;
        // Skip lines that look like markdown or prompt artifacts
        if (trimmed.startsWith('****')) return false;
        if (trimmed.startsWith('```')) return false;
        if (trimmed.startsWith('---')) return false;
        if (trimmed.startsWith('User instruction')) return false;
        if (trimmed.startsWith('Generate the')) return false;
        // Keep lines that are valid SSL code or whitespace
        return true;
      });
      extractedCode = cleanedLines.join('\n');

      setGeneratedCode(extractedCode);

      // Auto show diff in editor after generation
      if (codeContext.length > 0 && (window as any).showDiffInEditor) {
        // Merge all referenced code for diff - use first reference as main original
        const original = codeContext[0].content;
        (window as any).showDiffInEditor(original, extractedCode);
      }
    } catch (error: any) {
      console.error('Generation error:', error);
      setGeneratedCode(`错误: ${error.message}`);
    } finally {
      setIsGenerating(false);
      setCliStatus('');
    }
  };

  // Insert code to editor as preview with diff
  const handleInsert = () => {
    if (!generatedCode) return;

    if ((window as any).insertCodeSmart) {
      (window as any).insertCodeSmart(generatedCode);
    } else if ((window as any).insertCodeAtCursor) {
      (window as any).insertCodeAtCursor(generatedCode);
    } else {
      navigator.clipboard.writeText(generatedCode);
      alert('代码已复制到剪贴板');
    }
  };

  // Remove a context item
  const removeContext = (index: number) => {
    setCodeContext(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <span className="text-lg">📝</span>
          <span className="font-medium">AI 代码编辑</span>
          <span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded">
            {cliType === 'none' ? '内置 AI' : cliType === 'claude' ? 'Claude CLI' : 'OpenCode CLI'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={cliType}
            onChange={(e) => setCliType(e.target.value as CLITYPE)}
            className="text-xs bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded px-2 py-1 border border-slate-300 dark:border-slate-600"
          >
            <option value="none">内置 AI</option>
            <option value="claude">Claude CLI</option>
            <option value="opencode">OpenCode CLI</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 bg-white dark:bg-slate-900">
        {/* Code Context Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200">
              📎 引用的代码 ({codeContext.length})
            </h4>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const selectedText = (window as any).getEditorSelection?.() || '';
                  if (selectedText) {
                    setCodeContext(prev => {
                      if (prev.some(c => c.type === 'selection' && c.content === selectedText)) {
                        return prev;
                      }
                      return [...prev, { type: 'selection', content: selectedText, name: `选中代码 (${selectedText.length}字符)` }];
                    });
                  }
                }}
                className="px-2 py-1 text-xs bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border"
              >
                📋 引用选中
              </button>
              <button
                onClick={() => {
                  const content = (window as any).getActiveEditorContent?.() || '';
                  const fileName = (window as any).getActiveFileName?.() || 'Current File';
                  if (content) {
                    setCodeContext(prev => {
                      if (prev.some(c => c.type === 'file' && c.name === fileName)) {
                        return prev;
                      }
                      return [...prev, { type: 'file', content, name: fileName }];
                    });
                  }
                }}
                className="px-2 py-1 text-xs bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded border"
              >
                📄 引用文件
              </button>
            </div>
          </div>

          {/* Context Items */}
          {codeContext.length === 0 ? (
            <div className="text-sm text-slate-500 dark:text-slate-400 p-3 border border-dashed border-slate-300 dark:border-slate-600 rounded text-center">
              请引用代码或文件以提供上下文
            </div>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {codeContext.map((ctx, index) => (
                <div key={index} className="relative bg-slate-100 dark:bg-slate-800 rounded p-2 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      {ctx.type === 'selection' ? '📋' : '📄'} {ctx.name}
                    </span>
                    <button
                      onClick={() => removeContext(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </div>
                  <pre className="text-slate-600 dark:text-slate-400 truncate max-h-16 overflow-hidden">
                    {ctx.content.substring(0, 200)}...
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Instruction Input */}
        <div className="mb-4">
          <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
            💬 指令
          </h4>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handleGenerate();
              }
            }}
            placeholder="例如：帮我写一个计算字符串长度的函数"
            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500"
            rows={3}
          />
          <p className="text-xs text-slate-400 mt-1">Ctrl+Enter 生成代码</p>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={!instruction.trim() || isGenerating || codeContext.length === 0}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded font-medium text-sm transition-colors mb-4"
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              生成中...
            </span>
          ) : (
            '✨ 生成代码'
          )}
        </button>

        {cliStatus && (
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 text-center">
            {cliStatus}
          </div>
        )}

        {/* Result Preview */}
        {generatedCode && (
          <div ref={resultRef} className="border border-slate-300 dark:border-slate-600 rounded">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-600">
              <h4 className="text-sm font-medium text-slate-700 dark:text-slate-200">
                📄 代码预览
              </h4>
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(generatedCode)}
                  className="px-2 py-1 text-xs bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded"
                >
                  📋 复制
                </button>
              </div>
            </div>
            <pre className="p-3 bg-slate-50 dark:bg-slate-900 text-sm font-mono text-slate-700 dark:text-slate-300 overflow-auto" style={{ maxHeight: '400px' }}>
              {generatedCode}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
