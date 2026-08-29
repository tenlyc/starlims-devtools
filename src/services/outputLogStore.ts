import { create } from 'zustand';
import type { DiagnosticLogChannel } from '../types/diagnosticLog';

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

export type LogChannel = DiagnosticLogChannel;

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'success' | 'script';
  message: string;
  source?: string;
  channel: LogChannel;
  queryResult?: QueryResult;
  diff?: DiffEntry;
}

interface OutputLogState {
  entries: LogEntry[];
  addEntry: (entry: Omit<LogEntry, 'id' | 'timestamp' | 'channel'> & { channel?: LogChannel }) => void;
  addQueryResult: (message: string, result: QueryResult) => void;
  addDiff: (message: string, diff: DiffEntry) => void;
  clearEntries: () => void;
  clearChannel: (channel: LogChannel) => void;
  setEntries: (entries: LogEntry[]) => void;
}

export function inferLogChannel(source?: string): LogChannel {
  const normalized = (source || '').toLowerCase();
  if (normalized.includes('ssl') || normalized.includes('language server')) return 'ssl-language';
  if (normalized.includes('mcp tool')) return 'mcp-tools';
  if (normalized.includes('mcp')) return 'mcp-server';
  if (normalized.includes('api')) return 'starlims-api';
  if (normalized.includes('codex') || normalized.includes('claude') || normalized.includes('agent')) return 'ai-runtime';
  return 'starlims-operation';
}

export const useOutputLogStore = create<OutputLogState>((set) => ({
  entries: [],

  addEntry: (entry) => {
    const newEntry: LogEntry = {
      ...entry,
      channel: entry.channel || inferLogChannel(entry.source),
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };
    set((state) => ({
      entries: [...state.entries, newEntry].slice(-2000)
    }));
  },

  addQueryResult: (message: string, result: QueryResult) => {
    const newEntry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level: 'info',
      message,
      source: 'SQL',
      channel: 'starlims-operation',
      queryResult: result
    };
    set((state) => ({
      entries: [...state.entries, newEntry].slice(-2000)
    }));
  },

  addDiff: (message: string, diff: DiffEntry) => {
    const newEntry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level: 'warning',
      message,
      source: 'Diff',
      channel: 'starlims-operation',
      diff
    };
    set((state) => ({
      entries: [...state.entries, newEntry].slice(-2000)
    }));
  },

  clearEntries: () => {
    set({ entries: [] });
  },

  clearChannel: (channel) => {
    set((state) => ({ entries: state.entries.filter((entry) => entry.channel !== channel) }));
  },

  setEntries: (entries) => {
    set({ entries });
  }
}));
