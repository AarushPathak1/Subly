"use client";

import { useState, useRef, useEffect } from "react";
import universityNames from "@/lib/university-names.json";

interface Props {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}

export function UniversityCombobox({ name, defaultValue = "", placeholder = "e.g. University of Texas at Austin", className = "" }: Props) {
  const [query, setQuery] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim().length < 2
    ? []
    : (universityNames as string[])
        .filter((n) => n.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || !filtered.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      setQuery(filtered[highlighted]);
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Hidden input carries the actual form value */}
      <input type="hidden" name={name} value={query} />

      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className={className}
      />

      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {filtered.map((name, i) => (
            <li
              key={name}
              onMouseDown={(e) => {
                e.preventDefault();
                setQuery(name);
                setOpen(false);
              }}
              onMouseEnter={() => setHighlighted(i)}
              className={`px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                i === highlighted ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
