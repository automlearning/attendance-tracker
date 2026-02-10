export type UserRole = 'admin' | 'user'

export interface User {
  id: number
  email: string
  full_name: string
  role: UserRole
  is_active: boolean
  created_at: string
}

export type AttendanceStatus = 'in_office' | 'wfh' | 'annual_leave' | 'sick_leave' | 'holiday'

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
  total_workdays: number
  in_office_days: number
  wfh_days: number
  annual_leave_days: number
  sick_leave_days: number
  attendance_percentage: number
  office_percentage: number
}

export interface AIGreeting {
  greeting: string
  features: string[]
  quick_tip: string
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

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
}
