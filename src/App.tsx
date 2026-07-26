import { useMemo, useState } from 'react'
import {
  Ban,
  ChartNoAxesColumnIncreasing,
  Dices,
  Gauge,
  RotateCcw,
  ShieldCheck,
  Swords,
  WifiOff,
} from 'lucide-react'
import finalsData from './data/finals.json'
import { LevelFilter, SongPicker } from './components'
import {
  assessDuelPool,
  assessTeamPool,
  formatScore,
  recommendationConfidence,
  signed,
  validScore,
} from './strategy'
import type { Chart, FinalsData, PlayerKey, RiskAssessment } from './types'
import { playerLabels } from './types'
import './App.css'

type RoundId = 'round1' | 'round2' | 'round3' | 'round4'
type TeamMode = 'opponent' | 'strategy'

const data = finalsData as FinalsData
const range = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, index) => start + index)

function riskTone(risk: number) {
  if (risk >= 72) return 'danger'
  if (risk >= 50) return 'warning'
  return 'safe'
}

function Difficulty({ chart }: { chart: Chart }) {
  return <span className={`difficulty difficulty-${chart.difficulty.toLowerCase()}`}>{chart.difficulty}</span>
}

function PlayerScore({
  chart,
  player,
  baseline,
}: {
  chart: Chart
  player: PlayerKey
  baseline?: number
}) {
  const score = validScore(chart.scores[player])
  const contribution = score != null && baseline != null ? Math.max(score - baseline, 0) : null
  return (
    <td className="score-cell">
      <strong>{formatScore(chart.scores[player])}</strong>
      {contribution != null && (
        <small className={contribution > 0 ? 'positive' : ''}>
          기여 {contribution > 0 ? `+${contribution.toLocaleString('ko-KR')}` : '0'}
        </small>
      )}
    </td>
  )
}

function AssessmentTable({
  assessments,
  ours,
  opponents,
  mode,
}: {
  assessments: RiskAssessment[]
  ours: [PlayerKey, PlayerKey]
  opponents: [PlayerKey, PlayerKey]
  mode: TeamMode
}) {
  const ranked = [...assessments].sort((a, b) =>
    mode === 'opponent' ? b.risk - a.risk : a.risk - b.risk,
  )
  const rankById = new Map(ranked.map((assessment, index) => [assessment.chart.id, index + 1]))
  return (
    <div className="table-scroll">
      <table className="analysis-table">
        <thead>
          <tr>
            <th>후보</th>
            <th className="song-heading">곡명 / 채보</th>
            <th>기준값</th>
            <th className="our-heading">{playerLabels[ours[0]]}</th>
            <th className="our-heading">{playerLabels[ours[1]]}</th>
            <th className="opponent-heading">{playerLabels[opponents[0]]}</th>
            <th className="opponent-heading">{playerLabels[opponents[1]]}</th>
            <th>상대-우리 기여</th>
            <th>위험도</th>
            <th className="reason-heading">판단 근거</th>
          </tr>
        </thead>
        <tbody>
          {assessments.map((assessment, inputIndex) => {
            const rank = rankById.get(assessment.chart.id)!
            const primary =
              mode === 'opponent' ? rank === 1 : rank === 1
            const secondary = mode === 'opponent' && rank === 2
            return (
              <tr key={assessment.chart.id} className={primary ? 'primary-row' : secondary ? 'secondary-row' : ''}>
                <td className="candidate-cell">
                  <span>#{inputIndex + 1}</span>
                  {primary && (
                    <em className={mode === 'opponent' ? 'ban-badge' : 'keep-badge'}>
                      {mode === 'opponent' ? '밴' : '선택'}
                    </em>
                  )}
                  {secondary && <em className="strategy-badge">전략</em>}
                </td>
                <td className="song-cell">
                  <strong>{assessment.chart.title}</strong>
                  <span>
                    <Difficulty chart={assessment.chart} /> Lv.{assessment.chart.level.toFixed(1)} ·{' '}
                    {assessment.chart.bpm} BPM
                  </span>
                </td>
                <td className="baseline-cell">
                  <strong>{assessment.baseline.toLocaleString('ko-KR')}</strong>
                  <small>{assessment.baselineSource}</small>
                </td>
                <PlayerScore chart={assessment.chart} player={ours[0]} baseline={assessment.baseline} />
                <PlayerScore chart={assessment.chart} player={ours[1]} baseline={assessment.baseline} />
                <PlayerScore chart={assessment.chart} player={opponents[0]} baseline={assessment.baseline} />
                <PlayerScore chart={assessment.chart} player={opponents[1]} baseline={assessment.baseline} />
                <td className={assessment.contributionEdge > 0 ? 'edge-cell opponent-edge' : 'edge-cell our-edge'}>
                  {signed(assessment.contributionEdge)}
                </td>
                <td className={`risk-cell ${riskTone(assessment.risk)}`}>
                  <strong>{assessment.risk.toFixed(1)}</strong>
                  <small>최악 {assessment.worstCaseRisk.toFixed(1)}</small>
                </td>
                <td className="reason-cell">{assessment.reasons.join(' · ')}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TeamRound({
  round,
  charts,
  ours,
  opponents,
  title,
  subtitle,
  rosterControl,
}: {
  round: 'round1' | 'round3'
  charts: Chart[]
  ours: [PlayerKey, PlayerKey]
  opponents: [PlayerKey, PlayerKey]
  title: string
  subtitle: string
  rosterControl?: React.ReactNode
}) {
  const [mode, setMode] = useState<TeamMode>('opponent')
  const availableLevels = round === 'round1' ? [170, 175] : range(180, 189)
  const [levels, setLevels] = useState(() => new Set(availableLevels))
  const [selected, setSelected] = useState<(Chart | null)[]>(Array(4).fill(null))
  const [results, setResults] = useState<RiskAssessment[] | null>(null)
  const [error, setError] = useState('')
  const assessmentMap = useMemo(
    () => assessTeamPool(charts, ours, opponents, round),
    [charts, opponents[0], opponents[1], ours[0], ours[1], round],
  )
  const count = mode === 'opponent' ? 3 : 4
  const labels =
    mode === 'opponent'
      ? ['타선곡 1', '타선곡 2', '타선곡 3']
      : ['기존 곡', '추첨곡 1', '추첨곡 2', '추첨곡 3']

  function changeMode(nextMode: TeamMode) {
    setMode(nextMode)
    setResults(null)
    setError('')
  }

  function runAnalysis() {
    const picks = selected.slice(0, count)
    if (picks.some((chart) => chart == null)) {
      setError(`${count}곡을 모두 선택하세요.`)
      setResults(null)
      return
    }
    const chartsSelected = picks as Chart[]
    if (new Set(chartsSelected.map((chart) => chart.id)).size !== chartsSelected.length) {
      setError('서로 다른 곡을 선택하세요.')
      setResults(null)
      return
    }
    setError('')
    setResults(chartsSelected.map((chart) => assessmentMap.get(chart.id)!))
  }

  const ranked = results
    ? [...results].sort((a, b) => (mode === 'opponent' ? b.risk - a.risk : a.risk - b.risk))
    : []
  const confidence = results ? recommendationConfidence(
    mode === 'opponent' ? ranked : [...ranked].reverse(),
  ) : 0
  const improvement =
    results && mode === 'strategy' ? results[0].risk - ranked[0].risk : 0

  return (
    <>
      <section className="round-heading">
        <div>
          <span className="round-kicker">{round === 'round1' ? 'ROUND 1' : 'ROUND 3'}</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="roster-strip">
          <span className="our-roster">{playerLabels[ours[0]]} + {playerLabels[ours[1]]}</span>
          <Swords size={17} />
          <span className="opponent-roster">{playerLabels[opponents[0]]} + {playerLabels[opponents[1]]}</span>
        </div>
      </section>

      <section className="setup-band">
        <div className="setup-topline">
          <div className="mode-segments">
            <button
              type="button"
              className={mode === 'opponent' ? 'active' : ''}
              onClick={() => changeMode('opponent')}
            >
              <Ban size={16} /> 타선곡
            </button>
            <button
              type="button"
              className={mode === 'strategy' ? 'active' : ''}
              onClick={() => changeMode('strategy')}
            >
              <Dices size={16} /> 스트래티지
            </button>
          </div>
          {rosterControl}
          <LevelFilter
            levels={availableLevels}
            selected={levels}
            onChange={setLevels}
            popup={round === 'round3'}
          />
        </div>
        <div className={`picker-grid picker-grid-${count}`}>
          {labels.map((label, index) => (
            <SongPicker
              key={`${mode}-${label}`}
              label={label}
              charts={charts}
              selected={selected[index]}
              selectedLevels={levels}
              onSelect={(chart) => {
                const next = [...selected]
                next[index] = chart
                setSelected(next)
                setResults(null)
              }}
            />
          ))}
        </div>
        <div className="action-line">
          <span className="form-error">{error}</span>
          <button type="button" className="primary-action" onClick={runAnalysis}>
            <ChartNoAxesColumnIncreasing size={17} />
            {mode === 'opponent' ? '밴 분석' : '교체 후보 분석'}
          </button>
        </div>
      </section>

      {results && (
        <section className="result-section">
          <div className="decision-band">
            <div className="decision-main">
              <span>{mode === 'opponent' ? '추천 밴' : '추천 선택'}</span>
              <strong>{ranked[0].chart.title}</strong>
              <p>{ranked[0].reasons.join(' · ')}</p>
            </div>
            {mode === 'opponent' ? (
              <>
                <div className="decision-secondary">
                  <span>스트래티지 대상</span>
                  <strong>{ranked[1].chart.title}</strong>
                  <small>밴 이후 남는 최고 위험 곡</small>
                </div>
                <div className="confidence-meter">
                  <Gauge size={18} />
                  <strong>{confidence}%</strong>
                  <span>밴 확신도</span>
                </div>
              </>
            ) : (
              <div className="decision-secondary">
                <span>기존 곡 대비</span>
                <strong>{improvement > 0 ? `위험 ${improvement.toFixed(1)} 감소` : '교체 이득 없음'}</strong>
                <small>{ranked[0].chart.id === results[0].chart.id ? '기존 곡 유지' : '추첨곡으로 교체'}</small>
              </div>
            )}
          </div>
          <AssessmentTable assessments={results} ours={ours} opponents={opponents} mode={mode} />
        </section>
      )}
    </>
  )
}

function RoundTwo() {
  const charts = data.pools.round2
  const [opponent, setOpponent] = useState<PlayerKey>('marirang')
  const availableLevels = range(170, 189)
  const [levels, setLevels] = useState(() => new Set(availableLevels))
  const [selected, setSelected] = useState<(Chart | null)[]>(Array(5).fill(null))
  const [results, setResults] = useState<Chart[] | null>(null)
  const [error, setError] = useState('')

  function report() {
    if (selected.some((chart) => chart == null)) {
      setError('5곡을 모두 선택하세요.')
      return
    }
    const picks = selected as Chart[]
    if (new Set(picks.map((chart) => chart.id)).size !== 5) {
      setError('서로 다른 곡을 선택하세요.')
      return
    }
    setError('')
    setResults(picks)
  }

  return (
    <>
      <section className="round-heading">
        <div>
          <span className="round-kicker">ROUND 2</span>
          <h2>Megamix Battle</h2>
          <p>상대 선수의 5개 타선곡에서 실제 기록만 비교합니다.</p>
        </div>
        <div className="roster-strip">
          <span className="our-roster">Mindblow</span>
          <Swords size={17} />
          <span className="opponent-roster">{playerLabels[opponent]}</span>
        </div>
      </section>
      <section className="setup-band">
        <div className="setup-topline">
          <div className="mode-segments roster-choice">
            {(['marirang', 'fulfil'] as PlayerKey[]).map((player) => (
              <button
                type="button"
                key={player}
                className={opponent === player ? 'active' : ''}
                onClick={() => {
                  setOpponent(player)
                  setResults(null)
                }}
              >
                {playerLabels[player]}
              </button>
            ))}
          </div>
          <LevelFilter levels={availableLevels} selected={levels} onChange={setLevels} popup />
        </div>
        <div className="picker-grid picker-grid-5">
          {selected.map((chart, index) => (
            <SongPicker
              key={index}
              label={`타선곡 ${index + 1}`}
              charts={charts}
              selected={chart}
              selectedLevels={levels}
              onSelect={(nextChart) => {
                const next = [...selected]
                next[index] = nextChart
                setSelected(next)
                setResults(null)
              }}
            />
          ))}
        </div>
        <div className="action-line">
          <span className="form-error">{error}</span>
          <button type="button" className="primary-action" onClick={report}>
            <ChartNoAxesColumnIncreasing size={17} /> 점수 보고
          </button>
        </div>
      </section>
      {results && (
        <section className="result-section">
          <div className="table-scroll">
            <table className="analysis-table compact-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th className="song-heading">곡명 / 채보</th>
                  <th className="our-heading">Mindblow</th>
                  <th className="opponent-heading">{playerLabels[opponent]}</th>
                  <th>Mindblow 기준 차이</th>
                </tr>
              </thead>
              <tbody>
                {results.map((chart, index) => {
                  const mind = validScore(chart.scores.mindblow)
                  const rival = validScore(chart.scores[opponent])
                  const difference = mind != null && rival != null ? mind - rival : null
                  return (
                    <tr key={chart.id}>
                      <td className="candidate-cell">#{index + 1}</td>
                      <td className="song-cell">
                        <strong>{chart.title}</strong>
                        <span><Difficulty chart={chart} /> Lv.{chart.level.toFixed(1)} · {chart.bpm} BPM</span>
                      </td>
                      <td className="score-cell"><strong>{formatScore(chart.scores.mindblow)}</strong></td>
                      <td className="score-cell"><strong>{formatScore(chart.scores[opponent])}</strong></td>
                      <td className={difference == null ? 'edge-cell' : difference >= 0 ? 'edge-cell our-edge' : 'edge-cell opponent-edge'}>
                        {difference == null ? '비교 불가' : signed(difference)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

function RoundThree() {
  const [secondary, setSecondary] = useState<PlayerKey>('marirang')
  const opponentPlayers: [PlayerKey, PlayerKey] = [secondary, 'real']
  const control = (
    <div className="mode-segments roster-choice">
      {(['marirang', 'fulfil'] as PlayerKey[]).map((player) => (
        <button
          type="button"
          key={player}
          className={secondary === player ? 'active' : ''}
          onClick={() => setSecondary(player)}
        >
          {playerLabels[player]}
        </button>
      ))}
    </div>
  )
  return (
    <TeamRound
      key={secondary}
      round="round3"
      charts={data.pools.round3}
      ours={['cooksie', 'gusto']}
      opponents={opponentPlayers}
      title="18 EN Team Battle"
      subtitle="메가믹스 미출전 선수와 #ㄹㅇ이가의 타선곡을 분석합니다."
      rosterControl={control}
    />
  )
}

function RoundFour() {
  const charts = data.pools.round4
  const availableLevels = range(180, 199)
  const [levels, setLevels] = useState(() => new Set(availableLevels))
  const [selected, setSelected] = useState<(Chart | null)[]>([null, null])
  const [results, setResults] = useState<RiskAssessment[] | null>(null)
  const [error, setError] = useState('')
  const assessments = useMemo(() => assessDuelPool(charts), [charts])

  function analyze() {
    if (selected.some((chart) => chart == null)) {
      setError('두 곡을 모두 선택하세요.')
      return
    }
    const picks = selected as Chart[]
    if (picks[0].id === picks[1].id) {
      setError('서로 다른 곡을 선택하세요.')
      return
    }
    setError('')
    setResults(picks.map((chart) => assessments.get(chart.id)!))
  }

  const ranked = results ? [...results].sort((a, b) => b.risk - a.risk) : []
  return (
    <>
      <section className="round-heading">
        <div>
          <span className="round-kicker">ROUND 4</span>
          <h2>18–19 Duel</h2>
          <p>ㄹㅇ이가의 자선곡 두 개 중 구스토에게 더 위험한 한 곡을 밴합니다.</p>
        </div>
        <div className="roster-strip">
          <span className="our-roster">구스토</span>
          <Swords size={17} />
          <span className="opponent-roster">#ㄹㅇ이가</span>
        </div>
      </section>
      <section className="setup-band">
        <div className="setup-topline align-right">
          <LevelFilter levels={availableLevels} selected={levels} onChange={setLevels} popup />
        </div>
        <div className="picker-grid picker-grid-2">
          {[0, 1].map((index) => (
            <SongPicker
              key={index}
              label={`타선곡 ${index + 1}`}
              charts={charts}
              selected={selected[index]}
              selectedLevels={levels}
              onSelect={(chart) => {
                const next = [...selected]
                next[index] = chart
                setSelected(next)
                setResults(null)
              }}
            />
          ))}
        </div>
        <div className="action-line">
          <span className="form-error">{error}</span>
          <button type="button" className="primary-action" onClick={analyze}>
            <Ban size={17} /> 밴 분석
          </button>
        </div>
      </section>
      {results && (
        <section className="result-section">
          <div className="decision-band duel-decision">
            <div className="decision-main">
              <span>추천 밴</span>
              <strong>{ranked[0].chart.title}</strong>
              <p>{ranked[0].reasons.join(' · ')}</p>
            </div>
            <div className="confidence-meter">
              <Gauge size={18} />
              <strong>{recommendationConfidence(ranked)}%</strong>
              <span>밴 확신도</span>
            </div>
          </div>
          <div className="table-scroll">
            <table className="analysis-table compact-table">
              <thead>
                <tr>
                  <th>후보</th>
                  <th className="song-heading">곡명 / 채보</th>
                  <th>기준값</th>
                  <th className="our-heading">구스토</th>
                  <th className="opponent-heading">#ㄹㅇ이가</th>
                  <th>보정 상대 우위</th>
                  <th>위험도</th>
                  <th className="reason-heading">판단 근거</th>
                </tr>
              </thead>
              <tbody>
                {results.map((assessment, index) => (
                  <tr key={assessment.chart.id} className={assessment.chart.id === ranked[0].chart.id ? 'primary-row' : ''}>
                    <td className="candidate-cell">
                      #{index + 1}
                      {assessment.chart.id === ranked[0].chart.id && <em className="ban-badge">밴</em>}
                    </td>
                    <td className="song-cell">
                      <strong>{assessment.chart.title}</strong>
                      <span><Difficulty chart={assessment.chart} /> Lv.{assessment.chart.level.toFixed(1)} · {assessment.chart.bpm} BPM</span>
                    </td>
                    <td className="baseline-cell">
                      <strong>{assessment.baseline.toLocaleString('ko-KR')}</strong>
                      <small>{assessment.baselineSource}</small>
                    </td>
                    <td className="score-cell"><strong>{formatScore(assessment.chart.scores.gusto)}</strong></td>
                    <td className="score-cell"><strong>{formatScore(assessment.chart.scores.real)}</strong></td>
                    <td className={assessment.adjustedEdge > 0 ? 'edge-cell opponent-edge' : 'edge-cell our-edge'}>
                      {signed(assessment.adjustedEdge)}
                    </td>
                    <td className={`risk-cell ${riskTone(assessment.risk)}`}><strong>{assessment.risk.toFixed(1)}</strong></td>
                    <td className="reason-cell">{assessment.reasons.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}

function App() {
  const [round, setRound] = useState<RoundId>('round1')
  const roundLabels: { id: RoundId; label: string; detail: string }[] = [
    { id: 'round1', label: '1R', detail: '17 HV' },
    { id: 'round2', label: '2R', detail: 'Megamix' },
    { id: 'round3', label: '3R', detail: '18 EN' },
    { id: 'round4', label: '4R', detail: '18–19' },
  ]
  return (
    <div className="app">
      <header className="site-header">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.png`} alt="" />
          <div>
            <span>SDVX FINALS OPERATIONS</span>
            <h1>결승 전략실</h1>
          </div>
        </div>
        <div className="offline-mark">
          <WifiOff size={15} />
          오프라인 계산 지원
        </div>
      </header>
      <nav className="round-tabs" aria-label="라운드 선택">
        {roundLabels.map((item) => (
          <button
            type="button"
            key={item.id}
            className={round === item.id ? 'active' : ''}
            onClick={() => setRound(item.id)}
          >
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </button>
        ))}
      </nav>
      <main>
        {round === 'round1' && (
          <TeamRound
            round="round1"
            charts={data.pools.round1}
            ours={['cooksie', 'mindblow']}
            opponents={['marirang', 'fulfil']}
            title="17 HV Team Battle"
            subtitle="상대의 세 선곡에서 한 곡을 밴하고, 다음 위험 곡을 스트래티지 대상으로 지정합니다."
          />
        )}
        {round === 'round2' && <RoundTwo />}
        {round === 'round3' && <RoundThree />}
        {round === 'round4' && <RoundFour />}
      </main>
      <footer>
        <span><ShieldCheck size={15} /> 모든 점수와 계산식은 브라우저 안에서만 처리됩니다.</span>
        <button type="button" onClick={() => window.location.reload()} title="화면 초기화">
          <RotateCcw size={15} /> 초기화
        </button>
      </footer>
    </div>
  )
}

export default App
