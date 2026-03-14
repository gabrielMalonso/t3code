import { type ModelSlug, type ProviderKind } from "@t3tools/contracts";
import { normalizeModelSlug } from "@t3tools/shared/model";
import { memo, useState } from "react";
import { type ProviderPickerKind, PROVIDER_OPTIONS } from "../../session-logic";
import { ChevronDownIcon, StarIcon } from "lucide-react";
import type { FavoriteModel } from "../../appSettings";
import { Button } from "../ui/button";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator as MenuDivider,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../ui/menu";
import { ClaudeAI, CursorIcon, Gemini, Icon, OpenAI, OpenCodeIcon } from "../Icons";
import { cn } from "~/lib/utils";

function isAvailableProviderOption(option: (typeof PROVIDER_OPTIONS)[number]): option is {
  value: ProviderKind;
  label: string;
  available: true;
} {
  return option.available;
}

function resolveModelForProviderPicker(
  provider: ProviderKind,
  value: string,
  options: ReadonlyArray<{ slug: string; name: string }>,
): ModelSlug | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const direct = options.find((option) => option.slug === trimmedValue);
  if (direct) {
    return direct.slug;
  }

  const byName = options.find((option) => option.name.toLowerCase() === trimmedValue.toLowerCase());
  if (byName) {
    return byName.slug;
  }

  const normalized = normalizeModelSlug(trimmedValue, provider);
  if (!normalized) {
    return null;
  }

  const resolved = options.find((option) => option.slug === normalized);
  if (resolved) {
    return resolved.slug;
  }

  return null;
}

const PROVIDER_ICON_BY_PROVIDER: Record<ProviderPickerKind, Icon> = {
  codex: OpenAI,
  claudeCode: ClaudeAI,
  cursor: CursorIcon,
};

export const AVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter(isAvailableProviderOption);
const UNAVAILABLE_PROVIDER_OPTIONS = PROVIDER_OPTIONS.filter((option) => !option.available);
const COMING_SOON_PROVIDER_OPTIONS = [
  { id: "opencode", label: "OpenCode", icon: OpenCodeIcon },
  { id: "gemini", label: "Gemini", icon: Gemini },
] as const;

export const ProviderModelPicker = memo(function ProviderModelPicker(props: {
  provider: ProviderKind;
  model: ModelSlug;
  lockedProvider: ProviderKind | null;
  modelOptionsByProvider: Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>>;
  compact?: boolean;
  disabled?: boolean;
  favoriteModel?: FavoriteModel | null;
  onProviderModelChange: (provider: ProviderKind, model: ModelSlug) => void;
  onToggleFavorite?: (provider: ProviderKind, model: ModelSlug) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const selectedProviderOptions = props.modelOptionsByProvider[props.provider];
  const selectedModelLabel =
    selectedProviderOptions.find((option) => option.slug === props.model)?.name ?? props.model;
  const ProviderIcon = PROVIDER_ICON_BY_PROVIDER[props.provider];

  return (
    <Menu
      open={isMenuOpen}
      onOpenChange={(open) => {
        if (props.disabled) {
          setIsMenuOpen(false);
          return;
        }
        setIsMenuOpen(open);
      }}
    >
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "min-w-0 shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80",
              props.compact ? "max-w-42" : "sm:px-3",
            )}
            disabled={props.disabled}
          />
        }
      >
        <span
          className={cn("flex min-w-0 items-center gap-2", props.compact ? "max-w-36" : undefined)}
        >
          <ProviderIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/70" />
          <span className="truncate">{selectedModelLabel}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3 opacity-60" />
        </span>
      </MenuTrigger>
      <MenuPopup align="start">
        {AVAILABLE_PROVIDER_OPTIONS.map((option) => {
          const OptionIcon = PROVIDER_ICON_BY_PROVIDER[option.value];
          const isDisabledByProviderLock =
            props.lockedProvider !== null && props.lockedProvider !== option.value;
          return (
            <MenuSub key={option.value}>
              <MenuSubTrigger disabled={isDisabledByProviderLock}>
                <OptionIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground/85"
                />
                {option.label}
              </MenuSubTrigger>
              <MenuSubPopup className="[--available-height:min(24rem,70vh)]">
                <MenuGroup>
                  <MenuRadioGroup
                    value={props.provider === option.value ? props.model : ""}
                    onValueChange={(value) => {
                      if (props.disabled) return;
                      if (isDisabledByProviderLock) return;
                      if (!value) return;
                      const resolvedModel = resolveModelForProviderPicker(
                        option.value,
                        value,
                        props.modelOptionsByProvider[option.value],
                      );
                      if (!resolvedModel) return;
                      props.onProviderModelChange(option.value, resolvedModel);
                      setIsMenuOpen(false);
                    }}
                  >
                    {props.modelOptionsByProvider[option.value].map((modelOption) => {
                      const isFavorite =
                        props.favoriteModel?.provider === option.value &&
                        props.favoriteModel?.model === modelOption.slug;
                      return (
                        <MenuRadioItem
                          key={`${option.value}:${modelOption.slug}`}
                          value={modelOption.slug}
                          onClick={() => setIsMenuOpen(false)}
                        >
                          <span className="inline-flex w-full items-center gap-2">
                            <span className="flex-1 truncate">{modelOption.name}</span>
                            {props.onToggleFavorite && (
                              <button
                                type="button"
                                aria-label={
                                  isFavorite
                                    ? `Remove ${modelOption.name} as default`
                                    : `Set ${modelOption.name} as default`
                                }
                                className={cn(
                                  "shrink-0 rounded-sm p-0.5 transition-colors pointer-events-auto",
                                  isFavorite
                                    ? "text-amber-400"
                                    : "text-muted-foreground/30 hover:text-amber-400/70",
                                )}
                                onPointerDown={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  props.onToggleFavorite?.(option.value, modelOption.slug);
                                }}
                              >
                                <StarIcon
                                  aria-hidden="true"
                                  className="size-3.5 shrink-0 pointer-events-none"
                                  {...(isFavorite ? { fill: "currentColor" } : {})}
                                />
                              </button>
                            )}
                          </span>
                        </MenuRadioItem>
                      );
                    })}
                  </MenuRadioGroup>
                </MenuGroup>
              </MenuSubPopup>
            </MenuSub>
          );
        })}
        {UNAVAILABLE_PROVIDER_OPTIONS.length > 0 && <MenuDivider />}
        {UNAVAILABLE_PROVIDER_OPTIONS.map((option) => {
          const OptionIcon = PROVIDER_ICON_BY_PROVIDER[option.value];
          return (
            <MenuItem key={option.value} disabled>
              <OptionIcon
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 opacity-80",
                  option.value === "claudeCode" ? "" : "text-muted-foreground/85",
                )}
              />
              <span>{option.label}</span>
              <span className="ms-auto text-[11px] text-muted-foreground/80 uppercase tracking-[0.08em]">
                Coming soon
              </span>
            </MenuItem>
          );
        })}
        {UNAVAILABLE_PROVIDER_OPTIONS.length === 0 && <MenuDivider />}
        {COMING_SOON_PROVIDER_OPTIONS.map((option) => {
          const OptionIcon = option.icon;
          return (
            <MenuItem key={option.id} disabled>
              <OptionIcon aria-hidden="true" className="size-4 shrink-0 opacity-80" />
              <span>{option.label}</span>
              <span className="ms-auto text-[11px] text-muted-foreground/80 uppercase tracking-[0.08em]">
                Coming soon
              </span>
            </MenuItem>
          );
        })}
      </MenuPopup>
    </Menu>
  );
});
