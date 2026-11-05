import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Search, Plus, Check, X, Loader2 } from 'lucide-react';

/**
 * Modern Searchable Select Component with In-line Creation for INGMELEC Enterprise
 *
 * @param {string} label - Form field label
 * @param {string} value - Currently selected value (string or object key)
 * @param {function} onChange - Callback when selected value changes
 * @param {Array<string|object>} options - Array of options (strings or { label, value, sublabel, badge })
 * @param {string} placeholder - Input placeholder
 * @param {boolean} allowCreate - Enable "+ Agregar nueva opción"
 * @param {function} onCreateNew - Callback when "+ Agregar [text]" is clicked: (newText) => Promise/void
 * @param {boolean} required - Displays required asterisk
 * @param {boolean} loading - Displays loading spinner
 * @param {string} helperText - Small footnote under the field
 * @param {string} emptyText - Message when no matches found
 */
export default function SearchableSelect({
  label,
  value,
  onChange,
  options = [],
  placeholder = 'Seleccione o busque una opción...',
  allowCreate = false,
  onCreateNew = null,
  required = false,
  loading = false,
  helperText = null,
  emptyText = 'No se encontraron coincidencias.',
  className = '',
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Normalize options to { label, value, sublabel, badge }
  const normalizedOptions = useMemo(() => {
    return options.map(opt => {
      if (typeof opt === 'string') {
        return { label: opt, value: opt, sublabel: null, badge: null };
      }
      return {
        label: opt.label || opt.nombre || opt.value,
        value: opt.value !== undefined ? opt.value : (opt.nombre || opt.label),
        sublabel: opt.sublabel || opt.cargo || opt.tipo || null,
        badge: opt.badge || null
      };
    });
  }, [options]);

  // Filter options based on search term (accent-insensitive)
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return normalizedOptions;
    const cleanSearch = searchTerm.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return normalizedOptions.filter(opt => {
      const cleanLabel = (opt.label || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const cleanSub = (opt.sublabel || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return cleanLabel.includes(cleanSearch) || cleanSub.includes(cleanSearch);
    });
  }, [normalizedOptions, searchTerm]);

  // Check if current search matches an existing option exactly
  const exactMatchExists = useMemo(() => {
    if (!searchTerm.trim()) return true;
    const cleanSearch = searchTerm.trim().toLowerCase();
    return normalizedOptions.some(opt => opt.label.trim().toLowerCase() === cleanSearch);
  }, [normalizedOptions, searchTerm]);

  // Find currently selected option object
  const selectedOption = useMemo(() => {
    return normalizedOptions.find(opt => opt.value === value || opt.label === value) || null;
  }, [normalizedOptions, value]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.min(prev + 1, filteredOptions.length - (allowCreate && !exactMatchExists ? 0 : 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex < filteredOptions.length) {
        handleSelect(filteredOptions[highlightedIndex]);
      } else if (allowCreate && !exactMatchExists && searchTerm.trim()) {
        handleCreateAction();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  const handleSelect = (option) => {
    onChange(option.value);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
  };

  const handleCreateAction = () => {
    const text = searchTerm.trim();
    if (!text) return;
    if (onCreateNew) {
      onCreateNew(text);
    } else {
      onChange(text);
    }
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className={`relative ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
          <span>
            {label} {required && <span className="text-rose-500">*</span>}
          </span>
          {loading && <Loader2 className="w-3 h-3 text-[#F28524] animate-spin" />}
        </label>
      )}

      {/* Trigger Button */}
      <div
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            if (!isOpen) setTimeout(() => inputRef.current?.focus(), 60);
          }
        }}
        className={`w-full px-3 py-2 text-xs border rounded-xl flex items-center justify-between transition-all cursor-pointer select-none ${
          disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200' :
          isOpen ? 'border-[#F28524] ring-2 ring-[#F28524]/20 bg-white shadow-sm' :
          'border-slate-300 hover:border-slate-400 bg-white shadow-sm'
        }`}
      >
        <div className="truncate flex items-center space-x-1.5 flex-1 pr-2">
          {selectedOption ? (
            <div className="truncate flex items-center space-x-1.5">
              <span className="font-semibold text-slate-800 truncate">{selectedOption.label}</span>
              {selectedOption.sublabel && (
                <span className="text-[10px] text-slate-400 font-normal">({selectedOption.sublabel})</span>
              )}
            </div>
          ) : value ? (
            <span className="font-semibold text-slate-800 truncate">{value}</span>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center space-x-1 flex-shrink-0 text-slate-400">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 hover:text-slate-600 rounded"
              title="Borrar selección"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#F28524]' : ''}`} />
        </div>
      </div>

      {helperText && (
        <p className="text-[10px] text-slate-400 mt-0.5">{helperText}</p>
      )}

      {/* Floating Dropdown Panel */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in duration-150">
          {/* Search Input Header */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70 flex items-center space-x-2">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setHighlightedIndex(0);
              }}
              placeholder="Escriba para filtrar opciones..."
              className="w-full bg-transparent text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div ref={listRef} className="max-h-56 overflow-y-auto py-1 text-xs">
            {filteredOptions.length === 0 && (!allowCreate || exactMatchExists || !searchTerm.trim()) ? (
              <div className="p-4 text-center text-slate-400">
                <p className="font-medium">{emptyText}</p>
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = selectedOption && selectedOption.value === opt.value;
                const isHighlighted = highlightedIndex === idx;

                return (
                  <div
                    key={`${opt.value}-${idx}`}
                    onClick={() => handleSelect(opt)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`px-3 py-2 cursor-pointer flex items-center justify-between transition-colors ${
                      isSelected ? 'bg-orange-50 font-bold text-[#F28524]' :
                      isHighlighted ? 'bg-slate-100 text-slate-900' :
                      'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="truncate flex flex-col pr-2">
                      <span className="truncate">{opt.label}</span>
                      {opt.sublabel && (
                        <span className="text-[10px] text-slate-400">{opt.sublabel}</span>
                      )}
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#F28524] flex-shrink-0" />}
                  </div>
                );
              })
            )}

            {/* In-line Create New Action */}
            {allowCreate && !exactMatchExists && searchTerm.trim() && (
              <div
                onClick={handleCreateAction}
                onMouseEnter={() => setHighlightedIndex(filteredOptions.length)}
                className={`p-2.5 border-t border-slate-100 flex items-center space-x-2 text-xs font-bold text-[#F28524] hover:bg-orange-50 cursor-pointer transition-colors ${
                  highlightedIndex === filteredOptions.length ? 'bg-orange-50' : ''
                }`}
              >
                <Plus className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">
                  + Agregar "<span className="text-slate-900">{searchTerm.trim()}</span>" al catálogo
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
