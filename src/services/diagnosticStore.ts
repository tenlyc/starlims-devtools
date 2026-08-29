import { create } from 'zustand';

export type DiagnosticLevel = 'error' | 'warning' | 'info';

export interface EditorDiagnostic {
  id: string;
  uri: string;
  level: DiagnosticLevel;
  message: string;
  source: string;
  code?: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

interface DiagnosticState {
  diagnosticsByUri: Record<string, EditorDiagnostic[]>;
  setDiagnostics: (uri: string, diagnostics: EditorDiagnostic[]) => void;
  clearDiagnostics: (uri: string) => void;
}

export const useDiagnosticStore = create<DiagnosticState>((set) => ({
  diagnosticsByUri: {},
  setDiagnostics: (uri, diagnostics) => set((state) => ({
    diagnosticsByUri: { ...state.diagnosticsByUri, [uri]: diagnostics }
  })),
  clearDiagnostics: (uri) => set((state) => {
    const next = { ...state.diagnosticsByUri };
    delete next[uri];
    return { diagnosticsByUri: next };
  })
}));
