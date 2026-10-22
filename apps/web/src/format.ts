export function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return '刚刚'
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export function seconds(ms: number): string {
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)} 秒` : `${Math.round(ms / 1000)} 秒`
}

const NUMERIC = /^-?\d+(\.\d+)?$/

export function isNumeric(value: unknown): boolean {
  return typeof value === 'number' || (typeof value === 'string' && NUMERIC.test(value))
}

export function cellText(value: unknown, column?: string): string {
  if (value === null || value === undefined || value === '') return '—'
  // Identifiers and codes are labels, not quantities.
  if (column && /(^id$|_id$|code$|number$)/.test(column)) return String(value)
  if (typeof value === 'number') return value.toLocaleString('zh-CN')
  // Five digits and up: counts sent as text. Four-digit strings are usually years ('2020').
  if (typeof value === 'string' && /^-?\d{5,}$/.test(value)) return Number(value).toLocaleString('zh-CN')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** Readable Chinese names for the columns the tools return. */
export const COLUMN_LABELS: Record<string, string> = {
  id: 'ID',
  company_name: '公司名称',
  registration_status: '登记状态',
  enterprise_size: '规模',
  registered_capital: '注册资本',
  paid_in_capital: '实缴资本',
  established_date: '成立日期',
  approved_date: '核准日期',
  business_term: '营业期限',
  province: '省份',
  city: '城市',
  district_county: '区县',
  enterprise_type: '企业类型',
  industry_category: '行业门类',
  industry_major: '行业大类',
  industry_subcategory: '行业中类',
  unified_social_credit_code: '统一社会信用代码',
  insured_person_count: '参保人数',
  legal_representative: '法定代表人',
  valid_mobile_phone: '手机号',
  more_phones: '更多电话',
  email: '邮箱',
  other_email: '其他邮箱',
  registered_address: '注册地址',
  latest_annual_report_address: '年报地址',
  mailing_address: '通信地址',
  website: '网址',
  business_scope: '经营范围',
  former_names: '曾用名',
  tianyan_score: '天眼评分',
  score: '相似度',
  matched: '命中关键词',
  source: '来源',
}
