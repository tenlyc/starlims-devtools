import { EnterpriseTree } from './EnterpriseTree';
import { CheckedOutTree } from './CheckedOutTree';

export function Sidebar() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Enterprise Tree - Top Half */}
      <div className="min-h-0 flex-1 overflow-hidden border-b border-[#d4d4d4] dark:border-[#2b2b2b]">
        <EnterpriseTree />
      </div>

      {/* Checked Out Tree - Bottom Half */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <CheckedOutTree />
      </div>
    </div>
  );
}
