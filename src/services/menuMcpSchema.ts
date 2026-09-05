import * as z from 'zod/v4';

export const menuSchemas = {
  get_menu_configuration: z.object({ group: z.string().trim().min(1).max(32).optional(), itemName: z.string().trim().min(1).max(32).optional() }).strict(),
  plan_menu_item: z.object({
    group: z.string().trim().min(1).max(32), itemName: z.string().trim().min(1).max(32),
    formUri: z.string().regex(/^\/Applications\/[^/]+\/[^/]+\/HTMLForms\/XML\/[^/]+$/),
    captions: z.record(z.string().regex(/^[A-Z]{2,3}$/), z.string().trim().min(1).max(200)).refine(x => Object.keys(x).length > 0),
    roles: z.array(z.string().trim().min(1)).min(1).max(100),
    position: z.number().int().positive().optional(),
    parameterScript: z.string().max(20000).default(''),
  }).strict(),
  apply_menu_item: z.object({ planId: z.string().uuid() }).strict()
};
export type MenuInput = z.infer<typeof menuSchemas.plan_menu_item>;
export const MENU_WORKFLOW_INSTRUCTIONS = 'After completing and runtime-validating a new HTML page, ask whether to add it to the STARLIMS menu. Collect existing group, internal item name, localized captions, parameters and allowed roles; reuse explicit answers. Use get_menu_configuration then plan_menu_item and show its concrete result before apply_menu_item. Do not assume preview login role grants menu access. Never claim menu acceptance until the actual menu is refreshed and its entry opens the correct page under the requested role. First version creates HTML Application entries in existing groups; it does not overwrite existing items.';
