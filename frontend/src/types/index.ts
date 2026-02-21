export type UserRole = 'admin' | 'user'

export interface User {
  id: number
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  target_percentage: number
  created_at: string
  has_seen_intro?: boolean
}

export type AttendanceStatus = 'in_office' | 'wfh' | 'wfh_exempt' | 'annual_leave' | 'sick_leave' | 'public_holiday' | 'planned_office' | 'planned_wfh'

export interface AttendanceLog {
  id: number
  user_id: number
  date: string
  status: AttendanceStatus
  source: 'manual' | 'calendar_sync' | 'ai_nlp'
  notes: string | null
  created_at: string
}

export interface AttendanceSummary {
  period_start: string
  period_end: string
  business_days: number  // Weekdays minus public holidays
  leave_days: number  // Annual leave + sick leave
  exempt_days: number  // Discretionary WFH exemptions
  work_days: number  // Business days - leave - exemptions
  office_days: number  // Days actually in office
  wfh_days: number  // Regular WFH days
  planned_office_days: number  // Future planned office days
  planned_wfh_days: number  // Future planned WFH days
  office_percentage: number  // office_days / business_days (actual %)
  total_percentage: number  // (office_days + planned_office_days) / business_days
  target_percentage: number  // 50%
}

export interface AIGreeting {
  greeting: string
  features: string[]
  quick_tip: string
}

export interface PublicHoliday {
  id: number
  date: string
  name: string
  region: string
}

export type PeriodType = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface Target {
  id: number
  user_id: number
  period_type: PeriodType
  period_start: string
  period_end: string
  office_percentage: number
  is_active: boolean
  created_at: string
}

export interface TargetProgress {
  target: Target
  current_percentage: number
  days_in_office: number
  total_workdays: number
  days_remaining: number
  days_needed_to_meet_target: number
  on_track: boolean
}

export interface ParsedAttendanceEntry {
  date: string
  status: AttendanceStatus
  confidence: number
}

export interface Suggestion {
  type: 'reminder' | 'recommendation' | 'warning'
  message: string
  priority: number
}

export interface AICoaching {
  status: 'on_track' | 'at_risk' | 'behind' | 'no_data'
  headline: string
  message: string
  action_items: string[]
  stats: {
    office_days: number
    wfh_days: number
    leave_days: number
    exempt_days: number
    business_days: number
    work_days: number
    remaining_days: number
    current_percentage: number
    target_percentage: number
    target_office_days: number
    days_needed: number
    days_ahead: number
    can_meet_target: boolean
  }
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
}
