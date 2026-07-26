import { useMemo, useState } from 'react'
import { Check, SlidersHorizontal, X } from 'lucide-react'
import type { Chart } from './types'

const levelCode = (level: number) => Math.round(level * 10)

export function SongPicker({
  label,
  charts,
  selected,
  selectedLevels,
  onSelect,
}: {
  label: string
  charts: Chart[]
  selected: Chart | null
  selectedLevels: Set<number>
  onSelect: (chart: Chart | null) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const normalizedQuery = query.normalize('NFKC').toLocaleLowerCase()
  const options = useMemo(
    () =>
      charts
        .filter((chart) => selectedLevels.has(levelCode(chart.level)))
        .filter(
          (chart) =>
            !normalizedQuery ||
            chart.title.normalize('NFKC').toLocaleLowerCase().includes(normalizedQuery) ||
            chart.artist.normalize('NFKC').toLocaleLowerCase().includes(normalizedQuery),
        )
        .sort(
          (a, b) =>
            a.title.localeCompare(b.title, 'ja') ||
            a.level - b.level ||
            a.difficulty.localeCompare(b.difficulty),
        ),
    [charts, normalizedQuery, selectedLevels],
  )

  return (
    <div className="song-picker">
      <label>{label}</label>
      <div className="picker-input-wrap">
        <input
          value={open ? query : selected?.title ?? ''}
          placeholder="곡명 또는 아티스트"
          onFocus={() => {
            setQuery('')
            setOpen(true)
          }}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            setQuery(event.target.value)
            onSelect(null)
            setOpen(true)
          }}
          aria-expanded={open}
        />
        {selected && !open && (
          <button
            type="button"
            className="clear-picker"
            title="선택 해제"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(null)}
          >
            <X size={15} />
          </button>
        )}
      </div>
      {selected && !open && (
        <span className="selected-meta">
          {selected.difficulty} · Lv.{selected.level.toFixed(1)} · {selected.artist}
        </span>
      )}
      {open && (
        <div className="song-options">
          <div className="option-count">{options.length.toLocaleString('ko-KR')}곡</div>
          {options.map((chart) => (
            <button
              type="button"
              key={chart.id}
              className={selected?.id === chart.id ? 'song-option is-selected' : 'song-option'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(chart)
                setQuery('')
                setOpen(false)
              }}
            >
              <span>
                <strong>{chart.title}</strong>
                <small>{chart.artist}</small>
              </span>
              <em>
                {chart.difficulty} {chart.level.toFixed(1)}
              </em>
            </button>
          ))}
          {options.length === 0 && <div className="option-empty">조건에 맞는 곡이 없습니다.</div>}
        </div>
      )}
    </div>
  )
}

export function LevelFilter({
  levels,
  selected,
  onChange,
  popup,
}: {
  levels: number[]
  selected: Set<number>
  onChange: (levels: Set<number>) => void
  popup?: boolean
}) {
  const [open, setOpen] = useState(false)
  const toggle = (level: number) => {
    const next = new Set(selected)
    if (next.has(level)) next.delete(level)
    else next.add(level)
    onChange(next)
  }
  const content = (
    <div className={popup ? 'level-grid' : 'level-inline'}>
      {levels.map((level) => (
        <label key={level} className={selected.has(level) ? 'level-check is-checked' : 'level-check'}>
          <input
            type="checkbox"
            checked={selected.has(level)}
            onChange={() => toggle(level)}
          />
          <span className="checkbox-mark">{selected.has(level) && <Check size={13} />}</span>
          {(level / 10).toFixed(1)}
        </label>
      ))}
    </div>
  )

  if (!popup) return content

  return (
    <div className="level-popup-wrap">
      <button
        type="button"
        className={open ? 'level-popup-button is-active' : 'level-popup-button'}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal size={16} />
        세부 레벨
        <span>
          {selected.size}/{levels.length}
        </span>
      </button>
      {open && (
        <div className="level-popover">
          <div className="popover-head">
            <strong>세부 레벨</strong>
            <div>
              <button type="button" onClick={() => onChange(new Set(levels))}>
                전체
              </button>
              <button type="button" onClick={() => onChange(new Set())}>
                해제
              </button>
            </div>
          </div>
          {content}
        </div>
      )}
    </div>
  )
}
