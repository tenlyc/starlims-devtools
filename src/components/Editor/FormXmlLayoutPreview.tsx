import { useMemo, useState } from 'react';
import type { FormPreviewMode } from '../../types/formPreview';

type XmlControl = {
  id: string;
  type: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
  enabled: boolean;
  backColor?: string;
  foreColor?: string;
  children: XmlControl[];
};

const child = (node: Element, name: string): Element | undefined =>
  Array.from(node.children).find((item) => item.localName === name);

const value = (node: Element, name: string): string => child(node, name)?.textContent?.trim() || '';
const numberValue = (node: Element, name: string, fallback: number): number => {
  const parsed = Number(value(node, name));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nestedItems = (node: Element, containerName: string): Element[] => {
  const container = child(node, containerName);
  return container ? Array.from(container.children).filter((item) => item.localName === 'item') : [];
};

const parseControl = (node: Element, index: number): XmlControl => {
  const xsiType = node.getAttributeNS('http://www.w3.org/2001/XMLSchema-instance', 'type') || node.getAttribute('xsi:type');
  const type = xsiType || value(node, 'xtype').replace(/^Starlims/i, '') || node.localName;
  const controls = nestedItems(node, '__array__Controls');
  const tabItems = nestedItems(node, '__array__Items');
  const panelChildren = ['Panel1', 'Panel2'].flatMap((name) => {
    const panel = child(node, name);
    return panel ? [panel] : [];
  });
  return {
    id: value(node, 'Id') || `${type}-${index}`,
    type,
    text: value(node, 'Text') || value(node, 'Caption') || value(node, 'Label') || '',
    left: numberValue(node, 'Left', 0),
    top: numberValue(node, 'Top', 0),
    width: Math.max(1, numberValue(node, 'Width', 120)),
    height: Math.max(1, numberValue(node, 'Height', 28)),
    visible: value(node, 'Visible').toLowerCase() !== 'false',
    enabled: value(node, 'Enabled').toLowerCase() !== 'false',
    backColor: value(node, 'BackColor') || undefined,
    foreColor: value(node, 'ForeColor') || undefined,
    children: [...controls, ...tabItems, ...panelChildren].map(parseControl)
  };
};

const normalizeColor = (color?: string): string | undefined => {
  if (!color) return undefined;
  const aliases: Record<string, string> = {
    buttonface: '#f3f4f6', buttontext: '#111827', control: '#f3f4f6', controltext: '#111827',
    window: '#ffffff', windowtext: '#111827', transparent: 'transparent'
  };
  return aliases[color.toLowerCase()] || color;
};

function ControlBody({ control }: { control: XmlControl }) {
  const type = control.type.toLowerCase();
  if (/label/.test(type)) return <span className="block truncate px-1 leading-[inherit]">{control.text || control.id}</span>;
  if (/button/.test(type)) return <button className="h-full w-full rounded border border-slate-400 bg-slate-100 px-2 text-xs shadow-sm dark:border-slate-600 dark:bg-slate-700" disabled={!control.enabled}>{control.text || control.id}</button>;
  if (/checkbox/.test(type)) return <label className="flex h-full items-center gap-1 px-1 text-xs"><input type="checkbox" disabled />{control.text || control.id}</label>;
  if (/radio/.test(type)) return <label className="flex h-full items-center gap-1 px-1 text-xs"><input type="radio" disabled />{control.text || control.id}</label>;
  if (/combobox|lookup|dropdown/.test(type)) return <select className="h-full w-full rounded border border-slate-400 bg-white px-1 text-xs dark:border-slate-600 dark:bg-slate-800" disabled><option>{control.text || control.id}</option></select>;
  if (/datetime|dateinput|calendar/.test(type)) return <input className="h-full w-full rounded border border-slate-400 bg-white px-1 text-xs dark:border-slate-600 dark:bg-slate-800" type="date" disabled />;
  if (/textbox|textedit|numeric|memo|richtext/.test(type)) return <input className="h-full w-full rounded border border-slate-400 bg-white px-1 text-xs dark:border-slate-600 dark:bg-slate-800" placeholder={control.text || control.id} disabled />;
  if (/grid|table/.test(type)) return <div className="h-full w-full overflow-hidden rounded border border-slate-400 bg-white text-[10px] dark:border-slate-600 dark:bg-slate-900"><div className="border-b bg-slate-100 px-2 py-1 font-semibold dark:bg-slate-700">{control.text || control.id}</div><div className="grid grid-cols-3 gap-px bg-slate-200 p-px dark:bg-slate-700"><span className="bg-white p-1 dark:bg-slate-900">Column 1</span><span className="bg-white p-1 dark:bg-slate-900">Column 2</span><span className="bg-white p-1 dark:bg-slate-900">Column 3</span></div></div>;
  if (/image|picture/.test(type)) return <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-slate-400 text-xs text-slate-500">Image · {control.id}</div>;
  if (/tabpage/.test(type)) return <div className="h-full w-full rounded border border-slate-400 bg-white pt-6 dark:border-slate-600 dark:bg-slate-900"><div className="absolute left-1 top-1 rounded-t border border-b-0 border-slate-400 bg-slate-100 px-2 py-0.5 text-[10px] dark:border-slate-600 dark:bg-slate-700">{control.text || control.id}</div></div>;
  return control.text ? <div className="truncate px-1 text-[10px] text-slate-500">{control.text}</div> : null;
}

function LayoutControl({ control, mode, selectedId, onSelect }: { control: XmlControl; mode: FormPreviewMode; selectedId?: string; onSelect: (control: XmlControl) => void }) {
  if (!control.visible) return null;
  const type = control.type.toLowerCase();
  const isContainer = control.children.length > 0 || /panel|group|container|tabpage|splitter/.test(type);
  const selected = selectedId === control.id;
  return (
    <div
      data-control-id={control.id}
      title={`${control.id} · ${control.type}`}
      className={`${isContainer ? 'overflow-hidden' : ''} ${mode === 'design' ? 'cursor-pointer' : ''} ${selected ? 'ring-2 ring-blue-500 ring-offset-1' : mode === 'design' ? 'hover:ring-1 hover:ring-blue-400/70' : ''}`}
      style={{
        position: 'absolute', left: control.left, top: control.top, width: control.width, height: control.height,
        color: normalizeColor(control.foreColor), backgroundColor: normalizeColor(control.backColor)
      }}
      onClick={(event) => { if (mode === 'design') { event.stopPropagation(); onSelect(control); } }}
    >
      <ControlBody control={control} />
      {control.children.map((item) => <LayoutControl key={`${control.id}-${item.id}`} control={item} mode={mode} selectedId={selectedId} onSelect={onSelect} />)}
    </div>
  );
}

export function FormXmlLayoutPreview({ xml, mode }: { xml: string; mode: FormPreviewMode }) {
  const [selected, setSelected] = useState<XmlControl | null>(null);
  const parsed = useMemo(() => {
    try {
      const document = new DOMParser().parseFromString(xml, 'application/xml');
      if (document.querySelector('parsererror')) throw new Error(document.querySelector('parsererror')?.textContent || 'Invalid XML');
      const root = document.documentElement;
      return parseControl(root, 0);
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error));
    }
  }, [xml]);

  if (parsed instanceof Error) return <div className="p-5 text-sm text-red-500">Unable to render Form XML: {parsed.message}</div>;
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-200 dark:bg-[#111]">
      <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        Local XML layout · Runtime-independent {mode} preview. Server events and data binding are not executed.
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div
          className="relative mx-auto origin-top-left overflow-hidden border border-slate-400 bg-white shadow-md dark:border-slate-600 dark:bg-slate-900"
          style={{ width: parsed.width, height: parsed.height, minWidth: parsed.width, minHeight: parsed.height }}
          onClick={() => setSelected(null)}
        >
          {parsed.children.map((item) => <LayoutControl key={item.id} control={item} mode={mode} selectedId={selected?.id} onSelect={setSelected} />)}
        </div>
      </div>
      {mode === 'design' && selected && <div className="shrink-0 border-t border-slate-300 bg-white px-3 py-2 text-xs dark:border-[#343434] dark:bg-[#1e1e1e]"><b>{selected.id}</b> · {selected.type} · X {selected.left}, Y {selected.top}, W {selected.width}, H {selected.height}</div>}
    </div>
  );
}
