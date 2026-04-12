import { EnterpriseTree } from './EnterpriseTree';
import { CheckedOutTree } from './CheckedOutTree';

export function Sidebar() {
  return (
    <div className="h-full flex flex-col">
      {/* Enterprise Tree - Top Half */}
      <div className="flex-1 overflow-auto border-b border-slate-300 dark:border-slate-700">
        <EnterpriseTree />
      </div>

      {/* Checked Out Tree - Bottom Half */}
      <div className="flex-1 overflow-auto">
        <CheckedOutTree />
      </div>
    </div>
  );
}
