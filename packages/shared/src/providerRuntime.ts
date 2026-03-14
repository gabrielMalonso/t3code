import { TOOL_LIFECYCLE_ITEM_TYPES, type ToolLifecycleItemType } from "@t3tools/contracts";

export function isToolLifecycleItemType(value: string): value is ToolLifecycleItemType {
  return TOOL_LIFECYCLE_ITEM_TYPES.includes(value as ToolLifecycleItemType);
}
