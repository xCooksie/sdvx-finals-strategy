import type { Chart, PlayerKey, RiskAssessment } from './types'
import { playerLabels } from './types'

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value))

export function validScore(value: number | null) {
  return value != null && value > 0 ? value : null
}

export function formatScore(value: number | null) {
  return validScore(value)?.toLocaleString('ko-KR') ?? '기록 없음'
}

export function signed(value: number) {
  const rounded = Math.round(value)
  if (rounded === 0) return '0'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toLocaleString('ko-KR')}`
}

function percentile(values: number[], value: number) {
  if (values.length < 2) return 0.5
  const sorted = [...values].sort((a, b) => a - b)
  let below = 0
  let equal = 0
  for (const candidate of sorted) {
    if (candidate < value) below += 1
    else if (candidate === value) equal += 1
  }
  return (below + Math.max(0, equal - 1) / 2) / (sorted.length - 1)
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function contribution(score: number | null, baseline: number) {
  const valid = validScore(score)
  return valid == null ? 0 : Math.max(valid - baseline, 0)
}

function adjustedDelta(score: number | null, baseline: number) {
  const valid = validScore(score)
  if (valid == null) return 0
  const delta = valid - baseline
  return delta >= 0 ? delta * 0.7 : delta * 0.25
}

function uncertainty(score: number | null, baseline: number) {
  const valid = validScore(score)
  if (valid == null) return 1
  return valid < baseline ? 0.65 : 0.25
}

type RawAssessment = {
  chart: Chart
  baseline: number
  baselineSource: RiskAssessment['baselineSource']
  ourContribution: number
  opponentContribution: number
  contributionEdge: number
  adjustedEdge: number
  dualThreat: number
  uncertainty: number
  secondaryContribution: number
}

function baselineFor(chart: Chart, baselineKey: 'baseline1' | 'baseline2') {
  return chart[baselineKey]
}

export function assessTeamPool(
  charts: Chart[],
  ours: [PlayerKey, PlayerKey],
  opponents: [PlayerKey, PlayerKey],
  round: 'round1' | 'round3',
) {
  const baselineKey = round === 'round1' ? 'baseline1' : 'baseline2'
  const defaultBaselineSource = round === 'round1' ? 'Imperial 1-1' : 'Imperial 1-2'
  const fallbackByLevel = new Map<number, number>()
  const baselineGroups = new Map<number, number[]>()
  for (const chart of charts) {
    const baseline = baselineFor(chart, baselineKey)
    if (baseline == null) continue
    const level = Math.round(chart.level * 10)
    if (!baselineGroups.has(level)) baselineGroups.set(level, [])
    baselineGroups.get(level)!.push(baseline)
  }
  for (const [level, values] of baselineGroups) fallbackByLevel.set(level, median(values))
  const raw: RawAssessment[] = charts.map((chart) => {
    const originalBaseline = baselineFor(chart, baselineKey)
    const baseline =
      originalBaseline ?? fallbackByLevel.get(Math.round(chart.level * 10)) ?? 0
    const ourContribution = ours.reduce(
      (sum, player) => sum + contribution(chart.scores[player], baseline),
      0,
    )
    const opponentContribution = opponents.reduce(
      (sum, player) => sum + contribution(chart.scores[player], baseline),
      0,
    )
    const contributionEdge = opponentContribution - ourContribution
    const adjustedOur = ours.reduce(
      (sum, player) => sum + adjustedDelta(chart.scores[player], baseline),
      0,
    )
    const adjustedOpponent = opponents.reduce(
      (sum, player) => sum + adjustedDelta(chart.scores[player], baseline),
      0,
    )
    const positiveOpponents = opponents.filter(
      (player) => contribution(chart.scores[player], baseline) > 0,
    ).length
    const allPlayers = [...ours, ...opponents]
    return {
      chart,
      baseline,
      baselineSource:
        originalBaseline == null ? '레벨 내 중앙값' : defaultBaselineSource,
      ourContribution,
      opponentContribution,
      contributionEdge,
      adjustedEdge: adjustedOpponent - adjustedOur,
      dualThreat: positiveOpponents === 2 ? 1 : positiveOpponents === 1 ? 0.35 : 0,
      uncertainty:
        allPlayers.reduce(
          (sum, player) => sum + uncertainty(chart.scores[player], baseline),
          0,
        ) / allPlayers.length,
      secondaryContribution: contribution(chart.scores[opponents[0]], baseline),
    }
  })

  const contributionEdges = raw.map((row) => row.contributionEdge)
  const adjustedEdges = raw.map((row) => row.adjustedEdge)
  const opponentContributions = raw.map((row) => row.opponentContribution)
  const secondaryContributions = raw.map((row) => row.secondaryContribution)
  const baselines = raw.map((row) => row.baseline)

  return new Map(
    raw.map((row) => {
      const edgePercentile = percentile(contributionEdges, row.contributionEdge)
      const adjustedPercentile = percentile(adjustedEdges, row.adjustedEdge)
      const firepowerPercentile = percentile(
        opponentContributions,
        row.opponentContribution,
      )
      const secondaryPercentile = percentile(
        secondaryContributions,
        row.secondaryContribution,
      )
      const hardness = 1 - percentile(baselines, row.baseline)
      const hardnessImpact =
        hardness * (0.4 + 0.6 * Math.max(edgePercentile, adjustedPercentile))
      const risk =
        round === 'round1'
          ? edgePercentile * 35 +
            adjustedPercentile * 25 +
            firepowerPercentile * 15 +
            row.dualThreat * 10 +
            hardnessImpact * 10 +
            row.uncertainty * 5
          : edgePercentile * 30 +
            adjustedPercentile * 20 +
            firepowerPercentile * 10 +
            secondaryPercentile * 15 +
            row.dualThreat * 15 +
            hardnessImpact * 5 +
            row.uncertainty * 5
      const reasons = []
      reasons.push(
        row.contributionEdge > 0
          ? `상대 기여 우위 ${signed(row.contributionEdge)}`
          : `우리 기여 우위 ${signed(-row.contributionEdge)}`,
      )
      if (row.dualThreat === 1) reasons.push('상대 두 명 모두 기준 이상')
      else if (row.opponentContribution > 0) reasons.push('상대 한 명만 기준 이상')
      else reasons.push('상대 기여 0')
      if (round === 'round3' && row.secondaryContribution > 0) {
        reasons.push(
          `${playerLabels[opponents[0]]} 기여 ${signed(row.secondaryContribution)}`,
        )
      }
      if (hardness >= 0.75) reasons.push('낮은 평균값')
      if (row.uncertainty >= 0.65) reasons.push('기록 불확실성 높음')
      const assessment: RiskAssessment = {
        chart: row.chart,
        baseline: row.baseline,
        baselineSource: row.baselineSource,
        ourContribution: row.ourContribution,
        opponentContribution: row.opponentContribution,
        contributionEdge: row.contributionEdge,
        adjustedEdge: row.adjustedEdge,
        dualThreat: row.dualThreat,
        uncertainty: row.uncertainty,
        risk: Math.round(risk * 10) / 10,
        worstCaseRisk: Math.round(clamp(risk + row.uncertainty * 10 + row.dualThreat * 3, 0, 100) * 10) / 10,
        reasons,
      }
      return [row.chart.id, assessment] as const
    }),
  )
}

export function assessDuelPool(charts: Chart[]) {
  const levelFallback = new Map<number, number>()
  const levelGroups = new Map<number, number[]>()
  for (const chart of charts) {
    const level = Math.round(chart.level * 10)
    if (!levelGroups.has(level)) levelGroups.set(level, [])
    const scores = [validScore(chart.scores.gusto), validScore(chart.scores.real)].filter(
      (value): value is number => value != null,
    )
    levelGroups.get(level)!.push(...scores)
  }
  for (const [level, scores] of levelGroups) levelFallback.set(level, median(scores))

  const raw = charts.map((chart) => {
    const duelBaseline = chart.duelBaseline
    const baseline = duelBaseline ?? levelFallback.get(Math.round(chart.level * 10)) ?? 0
    const gusto = validScore(chart.scores.gusto)
    const real = validScore(chart.scores.real)
    const provenGap = gusto != null && real != null ? real - gusto : 0
    const adjustedGap =
      adjustedDelta(chart.scores.real, baseline) -
      adjustedDelta(chart.scores.gusto, baseline)
    const contributionEdge =
      contribution(chart.scores.real, baseline) -
      contribution(chart.scores.gusto, baseline)
    const uncertaintyValue =
      (uncertainty(chart.scores.gusto, baseline) +
        uncertainty(chart.scores.real, baseline)) /
      2
    return {
      chart,
      baseline,
      baselineSource: chart.duelBaselineSource ?? '레벨 내 중앙값',
      provenGap,
      adjustedGap,
      contributionEdge,
      uncertainty: uncertaintyValue,
    } as const
  })
  const provenGaps = raw.map((row) => row.provenGap)
  const adjustedGaps = raw.map((row) => row.adjustedGap)
  const contributionEdges = raw.map((row) => row.contributionEdge)
  const baselines = raw.map((row) => row.baseline)

  return new Map(
    raw.map((row) => {
      const provenPercentile = percentile(provenGaps, row.provenGap)
      const adjustedPercentile = percentile(adjustedGaps, row.adjustedGap)
      const edgePercentile = percentile(contributionEdges, row.contributionEdge)
      const hardness = 1 - percentile(baselines, row.baseline)
      const hardnessImpact =
        hardness * (0.4 + 0.6 * Math.max(provenPercentile, adjustedPercentile))
      const risk =
        provenPercentile * 30 +
        adjustedPercentile * 30 +
        edgePercentile * 20 +
        hardnessImpact * 10 +
        row.uncertainty * 10
      const gustoKnown = validScore(row.chart.scores.gusto) != null
      const realKnown = validScore(row.chart.scores.real) != null
      const reasons = [
        gustoKnown && realKnown
          ? row.provenGap > 0
            ? `ㄹㅇ이가 실제 기록 우위 ${signed(row.provenGap)}`
            : `구스토 실제 기록 우위 ${signed(-row.provenGap)}`
          : '실제 기록 비교 불가',
        row.adjustedGap > 0
          ? `보정 후 상대 우위 ${signed(row.adjustedGap)}`
          : row.adjustedGap < 0
            ? `보정 후 구스토 우위 ${signed(-row.adjustedGap)}`
            : '보정 비교 중립',
      ]
      if (hardness >= 0.75) reasons.push('낮은 기준값')
      if (row.uncertainty >= 0.65) reasons.push('기록 불확실성 높음')
      const assessment: RiskAssessment = {
        chart: row.chart,
        baseline: row.baseline,
        baselineSource: row.baselineSource,
        ourContribution: contribution(row.chart.scores.gusto, row.baseline),
        opponentContribution: contribution(row.chart.scores.real, row.baseline),
        contributionEdge: row.contributionEdge,
        adjustedEdge: row.adjustedGap,
        dualThreat: 0,
        uncertainty: row.uncertainty,
        risk: Math.round(risk * 10) / 10,
        worstCaseRisk: Math.round(clamp(risk + row.uncertainty * 12, 0, 100) * 10) / 10,
        reasons,
      }
      return [row.chart.id, assessment] as const
    }),
  )
}

export function recommendationConfidence(ranked: RiskAssessment[]) {
  if (ranked.length < 2) return 50
  const gap = ranked[0].risk - ranked[1].risk
  return Math.round(clamp(52 + gap * 2 - ranked[0].uncertainty * 60, 30, 95))
}
