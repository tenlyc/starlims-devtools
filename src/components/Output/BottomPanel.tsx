import { useMemo, useState } from 'react';
import { useDiagnosticStore } from '../../services/diagnosticStore';
import { editorStore } from '../../stores/editorStore';
import { useI18n } from '../../i18n';
import { OutputEntriesPanel } from './OutputPanel';
import { ProblemsPanel } from './ProblemsPanel';
import { ServerLogPanel } from './ServerLogPanel';

type BottomTab = 'problems' | 'output' | 'serverLog';

export function BottomPanel({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<BottomTab>('problems');
  const diagnosticsByUri = useDiagnosticStore((state) => state.diagnosticsByUri);
  const openFiles = editorStore((state) => state.openFiles);
  const problemCount = useMemo(() => openFiles.reduce((total, file) =>
    total + (diagnosticsByUri[file.uri]?.length || 0), 0
  ), [diagnosticsByUri, openFiles]);

  return (
    <div className="flex h-full flex-col bg-[#f3f3f3] dark:bg-[#181818]">
      <div className="flex min-h-9 items-center justify-between border-b border-[#d4d4d4] px-2 dark:border-[#2b2b2b]">
        <div className="flex h-full items-center">
          {(['problems', 'output', 'serverLog'] as const).map((tab) => (
            <button
              key={tab}
              className={`h-9 border-b-2 px-3 text-xs ${activeTab === tab ? 'border-blue-500 text-slate-900 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-[#969696] dark:hover:text-white'}`}
              onClick={() => setActiveTab(tab)}
            >
              {t(`bottomPanel.${tab}`)}
              {tab === 'problems' && problemCount > 0 && <span className="ml-1.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] text-white">{problemCount}</span>}
            </button>
          ))}
        </div>
        <button className="icon-button text-xl leading-none" onClick={onClose} title={t('bottomPanel.close')}>×</button>
      </div>

      <div className="min-h-0 flex-1">
        {activeTab === 'problems' && <ProblemsPanel />}
        {activeTab === 'output' && <OutputEntriesPanel embedded />}
        {activeTab === 'serverLog' && <ServerLogPanel />}
      </div>
    </div>
  );
}
