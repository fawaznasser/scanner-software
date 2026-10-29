"use client";

import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

type Props = {
  children: ReactNode;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
};
function optionText(node: ReactNode): string {
  return Children.toArray(node).map((child) => isValidElement<{ children?: ReactNode }>(child) ? optionText(child.props.children) : String(child)).join("");
}

/** Styled listbox with native-select-compatible option children and value callbacks. */
export default function Dropdown({ children, value, defaultValue, onChange, disabled, "aria-label": label, "aria-describedby": describedBy }: Props) {
  const options = Children.toArray(children).filter(isValidElement).map((child) => {
    const props = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
    const text = optionText(props.children);
    return { value: String(props.value ?? text), label: text, disabled: !!props.disabled };
  });
  const [internalValue, setInternalValue] = useState(String(defaultValue ?? options[0]?.value ?? ""));
  const selectedValue = String(value ?? internalValue);
  const selected = options.findIndex((option) => option.value === selectedValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 300 });
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const menuId = useId();
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter((index) => index >= 0);

  const show = () => {
    const button = trigger.current;
    if (!button || disabled || button.closest("fieldset")?.disabled) return;
    const rect = button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const upward = below < Math.min(options.length * 46 + 12, 240) && above > below;
    const maxHeight = Math.max(60, Math.min(304, upward ? above : below));
    const height = Math.min(options.length * 46 + 12, maxHeight);
    const width = Math.min(Math.max(rect.width, 170), window.innerWidth - 24);
    const dialog = button.closest("dialog");
    // Keep menus inside the top layer when the field is in a modal dialog.
    setPortalHost(dialog ?? document.body);
    setPosition({ top: upward ? rect.top - height - 6 : rect.bottom + 6, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width, maxHeight });
    setActive(selected >= 0 ? selected : enabled[0] ?? 0);
    setOpen(true);
  };

  const choose = (index: number) => {
    if (!options[index] || options[index].disabled) return;
    setInternalValue(options[index].value);
    onChange?.({ target: { value: options[index].value } });
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    const scroll = (event: Event) => { if (!menu.current?.contains(event.target as Node)) close(); };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", scroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const keyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Tab") { setOpen(false); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      if (!open) { show(); return; }
      const index = enabled.indexOf(active);
      setActive(event.key === "Home" ? enabled[0] : event.key === "End" ? enabled[enabled.length - 1] : enabled[(index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length] ?? 0);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active); else show();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      search.current = { text: now - search.current.time < 600 ? search.current.text + event.key.toLowerCase() : event.key.toLowerCase(), time: now };
      if (!open) show();
      const found = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(search.current.text));
      if (found >= 0) setActive(found);
    }
  };

  return <span className="dms-dropdown">
    <button ref={trigger} type="button" className="dms-dropdown-trigger" role="combobox" aria-label={label}
      aria-describedby={describedBy} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined}
      aria-activedescendant={open ? `${menuId}-${active}` : undefined} disabled={disabled}
      onKeyDown={keyboard} onClick={() => open ? setOpen(false) : show()} onBlur={(event) => {
        if (!menu.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}>
      <span>{options[selected]?.label ?? "Select an option"}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && portalHost && createPortal(<div ref={menu} id={menuId} role="listbox" aria-label={label ?? "Options"}
      className="dms-dropdown-menu" style={position} onPointerDown={(event) => event.preventDefault()}>
      {options.map((option, index) => <div key={`${option.value}-${index}`} id={`${menuId}-${index}`} role="option"
        aria-selected={option.value === selectedValue} aria-disabled={option.disabled || undefined} data-option-index={index}
        data-active={active === index} className="dms-dropdown-option"
        onMouseEnter={() => { if (!option.disabled) setActive(index); }} onClick={() => choose(index)}>
        <span>{option.label}</span>{option.value === selectedValue && <Check size={17} aria-hidden="true" />}
      </div>)}
    </div>, portalHost)}
  </span>;
}
