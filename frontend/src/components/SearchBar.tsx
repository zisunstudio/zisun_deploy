"use client";

import { useState, useCallback, useRef } from "react";
import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
  defaultValue?: string;
  onSearch?: (q: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function SearchBar({ defaultValue = "", onSearch, autoFocus, placeholder = "Search styles…" }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = useCallback(
    debounce((q: string) => onSearch?.(q), 300),
    [onSearch]
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setValue(q);
    debouncedSearch(q);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim()) {
      router.push(`/search?q=${encodeURIComponent(value.trim())}`);
    }
  }

  function clear() {
    setValue("");
    onSearch?.("");
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex items-center">
      <Search className="absolute left-4 w-4 h-4 text-muted pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={handleChange}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-3 rounded-2xl border-2 border-gray-200 bg-white text-sm text-foreground placeholder-gray-400 outline-none focus:border-primary transition-colors"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-3 w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-500"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </form>
  );
}
