export type PlayerKey =
  | 'gusto'
  | 'cooksie'
  | 'mindblow'
  | 'real'
  | 'marirang'
  | 'fulfil'

export type Chart = {
  id: string
  title: string
  artist: string
  difficulty: string
  level: number
  bpm: string
  version: string
  baseline1: number | null
  baseline2: number | null
  duelBaseline: number | null
  duelBaselineSource: 'Imperial 1-1' | 'Imperial 1-2' | null
  scores: Record<PlayerKey, number | null>
}

export type FinalsData = {
  generatedAt: string
  sourceSummary: Record<string, number>
  pools: {
    round1: Chart[]
    round2: Chart[]
    round3: Chart[]
    round4: Chart[]
  }
}

export type RiskAssessment = {
  chart: Chart
  baseline: number
  baselineSource: 'Imperial 1-1' | 'Imperial 1-2' | '레벨 내 중앙값'
  ourContribution: number
  opponentContribution: number
  contributionEdge: number
  adjustedEdge: number
  dualThreat: number
  uncertainty: number
  risk: number
  worstCaseRisk: number
  reasons: string[]
}

export const playerLabels: Record<PlayerKey, string> = {
  gusto: '구스토',
  cooksie: '쿠크시',
  mindblow: 'Mindblow',
  real: '#ㄹㅇ이가',
  marirang: '마리랑',
  fulfil: 'FULFIL',
}
