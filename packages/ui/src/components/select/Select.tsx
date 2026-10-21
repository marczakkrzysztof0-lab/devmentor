"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";

import { cn } from "../../lib/cn";
import { useFormField } from "../form-field/FormField";

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectGroup = { label: string; options: SelectOption[] };

export type SelectProps = {
  /** Flat list of options… */
  options?: SelectOption[];
  /** …or options in labelled groups (e.g. time zones by region). */
  groups?: SelectGroup[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Shown before anything is chosen; an example, not the name (the name is the FormField label). */
  placeholder?: string;
  /** Form field name: Radix renders a native hidden select so the value is submitted. */
  name?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  "aria-label"?: string;
  /**
   * Extra description ids (e.g. the error of a repeated row, #15 W4/Z26). Added to the FormField description
   * when the select sits in one.
   */
  "aria-describedby"?: string;
  className?: string;
  /** Documentation only: frozen hover/focus preview. */
  "data-preview-state"?: string;
};

const itemClass = cn(
  "relative flex cursor-pointer select-none items-center justify-between gap-in-group rounded-control",
  "px-inside-panel py-in-group text-body text-primary outline-none",
  // Highlight = background AND an inset focus outline: in the dark theme surface-code equals surface-panel (stage 5 finding).
  "data-highlighted:bg-surface-code data-highlighted:outline-2 data-highlighted:-outline-offset-2 data-highlighted:outline-focus-ring",
  "data-disabled:cursor-not-allowed data-disabled:text-muted",
);

function Item({ option }: { option: SelectOption }) {
  return (
    <SelectPrimitive.Item value={option.value} disabled={option.disabled} className={itemClass}>
      <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="inline-flex">
        <Check aria-hidden="true" className="size-icon-sm" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

/** Choose one value from a list that is too long for radio buttons: time zone, start and end hour (#15). */
export function Select({
  options,
  groups,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  name,
  id,
  disabled,
  invalid,
  className,
  ...rest
}: SelectProps) {
  const field = useFormField();
  const isInvalid = invalid ?? field?.invalid ?? false;
  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      name={name}
      disabled={disabled}
      required={field?.required}
    >
      <SelectPrimitive.Trigger
        id={id ?? field?.id}
        aria-label={rest["aria-label"]}
        aria-describedby={[rest["aria-describedby"], field?.describedBy].filter(Boolean).join(" ") || undefined}
        aria-invalid={isInvalid || undefined}
        data-preview-state={rest["data-preview-state"]}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-in-group rounded-control border border-control",
          "bg-surface-panel px-inside-panel py-in-group text-left font-ui text-body text-primary",
          "transition-colors duration-(--ds-duration-control) ease-standard",
          "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus-ring",
          "data-placeholder:text-muted disabled:cursor-not-allowed disabled:bg-surface-code disabled:text-muted",
          isInvalid && "border-status-danger",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown aria-hidden="true" className="size-icon-md shrink-0 text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={cn(
            "z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden",
            "rounded-control border border-control bg-surface-panel font-ui text-primary",
            "transition-opacity duration-(--ds-duration-menu) ease-standard starting:opacity-0",
          )}
        >
          <SelectPrimitive.Viewport className="p-inline">
            {options?.map((option) => <Item key={option.value} option={option} />)}
            {groups?.map((group) => (
              <SelectPrimitive.Group key={group.label}>
                <SelectPrimitive.Label className="px-inside-panel pt-in-group pb-inline text-meta text-muted">
                  {group.label}
                </SelectPrimitive.Label>
                {group.options.map((option) => (
                  <Item key={option.value} option={option} />
                ))}
              </SelectPrimitive.Group>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
