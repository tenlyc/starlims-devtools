import { getProfileTools } from '@tenlyc/starlims-mcp';
import * as z from 'zod/v4';
// Agent cache behavior is derived from the shared contracts, never registered here.
export const VISUAL_GENERIC_TOOLS = getProfileTools('devtools')
  .filter(tool => tool.capability.startsWith('forms.preview.'))
  .map(tool => {
    const { $schema: _schema, ...parameters } = z.toJSONSchema(tool.inputSchema) as Record<string, unknown>;
    return { name: tool.id, description: tool.description, parameters, readOnly: tool.risk === 'read' };
  });
