import { useMemo, useState } from 'react';
import { editorStore } from '../../stores/editorStore';
import { DiagnosticLevel, EditorDiagnostic, useDiagnosticStore } from '../../services/diagnosticStore';
import { useI18n } from '../../i18n';

type ProblemFilter = 'all' | DiagnosticLevel;
type ProblemScope = 'current' | 'open';

const levelIcon: Record<DiagnosticLevel, string> = {
  error: '●',
  warning: '▲',
  info: '●'
};

const levelColor: Record<DiagnosticLevel, string> = {
  error: 'text-red-500 dark:text-[#f14c4c]',
  warning: 'text-amber-500 dark:text-[#cca700]',
  info: 'text-blue-500 dark:text-[#3794ff]'
};

export function ProblemsPanel() {
  const { t } = useI18n();
  const diagnosticsByUri = useDiagnosticStore((state) => state.diagnosticsByUri);
  const openFiles = editorStore((state) => state.openFiles);
  const activeFileUri = editorStore((state) => state.activeFileUri);
  const [filter, setFilter] = useState<ProblemFilter>('all');
  const [scope, setScope] = useState<ProblemScope>('current');

  const openDiagnostics = useMemo(() => openFiles.flatMap((file) =>
    (diagnosticsByUri[file.uri] || []).map((diagnostic) => ({ diagnostic, file }))
  ), [diagnosticsByUri, openFiles]);

  const counts = useMemo(() => ({
    all: openDiagnostics.length,
    error: openDiagnostics.filter(({ diagnostic }) => diagnostic.level === 'error').length,
    warning: openDiagnostics.filter(({ diagnostic }) => diagnostic.level === 'warning').length,
    info: openDiagnostics.filter(({ diagnostic }) => diagnostic.level === 'info').length
  }), [openDiagnostics]);

  const visible = openDiagnostics.filter(({ diagnostic, file }) =>
    (scope === 'open' || file.uri === activeFileUri) &&
    (filter === 'all' || diagnostic.level === filter)
  );

  const groups = openFiles.map((file) => ({
    file,
    items: visible.filter((item) => item.file.uri === file.uri)
  })).filter((group) => group.items.length > 0);

  const reveal = (diagnostic: EditorDiagnostic) => {
    editorStore.getState().revealLocation({
      uri: diagnostic.uri,
      line: diagnostic.line,
      column: diagnostic.column
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-9 items-center justify-between border-b border-slate-300 px-3 dark:border-[#2b2b2b]">
        <div className="flex items-center gap-1">
          {(['all', 'error', 'warning', 'info'] as const).map((level) => (
            <button
              key={level}
              className={`rounded px-2 py-1 text-xs ${filter === level ? 'bg-slate-300 text-slate-900 dark:bg-[#37373d] dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-[#969696] dark:hover:text-white'}`}
              onClick={() => setFilter(level)}
            >
              {t(`problems.${level}`)} <span className="ml-1 opacity-70">{counts[level]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center rounded border border-slate-300 p-0.5 dark:border-[#3c3c3c]">
          {(['current', 'open'] as const).map((value) => (
            <button
              key={value}
              className={`rounded px-2 py-0.5 text-[11px] ${scope === value ? 'bg-slate-300 text-slate-900 dark:bg-[#3c3c3c] dark:text-white' : 'text-slate-500 dark:text-[#969696]'}`}
              onClick={() => setScope(value)}
            >
              {t(`problems.scope.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto font-mono text-xs">
        {groups.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-500 dark:text-[#858585]">
            {t(scope === 'current' ? 'problems.emptyCurrent' : 'problems.emptyOpen')}
          </div>
        ) : groups.map(({ file, items }) => (
          <div key={file.uri}>
            <div className="sticky top-0 flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-1.5 font-sans text-xs text-slate-700 dark:border-[#2b2b2b] dark:bg-[#1e1e1e] dark:text-[#cccccc]">
              <span>▾</span>
              <span className="font-medium">{file.name}</span>
              <span className="truncate text-slate-400 dark:text-[#858585]">{file.uri}</span>
              <span className="ml-auto rounded-full bg-slate-300 px-1.5 text-[10px] dark:bg-[#3c3c3c]">{items.length}</span>
            </div>
            {items.map(({ diagnostic }) => (
              <button
                key={diagnostic.id}
                className="flex w-full items-start gap-2 border-b border-slate-100 px-5 py-1.5 text-left hover:bg-slate-200 dark:border-[#252525] dark:hover:bg-[#2a2d2e]"
                onClick={() => reveal(diagnostic)}
                title={`${file.name}:${diagnostic.line}:${diagnostic.column}`}
              >
                <span className={`${levelColor[diagnostic.level]} mt-0.5 shrink-0`}>{levelIcon[diagnostic.level]}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-[#cccccc]">{diagnostic.message}</span>
                <span className="shrink-0 text-slate-400 dark:text-[#858585]">
                  {diagnostic.code ? `${diagnostic.source}(${diagnostic.code}) ` : `${diagnostic.source} `}
                  [{t('problems.line')} {diagnostic.line}, {t('problems.column')} {diagnostic.column}]
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
