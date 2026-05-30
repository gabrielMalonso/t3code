import { ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import { memo, type ReactNode } from "react";
import { EllipsisIcon, ListTodoIcon, Minimize2Icon } from "lucide-react";
import { Button } from "../ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator as MenuDivider,
  MenuTrigger,
} from "../ui/menu";

export const CompactComposerControlsMenu = memo(function CompactComposerControlsMenu(props: {
  activePlan: boolean;
  interactionMode: ProviderInteractionMode;
  loopMenuContent?: ReactNode;
  planSidebarLabel?: string;
  planSidebarOpen: boolean;
  runtimeMode: RuntimeMode;
  showInteractionModeToggle: boolean;
  traitsMenuContent?: ReactNode;
  compactContextDisabled?: boolean;
  pointNShootBridgeEnabled?: boolean;
  onCompactContext?: () => void;
  onPointNShootBridgeEnabledChange?: (enabled: boolean) => void;
  onToggleInteractionMode: () => void;
  onTogglePlanSidebar: () => void;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 px-2 text-muted-foreground/70 hover:text-foreground/80"
            aria-label="More composer controls"
          />
        }
      >
        <EllipsisIcon aria-hidden="true" className="size-4" />
      </MenuTrigger>
      <MenuPopup align="start">
        {props.traitsMenuContent ? (
          <>
            {props.traitsMenuContent}
            <MenuDivider />
          </>
        ) : null}
        {props.showInteractionModeToggle ? (
          <>
            <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Mode</div>
            <MenuRadioGroup
              value={props.interactionMode}
              onValueChange={(value) => {
                if (!value || value === props.interactionMode) return;
                props.onToggleInteractionMode();
              }}
            >
              <MenuRadioItem value="default">Chat</MenuRadioItem>
              <MenuRadioItem value="plan">Plan</MenuRadioItem>
            </MenuRadioGroup>
            <MenuDivider />
          </>
        ) : null}
        <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Access</div>
        <MenuRadioGroup
          value={props.runtimeMode}
          onValueChange={(value) => {
            if (!value || value === props.runtimeMode) return;
            props.onRuntimeModeChange(value as RuntimeMode);
          }}
        >
          <MenuRadioItem value="approval-required">Supervised</MenuRadioItem>
          <MenuRadioItem value="auto-accept-edits">Auto-accept edits</MenuRadioItem>
          <MenuRadioItem value="full-access">Full access</MenuRadioItem>
        </MenuRadioGroup>
        {props.onCompactContext || props.onPointNShootBridgeEnabledChange ? (
          <>
            <MenuDivider />
            {props.onCompactContext ? (
              <MenuItem
                disabled={props.compactContextDisabled}
                onClick={() => props.onCompactContext?.()}
              >
                <Minimize2Icon className="size-4 shrink-0" />
                Compact context
              </MenuItem>
            ) : null}
            {props.onPointNShootBridgeEnabledChange ? (
              <MenuCheckboxItem
                checked={props.pointNShootBridgeEnabled ?? false}
                variant="switch"
                onCheckedChange={(checked) =>
                  props.onPointNShootBridgeEnabledChange?.(checked === true)
                }
              >
                Annotations bridge
              </MenuCheckboxItem>
            ) : null}
          </>
        ) : null}
        {props.loopMenuContent ? (
          <>
            <MenuDivider />
            {props.loopMenuContent}
          </>
        ) : null}
        {props.activePlan ? (
          <>
            <MenuDivider />
            <MenuItem onClick={props.onTogglePlanSidebar}>
              <ListTodoIcon className="size-4 shrink-0" />
              {props.planSidebarOpen
                ? `Hide ${(props.planSidebarLabel ?? "plan").toLowerCase()} sidebar`
                : `Show ${(props.planSidebarLabel ?? "plan").toLowerCase()} sidebar`}
            </MenuItem>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
});
