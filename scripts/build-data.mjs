import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = 'C:/Users/USER/Desktop/vaddict-work'
const inspectPath = path.join(sourceDir, 'sdvx_vs_17_18_all_players.xlsx.inspect.ndjson')
const outputPath = path.join(projectRoot, 'src', 'data', 'finals.json')
const excludedRound3 = new Set(['ΔLI∇E', '神凪'])

const difficultyMap = {
  MAX: 'MXM',
  MXM: 'MXM',
  GRA: 'GRV',
  GRV: 'GRV',
  HEA: 'HVN',
  HVN: 'HVN',
  VIV: 'VVD',
  VVD: 'VVD',
  EXC: 'XCD',
  XCD: 'XCD',
  NAB: 'NBL',
  NBL: 'NBL',
  EXH: 'EXH',
  INF: 'INF',
  ADV: 'ADV',
  ULT: 'ULT',
}

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#039;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
}

const cleanText = (value) =>
  decodeHtml(String(value ?? '').replace(/<[^>]*>/g, '')).normalize('NFC').trim()

function keyOf(row) {
  return `${cleanText(row.title)}\u241f${difficultyMap[String(row.difficulty).toUpperCase()] ?? String(row.difficulty).toUpperCase()}\u241f${Number(row.level).toFixed(1)}`
}

const excludedMegamix = new Set([
  keyOf({ title: 'ありふれたせかいせいふく', difficulty: 'NBL', level: 17 }),
  keyOf({ title: '無双', difficulty: 'NBL', level: 18.4 }),
])

const manualAliases = new Map([
  [
    keyOf({ title: 'ビューティフル レシート', difficulty: 'MXM', level: 18.3 }),
    keyOf({ title: 'ビューティフルレシート', difficulty: 'MXM', level: 18.3 }),
  ],
  [
    keyOf({ title: 'TOYBOX CANNØN=͟͟͞ Σ≡=｡ﾟ:*.:+｡.☆', difficulty: 'MXM', level: 18.4 }),
    keyOf({ title: 'TOYBOX CANNØN= ͟͞ Σ≡=｡ﾟ:*.:+｡.☆', difficulty: 'MXM', level: 18.4 }),
  ],
])

const lookupKey = (row) => manualAliases.get(keyOf(row)) ?? keyOf(row)
const numOrNull = (value) =>
  value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value)

function parseCsv(text) {
  const values = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') quoted = false
      else field += character
    } else if (character === '"') quoted = true
    else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      values.push(row)
      row = []
      field = ''
    } else field += character
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''))
    values.push(row)
  }
  const headers = values.shift().map((value) => value.replace(/^\uFEFF/, ''))
  return values
    .filter((record) => record.some((value) => value !== ''))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])))
}

function parseAverageHtml(text) {
  return text
    .split('<div class="tracks">')
    .slice(1)
    .map((chunk) => {
      const title = chunk.match(/<div class="music_name">([\s\S]*?)<\/div>/)
      const difficulty = chunk.match(/<span class="dif [^"]+">([^<]+)<\/span>/)
      const level = chunk.match(/<span class="level">([^<]+)<\/span>/)
      const score = chunk.match(/<div class="score">\s*([0-9,]+)\s*<\/div>/)
      if (!title || !difficulty || !level || !score) return null
      return {
        title: cleanText(title[1]).replace(/^★/, '').trim(),
        difficulty: difficultyMap[cleanText(difficulty[1]).toUpperCase()] ?? cleanText(difficulty[1]).toUpperCase(),
        level: Number(cleanText(level[1])),
        score: Number(score[1].replaceAll(',', '')),
      }
    })
    .filter(Boolean)
}

function parseMegamix(text) {
  return text
    .split('<div class="tracks">')
    .slice(1)
    .map((chunk) => {
      const title = chunk.match(/<div class="music_name">([\s\S]*?)<\/div>/)
      const difficulty = chunk.match(/<span class="dif [^"]+">([^<]+)<\/span>/)
      const level = chunk.match(/<span class="level">([^<]+)<\/span>/)
      if (!title || !difficulty || !level) return null
      return {
        title: cleanText(title[1]).replace(/^★/, '').trim(),
        difficulty: difficultyMap[cleanText(difficulty[1]).toUpperCase()] ?? cleanText(difficulty[1]).toUpperCase(),
        level: Number(cleanText(level[1])),
      }
    })
    .filter(Boolean)
}

function readTable(items, sheetName) {
  const item = items.find((candidate) => candidate.kind === 'table' && candidate.sheet === sheetName)
  if (!item?.values) throw new Error(`통합 기록표 시트를 찾지 못했습니다: ${sheetName}`)
  const [headers, ...rows] = item.values
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])))
}

function readPoolCsv(fileName) {
  return parseCsv(fs.readFileSync(path.join(sourceDir, 'sdvx_by_level_version_groups', fileName), 'utf8'))
}

const inspectItems = fs
  .readFileSync(inspectPath, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))

const rows1718 = readTable(inspectItems, '17_18 전체')
const rows19 = readTable(inspectItems, '19 전체')
const baseline1 = new Map(
  parseAverageHtml(fs.readFileSync(path.join(sourceDir, 'avg_score_1.txt'), 'utf8')).map((row) => [
    lookupKey(row),
    row.score,
  ]),
)
const baseline2 = new Map(
  parseAverageHtml(fs.readFileSync(path.join(sourceDir, 'avg_score_2.txt'), 'utf8')).map((row) => [
    lookupKey(row),
    row.score,
  ]),
)
const baseline19 = new Map(
  parseAverageHtml(fs.readFileSync(path.join(sourceDir, '19lv_html.txt'), 'utf8')).map((row) => [
    lookupKey(row),
    row.score,
  ]),
)

const master = new Map()
for (const row of rows1718) {
  const chart = {
    id: lookupKey(row),
    title: cleanText(row.title),
    artist: cleanText(row.artist),
    difficulty: String(row.difficulty),
    level: Number(row.level),
    bpm: String(row.bpm ?? ''),
    version: '',
    baseline1: baseline1.get(lookupKey(row)) ?? null,
    baseline2: baseline2.get(lookupKey(row)) ?? null,
    duelBaseline: baseline1.get(lookupKey(row)) ?? null,
    duelBaselineSource: baseline1.has(lookupKey(row)) ? 'Imperial 1-1' : null,
    scores: {
      gusto: numOrNull(row['구스토']),
      cooksie: numOrNull(row['쿠크시']),
      mindblow: numOrNull(row.Mindblow),
      real: numOrNull(row['#ㄹㅇ이가']),
      marirang: numOrNull(row['마리랑']),
      fulfil: numOrNull(row.FULFIL),
    },
  }
  master.set(chart.id, chart)
}

for (const row of rows19) {
  const chart = {
    id: lookupKey(row),
    title: cleanText(row.title),
    artist: cleanText(row.artist),
    difficulty: String(row.difficulty),
    level: Number(row.level),
    bpm: String(row.bpm ?? ''),
    version: '',
    baseline1: baseline1.get(lookupKey(row)) ?? null,
    baseline2: baseline2.get(lookupKey(row)) ?? null,
    duelBaseline: baseline19.get(lookupKey(row)) ?? null,
    duelBaselineSource: baseline19.has(lookupKey(row)) ? 'Imperial 1-2' : null,
    scores: {
      gusto: numOrNull(row['구스토']),
      cooksie: null,
      mindblow: null,
      real: numOrNull(row['#ㄹㅇ이가']),
      marirang: null,
      fulfil: null,
    },
  }
  master.set(chart.id, chart)
}

function resolve(row, scope) {
  const chart = master.get(lookupKey(row))
  if (!chart) throw new Error(`${scope} 매칭 실패: ${row.title} / ${row.difficulty} / ${row.level}`)
  return { ...chart }
}

function resolvePool(rows, scope) {
  const charts = rows.map((row) => {
    const chart = resolve(row, scope)
    chart.version = String(row.displayVersion ?? chart.version)
    return chart
  })
  if (new Set(charts.map((chart) => chart.id)).size !== charts.length) {
    throw new Error(`${scope} 중복 채보가 있습니다.`)
  }
  return charts.sort((a, b) => a.level - b.level || a.title.localeCompare(b.title, 'ja'))
}

const round1 = resolvePool(readPoolCsv('sdvx_level17_heaven_vivid.csv'), '1R 17HV')
const round3 = resolvePool(
  readPoolCsv('sdvx_level18_exceed_nabla.csv').filter((row) => !excludedRound3.has(row.title)),
  '3R 18EN',
)

const megamixRows = parseMegamix(fs.readFileSync(path.join(sourceDir, 'megamix.txt'), 'utf8'))
  .filter((row) => !excludedMegamix.has(keyOf(row)))
const round2 = resolvePool(megamixRows, '2R Megamix')
const round4 = [...master.values()]
  .filter((chart) => chart.level >= 18 && chart.level < 20)
  .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title, 'ja'))

const requiredBaseline1 = round1.filter((chart) => chart.baseline1 == null)
const requiredBaseline2 = round3.filter((chart) => chart.baseline2 == null)
const missingDuelBaseline19 = round4.filter(
  (chart) => Math.floor(chart.level) === 19 && chart.duelBaseline == null,
)
if (requiredBaseline1.length) {
  console.warn(`Imperial 1-1 미매칭 ${requiredBaseline1.length}건`)
}
if (requiredBaseline2.length) {
  throw new Error(`3R Imperial 1-2 미매칭 ${requiredBaseline2.length}건`)
}

const data = {
  generatedAt: new Date().toISOString(),
  sourceSummary: {
    round1: round1.length,
    round2: round2.length,
    round3: round3.length,
    round4: round4.length,
    baseline1MissingRound1: requiredBaseline1.length,
    duelBaseline19Matched: round4.filter(
      (chart) => Math.floor(chart.level) === 19 && chart.duelBaseline != null,
    ).length,
    duelBaseline19Missing: missingDuelBaseline19.length,
  },
  pools: { round1, round2, round3, round4 },
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(data), 'utf8')
console.log(JSON.stringify({ outputPath, ...data.sourceSummary }, null, 2))
