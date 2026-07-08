import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

export interface SearchableSelectOption {
  value: string;
  label: string;
  meta?: string;
}

interface SearchableSelectProps {
  label: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  icon?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  icon,
  placeholder = "Search",
  disabled = false
}: SearchableSelectProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOption = options.find((option) => option.value === value);
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const listboxId = `${id}-options`;

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => {
      const searchable = `${option.label} ${option.meta || ""}`.toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [options, query]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  function selectValue(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  return (
    <div className={`search-select ${disabled ? "disabled" : ""}`} ref={rootRef}>
      <span className="search-select-label" id={labelId}>
        {icon}
        {label}
      </span>
      <button
        className={`search-select-control ${open ? "open" : ""}`}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => {
          setOpen((current) => !current);
          setQuery("");
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
            setQuery("");
          }
        }}
      >
        <span className={`search-select-value ${selectedOption ? "" : "placeholder"}`} id={valueId}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open ? (
        <>
          <button
            className="search-select-backdrop"
            type="button"
            aria-label={`Close ${label}`}
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
          />
          <div className="search-select-menu">
            <label className="search-select-search" htmlFor={`${id}-search`}>
              <Search size={16} aria-hidden="true" />
              <input
                id={`${id}-search`}
                ref={inputRef}
                value={query}
                placeholder={`Search ${label.toLowerCase()}`}
                autoComplete="off"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setOpen(false);
                    setQuery("");
                    triggerRef.current?.focus();
                  }
                  if (event.key === "Enter" && filteredOptions[0]) {
                    event.preventDefault();
                    selectValue(filteredOptions[0].value);
                  }
                }}
              />
            </label>
            <div className="search-select-options" id={listboxId} role="listbox">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    type="button"
                    key={`${option.value}-${option.label}`}
                    className={option.value === value ? "selected" : ""}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectValue(option.value)}
                    role="option"
                    aria-selected={option.value === value}
                  >
                    <span>
                      <strong>{option.label}</strong>
                      {option.meta ? <small>{option.meta}</small> : null}
                    </span>
                    {option.value === value ? <Check size={16} aria-hidden="true" /> : null}
                  </button>
                ))
              ) : (
                <p>No matching option</p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
