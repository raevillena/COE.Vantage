import * as React from "react";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

export interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  /** Optional "none" choice, e.g. { value: "__none__", label: "Select department" } */
  noneOption?: SearchableSelectOption;
  /** Input and list use this for consistent height with other form controls */
  className?: string;
}

const baseInputClass =
  "w-full rounded border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";
const listClass =
  "absolute z-50 mt-1 max-h-60 w-full min-w-[8rem] overflow-auto rounded border border-border bg-surface py-1 shadow-md focus:outline-none";

export const SearchableSelect = React.forwardRef<HTMLInputElement, SearchableSelectProps>(
  (
    {
      options,
      value,
      onValueChange,
      placeholder = "Search…",
      disabled = false,
      "aria-label": ariaLabel,
      noneOption,
      className = "",
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [highlightIndex, setHighlightIndex] = React.useState(0);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const listRef = React.useRef<HTMLUListElement>(null);

    const allOptions: SearchableSelectOption[] = noneOption ? [noneOption, ...options] : options;
    const selectedOption = allOptions.find((o) => o.value === value);
    const displayLabel = selectedOption?.label ?? "";

    const queryLower = query.trim().toLowerCase();
    const filtered =
      queryLower === ""
        ? allOptions
        : allOptions.filter((o) => o.label.toLowerCase().includes(queryLower));
    const inputValue = open ? query : displayLabel;

    const openList = () => {
      if (disabled) return;
      setOpen(true);
      setQuery("");
      const idx = allOptions.findIndex((o) => o.value === value);
      setHighlightIndex(idx >= 0 ? idx : 0);
    };

    const closeList = () => {
      setOpen(false);
      setQuery("");
    };

    const select = (option: SearchableSelectOption) => {
      onValueChange(option.value);
      closeList();
    };

    React.useEffect(() => {
      if (!open) return;
      const el = listRef.current;
      if (!el) return;
      const item = el.querySelector<HTMLElement>(`[data-index="${highlightIndex}"]`);
      item?.scrollIntoView({ block: "nearest" });
    }, [open, highlightIndex]);

    React.useEffect(() => {
      if (!open) return;
      const handle = (e: MouseEvent) => {
        if (containerRef.current?.contains(e.target as Node)) return;
        closeList();
      };
      document.addEventListener("mousedown", handle);
      return () => document.removeEventListener("mousedown", handle);
    }, [open]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          openList();
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeList();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const opt = filtered[highlightIndex];
        if (opt) select(opt);
        return;
      }
    };

    return (
      <div ref={containerRef} className={`relative ${className}`}>
        <input
          ref={ref}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={open ? "searchable-select-list" : undefined}
          aria-activedescendant={open && filtered[highlightIndex] ? `searchable-select-option-${highlightIndex}` : undefined}
          aria-label={ariaLabel}
          value={inputValue}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
            setHighlightIndex(0);
          }}
          onFocus={openList}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className={baseInputClass}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-60" aria-hidden>
          ▼
        </span>
        {open && (
          <ul
            id="searchable-select-list"
            ref={listRef}
            role="listbox"
            className={listClass}
            style={{ width: containerRef.current?.offsetWidth ?? "auto" }}
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-foreground-muted">No matches</li>
            ) : (
              filtered.map((option, i) => (
                <li
                  key={option.value}
                  id={`searchable-select-option-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={value === option.value}
                  className={`cursor-default select-none px-3 py-2 text-sm text-foreground ${
                    i === highlightIndex ? "bg-surface-hover" : ""
                  } ${value === option.value ? "font-medium" : ""}`}
                  onMouseEnter={() => setHighlightIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(option);
                  }}
                >
                  {option.label}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    );
  }
);
SearchableSelect.displayName = "SearchableSelect";
