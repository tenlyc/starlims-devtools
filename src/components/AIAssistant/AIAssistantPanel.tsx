import { useState, useRef, useEffect } from 'react';
import { useAIStore, AIConfig as StoreAIConfig } from '../../stores/aiStore';
import { createAIModel, AIConfig as AIModelConfig, ChatMessage, ModelProvider } from '../../ai/AIModelProvider';
import { AICodeEditorPanel } from './AICodeEditorPanel';

interface AIAssistantPanelProps {
  embeddedSettings?: boolean;
  onCloseSettings?: () => void;
}

export function AIAssistantPanel({ embeddedSettings = false, onCloseSettings }: AIAssistantPanelProps) {
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [codeContext, setCodeContext] = useState<{ type: 'selection' | 'file'; content: string; name: string }[]>([]);
  const [conversationHistory, setConversationHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [insertedBlocks, setInsertedBlocks] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'chat' | 'code'>('chat');
  const [showApiKey, setShowApiKey] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, addMessage, clearMessages, isConfigured, config, setConfig, savedConfigs, loadProviderConfig, saveCurrentConfig } = useAIStore();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Show settings if not configured or if embedded in a settings view
  useEffect(() => {
    if (embeddedSettings) {
      setShowSettings(true);
    }
  }, [embeddedSettings]);

  // Show settings if not configured
  useEffect(() => {
    if (!isConfigured) {
      setShowSettings(true);
    }
  }, [isConfigured]);

  // Sync settingsForm with config when config loads from storage
  useEffect(() => {
    if (config) {
      setSettingsForm({
        provider: config.provider || 'minimax',
        apiKey: config.apiKey || '',
        baseUrl: config.baseUrl || '',
        model: config.model || '',
        resourceName: config.resourceName || '',
        apiVersion: config.apiVersion || ''
      });
    }
  }, [config]);

  // Clear messages and conversation history
  const handleClearMessages = () => {
    clearMessages();
    setConversationHistory([]);
  };

  // Insert code into editor at cursor position
  const insertCodeToEditor = (code: string, blockId: string) => {
    // Use the exposed editor method to insert text at cursor
    const editor = (window as any).getEditorRef?.();
    if (editor) {
      // Insert at current cursor position
      editor.trigger('ai', 'type', { text: code });
    } else {
      // Fallback: use clipboard API
      navigator.clipboard.writeText(code).then(() => {
        alert('Code copied to clipboard! Paste it into the editor.');
      });
    }
    // Mark this block as inserted
    setInsertedBlocks(prev => new Set(prev).add(blockId));
  };

  // Insert code as a new snippet/edit in the editor
  const insertCodeAsEdit = (code: string, blockId: string) => {
    if ((window as any).insertCodeSmart) {
      (window as any).insertCodeSmart(code);
      setInsertedBlocks(prev => new Set(prev).add(blockId));
    } else if ((window as any).insertCodeAtCursor) {
      (window as any).insertCodeAtCursor(code);
      setInsertedBlocks(prev => new Set(prev).add(blockId));
    } else {
      // Fallback to clipboard
      navigator.clipboard.writeText(code).then(() => {
        alert('Code copied! Press Ctrl+V in the editor to paste.');
      });
    }
  };

  // Parse markdown content and return React elements with insert buttons for code blocks
  const renderMessageContent = (content: string): React.ReactNode[] => {
    if (!content) return [];

    const elements: React.ReactNode[] = [];
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;

    let lastIndex = 0;
    let match;
    let keyIndex = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before the code block
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index);
        elements.push(renderInlineFormatting(textBefore, `text-${keyIndex++}`));
      }

      const lang = match[1] || 'ssl';
      const code = match[2].trim();
      const blockId = `code-block-${lastIndex}-${match.index}`;

      // Check if this block was already inserted
      const isInserted = insertedBlocks.has(blockId);

      elements.push(
        <div key={`block-${keyIndex++}`} className="relative group my-2">
          <pre className="bg-slate-800 text-slate-100 rounded-lg p-3 overflow-x-auto text-sm font-mono border border-slate-600">
            <code>{code}</code>
          </pre>
          <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => {
                navigator.clipboard.writeText(code);
              }}
              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded border border-slate-500"
              title="Copy code"
            >
              📋 Copy
            </button>
            {!isInserted && (
              <button
                onClick={() => insertCodeAsEdit(code, blockId)}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded border border-blue-500"
                title="Insert into editor"
              >
                ➕ Insert
              </button>
            )}
            {isInserted && (
              <span className="px-2 py-1 bg-green-700 text-green-200 text-xs rounded border border-green-600">
                ✓ Inserted
              </span>
            )}
          </div>
          {lang && (
            <span className="absolute bottom-2 left-3 text-xs text-slate-400">{lang}</span>
          )}
        </div>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after the last code block
    if (lastIndex < content.length) {
      const textAfter = content.slice(lastIndex);
      elements.push(renderInlineFormatting(textAfter, `text-${keyIndex++}`));
    }

    return elements;
  };

  // Render inline formatting (bold, italic, inline code) as React elements
  const renderInlineFormatting = (text: string, key: string): React.ReactNode => {
    // Process inline formatting while preserving line breaks
    const lines = text.split('\n');

    return (
      <span key={key} className="text-sm whitespace-pre-wrap">
        {lines.map((line, i) => {
          // Process inline elements in this line
          let processedLine = line;

          // Bold: **text**
          processedLine = processedLine.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
          // Italic: *text*
          processedLine = processedLine.replace(/\*([^*]+)\*/g, '<em>$1</em>');
          // Inline code: `code`
          processedLine = processedLine.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

          // Use dangerouslySetInnerHTML for inline formatting only
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: processedLine || '&nbsp;' }}
              className="ai-message-content"
            />
          );
        })}
      </span>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;

    const userMessage = input.trim();
    setInput('');
    setIsGenerating(true);

    // Add user message to UI
    addMessage({
      id: `user-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    });

    // Add to conversation history for context
    setConversationHistory(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      // Get AI response
      const response = await getAIResponse(userMessage);
      addMessage({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: new Date()
      });
      // Add AI response to conversation history
      setConversationHistory(prev => [...prev, { role: 'assistant', content: response }]);
    } catch (error: any) {
      addMessage({
        id: `error-${Date.now()}`,
        role: 'error',
        content: error.message || 'Failed to get AI response',
        timestamp: new Date()
      });
    } finally {
      setIsGenerating(false);
      setCodeContext([]); // Clear code context after sending
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Get AI response using configured model
  const getAIResponse = async (prompt: string): Promise<string> => {
    if (!config || !config.apiKey) {
      throw new Error('AI not configured. Please set your API key in settings.');
    }

    try {
      // Create and initialize the model
      const model = createAIModel(config.provider);
      const aiConfig: AIModelConfig = {
        provider: config.provider,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        resourceName: config.resourceName,
        apiVersion: config.apiVersion
      };

      await model.initialize(aiConfig);

      if (!model.isConfigured()) {
        throw new Error('Failed to initialize AI model. Please check your API key.');
      }

      // Build system prompt
      const systemPrompt = `你是一个专业的 STARLIMS 开发 AI 助手。你必须用中文回答所有问题。

STARLIMS 是实验室信息管理系统 (LIMS)。你专长于：
- STARLIMS SSL（服务器脚本语言）- 关键词以冒号开头：:IF, :FOR, :WHILE, :PROCEDURE, :CLASS, :TRY 等
- STARLIMS CS（客户端脚本）- C# 脚本
- STARLIMS DS（数据源）- SQL 查询
- STARLIMS HTML/XFD 表单开发

STARLIMS SSL 语法规则（用于代码分析和生成）：
- 关键词以冒号开头：:PROCEDURE, :ENDPROC, :CLASS, :ENDCLASS, :IF, :ENDIF, :FOR, :ENDFOR, :WHILE, :ENDWHILE, :TRY, :CATCH, :ENDTRY, :FUNCTION, :ENDFUNC, :RETURN, :VAR, :ASSIGN, :DEFAULT, :DECLARE, :PARAMETERS
- 行续接：行尾使用分号
- 字符串函数：Len(), Substr(), At(), Rat(), Left(), Right(), Alltrim(), Ltrim(), Rtrim(), Upper(), Lower()
- 控制流：:IF ... :ELSE ... :ENDIF, :WHILE ... :ENDWHILE, :FOR ... :ENDFOR
- 注释：使用分号作为行内注释

回答要求：
1. 必须用中文回答
2. 简洁且技术性强
3. 适当提供代码示例
4. 关注 STARLIMS 最佳实践
5. 解释代码时展示相关片段
6. 使用正确的 STARLIMS SSL 语法
7. 分析代码时检查语法正确性`;

      // Build messages array with conversation history for context
      const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

      // Add conversation history for context (last 10 messages)
      const recentMessages = conversationHistory.slice(-10);
      for (const msg of recentMessages) {
        messages.push({ role: msg.role, content: msg.content });
      }

      // Add code context if available (multiple references supported)
      if (codeContext.length > 0) {
        const contextParts: string[] = ['The user has provided the following code references:\n'];
        for (const ctx of codeContext) {
          if (ctx.type === 'selection') {
            contextParts.push(`Selected code:\n\`\`\`\n${ctx.content}\n\`\`\``);
          } else {
            contextParts.push(`File: ${ctx.name}\n\`\`\`\n${ctx.content.slice(0, 2000)}\n\`\`\``);
          }
        }
        messages.push({ role: 'user', content: contextParts.join('\n') });
      }

      // Add current prompt
      messages.push({ role: 'user', content: prompt });

      // Call the AI model
      const response = await model.chat({ messages });

      return response.content || 'No response received.';
    } catch (error: any) {
      console.error('AI response error:', error);
      throw new Error(`AI Error: ${error.message || 'Failed to get AI response'}`);
    }
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<StoreAIConfig>({
    provider: config?.provider || 'minimax',
    apiKey: config?.apiKey || '',
    baseUrl: config?.baseUrl || '',
    model: config?.model || '',
    resourceName: config?.resourceName || '',
    apiVersion: config?.apiVersion || ''
  });

  // Provider definitions with metadata
  const PROVIDERS = [
    { value: 'minimax', label: 'MiniMax', icon: '🤖', docs: 'https://platform.minimaxi.com' },
    { value: 'claude', label: 'Claude (Anthropic)', icon: '🧠', docs: 'https://claude.ai' },
    { value: 'openai', label: 'OpenAI', icon: '🔵', docs: 'https://platform.openai.com' },
    { value: 'deepseek', label: 'DeepSeek', icon: '🔮', docs: 'https://platform.deepseek.com' },
    { value: 'kimi', label: 'Kimi (Moonshot)', icon: '🌙', docs: 'https://platform.moonshot.cn' },
    { value: 'qwen', label: 'Qwen (Alibaba)', icon: '🏢', docs: 'https://dashscope.aliyun.com' },
    { value: 'gemini', label: 'Google Gemini', icon: '✨', docs: 'https://ai.google.dev' },
    { value: 'azure-openai', label: 'Azure OpenAI', icon: '☁️', docs: 'https://azure.microsoft.com/en-us/products/ai-services/openai' },
    { value: 'spark', label: 'iFlytek Spark', icon: '⚡', docs: 'https://www.xfyun.cn' },
    { value: 'hunyuan', label: 'Tencent Hunyuan', icon: '🐧', docs: 'https://cloud.tencent.com/product/hunyuan' },
    { value: 'doubao', label: 'ByteDance Doubao', icon: '🎵', docs: 'https://www.volcengine.com' }
  ];

  // Models available per provider
  const PROVIDER_MODELS: Record<string, { value: string; label: string }[]> = {
    'minimax': [
      { value: 'MiniMax-M2.7', label: 'MiniMax-M2.7' },
      { value: 'MiniMax-M2', label: 'MiniMax-M2' }
    ],
    'claude': [
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
      { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
      { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' }
    ],
    'openai': [
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'gpt-4', label: 'GPT-4' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
    ],
    'deepseek': [
      { value: 'deepseek-chat', label: 'DeepSeek Chat' },
      { value: 'deepseek-coder', label: 'DeepSeek Coder' }
    ],
    'kimi': [
      { value: 'moonshot-v1-8k', label: 'Moonshot V1 8K' },
      { value: 'moonshot-v1-32k', label: 'Moonshot V1 32K' },
      { value: 'moonshot-v1-128k', label: 'Moonshot V1 128K' }
    ],
    'qwen': [
      { value: 'qwen-plus', label: 'Qwen Plus' },
      { value: 'qwen-turbo', label: 'Qwen Turbo' },
      { value: 'qwen-max', label: 'Qwen Max' }
    ],
    'gemini': [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' }
    ],
    'azure-openai': [
      { value: '', label: 'Select deployment in Azure portal' }
    ],
    'spark': [
      { value: 'generalv3.5', label: 'General V3.5' },
      { value: 'generalv3', label: 'General V3' },
      { value: 'generalv2', label: 'General V2' }
    ],
    'hunyuan': [
      { value: 'hunyuan-vision', label: 'Hunyuan Vision' },
      { value: 'hunyuan', label: 'Hunyuan' }
    ],
    'doubao': [
      { value: 'doubao-pro-32k', label: 'Doubao Pro 32K' },
      { value: 'doubao-pro-128k', label: 'Doubao Pro 128K' },
      { value: 'doubao-lite-32k', label: 'Doubao Lite 32K' }
    ]
  };

  // Fields to show based on provider
  const showBaseUrl = ['minimax', 'deepseek', 'kimi', 'qwen', 'hunyuan', 'doubao'].includes(settingsForm.provider);
  const showAzureFields = settingsForm.provider === 'azure-openai';
  const showModelDropdown = PROVIDER_MODELS[settingsForm.provider]?.length > 0;

  // Default base URLs for each provider
  const DEFAULT_BASE_URLS: Record<string, string> = {
    'minimax': 'https://api.minimax.chat/v1',
    'deepseek': 'https://api.deepseek.com/v1',
    'kimi': 'https://api.moonshot.cn/v1',
    'qwen': 'https://dashscope.aliyuncs.com/api/v1',
    'hunyuan': 'https://hunyuan.cloud.tencent.com/v1',
    'doubao': 'https://ark.cn-beijing.volces.com/api/v3',
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value as ModelProvider;
    const defaultModel = PROVIDER_MODELS[newProvider]?.[0]?.value || '';
    const providerConfig = savedConfigs?.[newProvider];

    setSettingsForm(prev => ({
      ...prev,
      provider: newProvider,
      model: defaultModel,
      baseUrl: providerConfig?.baseUrl || DEFAULT_BASE_URLS[newProvider] || '',
      apiKey: providerConfig?.apiKey || '',
      resourceName: providerConfig?.resourceName || '',
      apiVersion: providerConfig?.apiVersion || ''
    }));
  };

  const handleSettingsChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setSettingsForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveSettings = () => {
    if (!settingsForm.apiKey.trim()) {
      return;
    }
    setConfig(settingsForm as StoreAIConfig);
    saveCurrentConfig(); // Save to savedConfigs
    setShowSettings(false);
  };

  const handleTestConnection = async () => {
    if (!settingsForm.apiKey.trim()) return;

    try {
      const model = createAIModel(settingsForm.provider);
      const aiConfig: AIModelConfig = {
        provider: settingsForm.provider,
        apiKey: settingsForm.apiKey,
        baseUrl: settingsForm.baseUrl,
        model: settingsForm.model,
        resourceName: settingsForm.resourceName,
        apiVersion: settingsForm.apiVersion
      };
      await model.initialize(aiConfig);
      const success = await model.test();
      if (success) {
        alert('Connection successful!');
      } else {
        alert('Connection failed. Please check your API key.');
      }
    } catch (error: any) {
      alert(`Connection failed: ${error.message}`);
    }
  };

  // Show settings form when not configured or settings button clicked
  if (showSettings || !isConfigured) {
    return (
      <div className="h-full flex flex-col p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-slate-700 dark:text-white">AI Settings</h3>
          {(isConfigured || embeddedSettings) && (
            <button
              onClick={() => {
                setShowSettings(false);
                if (embeddedSettings && onCloseSettings) {
                  onCloseSettings();
                }
              }}
              className="icon-button"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="space-y-4 flex-1">
          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Provider</label>
            <select
              name="provider"
              value={settingsForm.provider}
              onChange={handleProviderChange}
              className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-700 dark:text-white text-sm"
            >
              {PROVIDERS.map(p => (
                <option key={p.value} value={p.value}>{p.icon} {p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                name="apiKey"
                value={settingsForm.apiKey}
                onChange={handleSettingsChange}
                placeholder="Enter your API key"
                className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 pr-10 text-slate-700 dark:text-white text-sm placeholder-slate-400 dark:placeholder-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="icon-button absolute right-1 top-1/2 -translate-y-1/2"
                title={showApiKey ? '隐藏' : '显示'}
              >
                {showApiKey ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {showModelDropdown ? (
            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Model</label>
              <select
                name="model"
                value={settingsForm.model}
                onChange={handleSettingsChange}
                className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-700 dark:text-white text-sm"
              >
                {PROVIDER_MODELS[settingsForm.provider]?.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Model</label>
              <input
                type="text"
                name="model"
                value={settingsForm.model}
                onChange={handleSettingsChange}
                placeholder="Enter model name"
                className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-700 dark:text-white text-sm placeholder-slate-400 dark:placeholder-slate-500"
              />
            </div>
          )}

          {showAzureFields && (
            <>
              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Azure Resource Name</label>
                <input
                  type="text"
                  name="resourceName"
                  value={settingsForm.resourceName}
                  onChange={handleSettingsChange}
                  placeholder="e.g., my-resource"
                  className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-700 dark:text-white text-sm placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">API Version</label>
                <input
                  type="text"
                  name="apiVersion"
                  value={settingsForm.apiVersion}
                  onChange={handleSettingsChange}
                  placeholder="e.g., 2024-02-15-preview"
                  className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-700 dark:text-white text-sm placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>
            </>
          )}

          {showBaseUrl && (
            <div>
              <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Base URL (optional)</label>
              <input
                type="text"
                name="baseUrl"
                value={settingsForm.baseUrl}
                onChange={handleSettingsChange}
                placeholder="Leave empty for default"
                className="w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-700 dark:text-white text-sm placeholder-slate-400 dark:placeholder-slate-500"
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleTestConnection}
              disabled={!settingsForm.apiKey.trim()}
              className="px-4 py-2 bg-slate-500 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded text-sm"
            >
              Test Connection
            </button>
            <button
              onClick={handleSaveSettings}
              disabled={!settingsForm.apiKey.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded text-sm flex-1"
            >
              Save & Use
            </button>
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          <p className="mb-1">Get your API key from:</p>
          <a
            href={PROVIDERS.find(p => p.value === settingsForm.provider)?.docs || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 dark:text-blue-400 hover:underline"
          >
            {PROVIDERS.find(p => p.value === settingsForm.provider)?.docs || 'Documentation'}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with Tabs */}
      <div className="panel-header flex-col items-start gap-2">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <span className="text-lg">💬</span>
            <span className="font-medium">AI 助手</span>
            <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-400 rounded">
              {config?.provider || 'minimax'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="icon-button"
              onClick={() => setShowSettings(true)}
              title="AI Settings"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            {activeTab === 'chat' && (
              <button
                className="icon-button"
                onClick={handleClearMessages}
                title="Clear chat"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1 text-xs rounded ${
              activeTab === 'chat'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
            }`}
          >
            💬 助手
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1 text-xs rounded ${
              activeTab === 'code'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
            }`}
          >
            📝 代码编辑
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'code' ? (
        <AICodeEditorPanel />
      ) : (
        <>
          {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-white dark:bg-slate-900">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 dark:text-slate-400 py-8">
            <p>Ask me anything about your STARLIMS code!</p>
            <div className="mt-4 text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <p>💡 Try asking:</p>
              <p>• "Explain this SSL script"</p>
              <p>• "Help me write a data source query"</p>
              <p>• "Review my code for issues"</p>
            </div>
          </div>
        ) : (
          messages.map(message => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : message.role === 'error'
                    ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                <div className="text-xs opacity-70 mb-1">
                  {message.role === 'user' ? 'You' : message.role === 'error' ? 'Error' : 'AI'} • {formatTime(message.timestamp)}
                </div>
                <div className={`text-sm ${message.role === 'user' ? 'whitespace-pre-wrap' : ''}`}>
                  {message.role === 'user' ? (
                    message.content
                  ) : message.role === 'error' ? (
                    <span className="text-red-600 dark:text-red-400">{message.content}</span>
                  ) : (
                    renderMessageContent(message.content)
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        {isGenerating && (
          <div className="flex justify-start">
            <div className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">Thinking...</span>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        </div>
        </>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
        {/* Reference buttons */}
        <div className="flex gap-2 mb-2 flex-wrap">
          <button
            type="button"
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
              inputRef.current?.focus();
            }}
            className={`px-3 py-1 text-xs ${codeContext.some(c => c.type === 'selection') ? 'bg-blue-200 dark:bg-blue-800 border-blue-400' : 'bg-slate-200 dark:bg-slate-600 border-slate-300 dark:border-slate-500'} hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 rounded border`}
            title="引用编辑器中选中的代码（可选）"
          >
            📋 引用选中
          </button>
          <button
            type="button"
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
              inputRef.current?.focus();
            }}
            className={`px-3 py-1 text-xs ${codeContext.some(c => c.type === 'file') ? 'bg-blue-200 dark:bg-blue-800 border-blue-400' : 'bg-slate-200 dark:bg-slate-600 border-slate-300 dark:border-slate-500'} hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 rounded border`}
            title="引用当前文件内容（可选）"
          >
            📄 引用文件
          </button>
          {codeContext.length > 0 && (
            <button
              type="button"
              onClick={() => setCodeContext([])}
              className="px-3 py-1 text-xs bg-red-100 dark:bg-red-900 hover:bg-red-200 dark:hover:bg-red-800 text-red-600 dark:text-red-300 rounded border border-red-300 dark:border-red-700"
              title="Clear all code references"
            >
              ✕ 清除全部 ({codeContext.length})
            </button>
          )}
        </div>
        {codeContext.length > 0 && (
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-h-20 overflow-y-auto">
            📎 已引用 {codeContext.length} 项: {codeContext.map(c => c.name).join(', ')}
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="直接提问，无需引用..."
            className="flex-1 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-sm text-slate-700 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500"
            rows={1}
            disabled={isGenerating}
          />
          <button
            type="submit"
            disabled={!input.trim() || isGenerating}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded font-medium text-sm transition-colors"
          >
            {isGenerating ? (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
