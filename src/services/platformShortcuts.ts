export type DesktopPlatform = 'mac' | 'windows' | 'linux';

export function desktopPlatform(userAgent?: string, platform?: string): DesktopPlatform {
  const value = `${platform || ''} ${userAgent || ''}`.toLowerCase();
  if (/mac|iphone|ipad|ipod/.test(value)) return 'mac';
  if (/win/.test(value)) return 'windows';
  return 'linux';
}

export function currentDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === 'undefined') return 'linux';
  return desktopPlatform(navigator.userAgent, navigator.platform);
}

export function primaryShortcut(keys: string, platform = currentDesktopPlatform()): string {
  if (platform === 'mac') {
    return keys
      .replace(/CtrlOrCmd\+/gi, '⌘')
      .replace(/Shift\+/gi, '⇧')
      .replace(/Alt\+/gi, '⌥');
  }
  return keys.replace(/CtrlOrCmd\+/gi, 'Ctrl+');
}

export function hasPrimaryModifier(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>): boolean {
  return event.ctrlKey || event.metaKey;
}
