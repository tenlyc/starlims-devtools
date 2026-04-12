import { create } from 'zustand';

export interface QueryResult {
  columns: string[];
  rows: Record<string, string | number | null>[];
  rowCount: number;
}

export interface DiffEntry {
  fileName: string;
  remoteContent: string;
  localContent: string;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'success' | 'script';
  message: string;
  source?: string;
  queryResult?: QueryResult;
  diff?: DiffEntry;
}

interface OutputLogState {
  entries: LogEntry[];
  addEntry: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  addQueryResult: (message: string, result: QueryResult) => void;
  addDiff: (message: string, diff: DiffEntry) => void;
  clearEntries: () => void;
  setEntries: (entries: LogEntry[]) => void;
}

export const useOutputLogStore = create<OutputLogState>((set) => ({
  entries: [],

  addEntry: (entry) => {
    const newEntry: LogEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };
    set((state) => ({
      entries: [...state.entries, newEntry]
    }));
  },

  addQueryResult: (message: string, result: QueryResult) => {
    const newEntry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level: 'info',
      message,
      source: 'SQL',
      queryResult: result
    };
    set((state) => ({
      entries: [...state.entries, newEntry]
    }));
  },

  addDiff: (message: string, diff: DiffEntry) => {
    const newEntry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level: 'warning',
      message,
      source: 'Diff',
      diff
    };
    set((state) => ({
      entries: [...state.entries, newEntry]
    }));
  },

  clearEntries: () => {
    set({ entries: [] });
  },

  setEntries: (entries) => {
    set({ entries });
  }
}));
