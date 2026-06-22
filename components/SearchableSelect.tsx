'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { matchesSearch } from '@/lib/search'

export interface SearchableOption {
  id: number
  code: string
  name: string
  unit?: string
}

interface Props {
  options: SearchableOption[]
  value: number | null
  onChange: (id: number | null) => void
  placeholder?: string
}

export default function SearchableSelect({ options, value, onChange, placeholder = '검색하여 선택...' }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.id === value) || null

  const filtered = query.trim()
    ? options.filter(o => matchesSearch(query, [o.code, o.name]))
    : options

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIdx(0)
  }, [filtered.length, query])

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && listRef.current) {
      const items = listRef.current.querySelectorAll('.ss-option')
      if (items[highlightIdx]) {
        items[highlightIdx].scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightIdx, open])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = useCallback((opt: SearchableOption) => {
    onChange(opt.id)
    setQuery('')
    setOpen(false)
  }, [onChange])

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
    setQuery('')
    setOpen(false)
  }, [onChange])

  const handleFocus = () => {
    setOpen(true)
    setQuery('')
    setHighlightIdx(0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightIdx(prev => Math.min(prev + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightIdx(prev => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[highlightIdx]) {
          handleSelect(filtered[highlightIdx])
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div className="ss-container" ref={containerRef}>
      <div className={`ss-input-wrapper ${open ? 'ss-focused' : ''}`} onClick={() => inputRef.current?.focus()}>
        {selected && !open ? (
          <div className="ss-selected-display">
            <span className="ss-selected-code">{selected.code}</span>
            <span className="ss-selected-name">{selected.name}</span>
            {selected.unit && <span className="ss-selected-unit">{selected.unit}</span>}
          </div>
        ) : (
          <input
            ref={inputRef}
            className="ss-input"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder={selected ? `${selected.code} | ${selected.name}` : placeholder}
            autoComplete="off"
          />
        )}
        {selected && (
          <button className="ss-clear" onClick={handleClear} type="button" tabIndex={-1} title="선택 해제">✕</button>
        )}
        {!selected && (
          <span className="ss-chevron">▾</span>
        )}
      </div>

      {open && (
        <div className="ss-dropdown" ref={listRef}>
          {selected && (
            <input
              ref={inputRef}
              className="ss-dropdown-search"
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="코드 또는 자재명 검색..."
              autoFocus
              autoComplete="off"
            />
          )}
          <div className="ss-options-header">
            검색 결과 <span className="ss-options-count">{filtered.length}건</span>
          </div>
          {filtered.length === 0 ? (
            <div className="ss-no-result">일치하는 자재가 없습니다</div>
          ) : (
            <div className="ss-options-list">
              {filtered.map((opt, idx) => (
                <div
                  key={opt.id}
                  className={`ss-option ${idx === highlightIdx ? 'ss-option-highlight' : ''} ${opt.id === value ? 'ss-option-selected' : ''}`}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  onMouseDown={e => { e.preventDefault(); handleSelect(opt) }}
                >
                  <span className="ss-option-code">{opt.code}</span>
                  <span className="ss-option-name">{opt.name}</span>
                  {opt.unit && <span className="ss-option-unit">{opt.unit}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
