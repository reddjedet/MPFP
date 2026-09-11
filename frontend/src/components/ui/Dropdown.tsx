import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronDown, CheckCircle2 } from 'lucide-react';

export interface DropdownOption<T extends string | number = string> {
  value: T;
  label?: string;
  badge?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface DropdownProps<T extends string | number = string> {
  value: T;
  options: (DropdownOption<T> | T)[];
  onChange: (value: T) => void;
  title?: string;
  icon?: React.ReactNode;
  placeholder?: string;
  align?: 'left' | 'right';
  size?: 'sm' | 'md';
  minWidth?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  accentColor?: 'blue' | 'emerald';
  disabled?: boolean;
}

export function Dropdown<T extends string | number = string>({
  value,
  options,
  onChange,
  title,
  icon,
  placeholder = 'Seleccionar...',
  align = 'left',
  size = 'md',
  minWidth,
  className = '',
  buttonClassName = '',
  menuClassName = '',
  accentColor = 'blue',
  disabled = false,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalizar opciones a formato objeto
  const normalizedOptions: DropdownOption<T>[] = options.map((opt) => {
    if (typeof opt === 'object' && opt !== null && 'value' in opt) {
      return opt as DropdownOption<T>;
    }
    const val = opt as T;
    return {
      value: val,
      label: typeof val === 'string' ? val.replace(/_/g, ' ').toUpperCase() : String(val),
    };
  });

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);
  const displayLabel =
    selectedOption?.label ||
    (typeof value === 'string'
      ? value.replace(/_/g, ' ').toUpperCase()
      : String(value || placeholder));

  // Cierre por clic exterior y tecla Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }, []);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClickOutside, handleKeyDown]);

  const handleSelect = (optValue: T) => {
    setIsOpen(false);
    if (optValue !== value) {
      onChange(optValue);
    }
  };

  const heightClass = size === 'sm' ? 'h-9 text-xs pl-3 pr-8' : 'h-10 text-xs pl-3.5 pr-9';
  const alignClass = align === 'right' ? 'right-0' : 'left-0';

  const isEmerald = accentColor === 'emerald';
  const ringFocusClass = isEmerald ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-blue-500 ring-2 ring-blue-500/20';
  const chevronActiveClass = isEmerald ? 'rotate-180 text-emerald-500' : 'rotate-180 text-blue-500';
  const optionSelectedClass = isEmerald
    ? 'bg-emerald-600/20 text-emerald-400 border-l-2 border-emerald-500'
    : 'bg-blue-600/20 text-blue-400 border-l-2 border-blue-500';
  const checkIconColor = isEmerald ? 'text-emerald-400' : 'text-blue-400';
  const badgeColor = isEmerald ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400';

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ${isOpen ? 'z-50' : 'z-30'} ${className}`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        style={minWidth ? { minWidth } : undefined}
        className={`${heightClass} bg-[#13141a] hover:bg-white/5 border border-white/10 rounded-xl font-bold text-white transition-all flex items-center justify-between gap-2 shadow-sm cursor-pointer text-left outline-none ${
          isOpen ? ringFocusClass : 'hover:border-white/20'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${buttonClassName}`}
      >
        <div className="flex items-center gap-2 truncate">
          {icon && <span className="text-zinc-400 flex-shrink-0">{icon}</span>}
          <span className="truncate">{displayLabel}</span>
          {selectedOption?.badge && (
            <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded ${badgeColor}`}>
              {selectedOption.badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 transition-transform duration-200 pointer-events-none ${
            isOpen ? chevronActiveClass : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className={`absolute ${alignClass} top-full mt-1.5 min-w-[210px] w-full max-h-64 overflow-y-auto bg-[#16171d] border border-white/15 rounded-xl shadow-2xl shadow-black/90 py-1.5 z-50 backdrop-blur-xl flex flex-col gap-0.5 custom-scrollbar ${menuClassName}`}
        >
          {title && (
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 border-b border-white/5">
              {title}
            </div>
          )}
          {normalizedOptions.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                disabled={opt.disabled}
                onClick={() => handleSelect(opt.value)}
                className={`w-full px-3.5 py-2 text-xs font-bold text-left flex items-center justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? optionSelectedClass
                    : 'text-zinc-300 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
                } ${opt.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center gap-2 truncate">
                  {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                  <span className="truncate">{opt.label}</span>
                  {opt.badge && (
                    <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-zinc-800 text-zinc-400 rounded">
                      {opt.badge}
                    </span>
                  )}
                </div>
                {isSelected && (
                  <CheckCircle2 className={`w-3.5 h-3.5 flex-shrink-0 ml-2 ${checkIconColor}`} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
