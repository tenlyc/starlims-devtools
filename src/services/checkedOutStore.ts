import { create } from 'zustand';

let refreshFn: (() => void) | null = null;

export function registerCheckedOutRefresh(fn: () => void) {
  refreshFn = fn;
}

export function triggerCheckedOutRefresh() {
  if (refreshFn) {
    refreshFn();
  }
}
