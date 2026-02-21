import axios from 'axios'
import type {
  User,
  AttendanceLog,
  AttendanceSummary,
  Target,
  TargetProgress,
  AuthTokens,
  AttendanceStatus,
  ParsedAttendanceEntry,
  Suggestion,
  AIGreeting,
  AICoaching,
  PublicHoliday
} from '@/types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/api/v1/auth/refresh`, {
            refresh_token: refreshToken,
          })
          const { access_token, refresh_token } = response.data
          localStorage.setItem('access_token', access_token)
          localStorage.setItem('refresh_token', refresh_token)
          originalRequest.headers.Authorization = `Bearer ${access_token}`
          return api(originalRequest)
        } catch {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  login: async (email: string, password: string): Promise<AuthTokens> => {
    const formData = new FormData()
    formData.append('username', email)
    formData.append('password', password)
    const response = await api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  register: async (email: string, password: string, fullName: string): Promise<User> => {
    const response = await api.post('/auth/register', {
      email,
      password,
      full_name: fullName,
    })
    return response.data
  },

  getMe: async (): Promise<User> => {
    const response = await api.get('/auth/me')
    return response.data
  },

  forgotPassword: async (email: string): Promise<{ message: string }> => {
    const response = await api.post('/auth/forgot-password', { email })
    return response.data
  },

  resetPassword: async (token: string, newPassword: string): Promise<{ message: string }> => {
    const response = await api.post('/auth/reset-password', { token, new_password: newPassword })
    return response.data
  },

  verifyResetToken: async (token: string): Promise<{ valid: boolean }> => {
    const response = await api.get(`/auth/verify-reset-token?token=${token}`)
    return response.data
  },
}

// Users API
export const usersApi = {
  getProfile: async (): Promise<User> => {
    const response = await api.get('/users/profile')
    return response.data
  },

  updateProfile: async (data: { email?: string; full_name?: string; target_percentage?: number }): Promise<User> => {
    const response = await api.put('/users/profile', data)
    return response.data
  },

  updateTarget: async (targetPercentage: number): Promise<User> => {
    const response = await api.put('/users/profile', { target_percentage: targetPercentage })
    return response.data
  },

  markIntroSeen: async (): Promise<User> => {
    const response = await api.put('/users/profile/intro-seen')
    return response.data
  },
}

// Attendance API
export const attendanceApi = {
  list: async (startDate?: string, endDate?: string): Promise<AttendanceLog[]> => {
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
    const response = await api.get(`/attendance?${params}`)
    return response.data
  },

  create: async (date: string, status: AttendanceStatus, notes?: string): Promise<AttendanceLog> => {
    const response = await api.post('/attendance', { date, status, notes })
    return response.data
  },

  quickLog: async (status: AttendanceStatus, date?: string): Promise<AttendanceLog> => {
    const params = new URLSearchParams()
    params.append('status', status)
    if (date) params.append('log_date', date)
    const response = await api.post(`/attendance/quick?${params}`)
    return response.data
  },

  getSummary: async (startDate: string, endDate: string): Promise<AttendanceSummary> => {
    const response = await api.get(`/attendance/summary?start_date=${startDate}&end_date=${endDate}`)
    return response.data
  },

  getCalendarView: async (year: number, month: number): Promise<AttendanceLog[]> => {
    const response = await api.get(`/attendance/calendar?year=${year}&month=${month}`)
    return response.data
  },

  update: async (id: number, status: AttendanceStatus, notes?: string): Promise<AttendanceLog> => {
    const response = await api.put(`/attendance/${id}`, { status, notes })
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/attendance/${id}`)
  },

  getMonthlyHistory: async (months?: number): Promise<{
    financial_year: string
    fy_start: string
    months: {
      month: string
      month_start: string
      month_end: string
      business_days: number
      work_days: number
      office_days: number
      wfh_days: number
      leave_days: number
      exempt_days: number
      office_percentage: number
      target_percentage: number
      met_target: boolean
    }[]
    ytd_summary: {
      total_office_days: number
      total_wfh_days: number
      total_leave_days: number
      total_exempt_days: number
      total_work_days: number
      ytd_percentage: number
      avg_monthly_percentage: number
      target_percentage: number
      met_target: boolean
      months_counted: number
    }
  }> => {
    const params = months ? `?months=${months}` : ''
    const response = await api.get(`/attendance/monthly-history${params}`)
    return response.data
  },

  generateTestData: async (months: number = 6, clearExisting: boolean = false): Promise<{
    success: boolean
    message: string
    monthly_stats: {
      month: string
      office_days: number
      wfh_days: number
      leave_days: number
      sick_days: number
      total_days: number
      office_percentage: number
      met_target: boolean
    }[]
  }> => {
    const response = await api.post(`/attendance/generate-test-data?months=${months}&clear_existing=${clearExisting}`)
    return response.data
  },
}

// Targets API
export const targetsApi = {
  list: async (): Promise<Target[]> => {
    const response = await api.get('/targets')
    return response.data
  },

  getCurrent: async (): Promise<Target> => {
    const response = await api.get('/targets/current')
    return response.data
  },

  getProgress: async (): Promise<TargetProgress> => {
    const response = await api.get('/targets/progress')
    return response.data
  },

  create: async (target: Omit<Target, 'id' | 'user_id' | 'is_active' | 'created_at'>): Promise<Target> => {
    const response = await api.post('/targets', target)
    return response.data
  },

  update: async (id: number, target: Partial<Target>): Promise<Target> => {
    const response = await api.put(`/targets/${id}`, target)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/targets/${id}`)
  },
}

// AI API
export const aiApi = {
  getGreeting: async (): Promise<AIGreeting> => {
    const response = await api.get('/ai/greeting')
    return response.data
  },

  parseNaturalLanguage: async (text: string): Promise<{
    success: boolean
    entries: ParsedAttendanceEntry[]
    message?: string
  }> => {
    const response = await api.post('/ai/parse-natural-language', { text })
    return response.data
  },

  getSuggestions: async (): Promise<{ suggestions: Suggestion[] }> => {
    const response = await api.get('/ai/suggestions')
    return response.data
  },

  getCoaching: async (): Promise<AICoaching> => {
    const response = await api.get('/ai/coaching')
    return response.data
  },

  chat: async (message: string): Promise<{ response: string; suggestions?: string[] }> => {
    const response = await api.post('/ai/chat', { message })
    return response.data
  },

  submitFeedback: async (data: {
    user_message: string
    ai_response: string
    rating: 'thumbs_up' | 'thumbs_down'
    comment?: string
  }): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/ai/feedback', data)
    return response.data
  },

  transcribeAudio: async (audioBlob: Blob): Promise<{ success: boolean; text?: string; error?: string }> => {
    const formData = new FormData()
    formData.append('audio', audioBlob, 'recording.webm')
    const response = await api.post('/ai/transcribe', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  getIntro: async (): Promise<{ greeting: string; insights: string[]; action_items: string[] }> => {
    const response = await api.get('/ai/intro')
    return response.data
  },
}

// Holidays API
export const holidaysApi = {
  list: async (year?: number): Promise<PublicHoliday[]> => {
    const params = year ? `?year=${year}` : ''
    const response = await api.get(`/holidays${params}`)
    return response.data
  },

  create: async (data: { date: string; name: string; region?: string }): Promise<PublicHoliday> => {
    const response = await api.post('/holidays', data)
    return response.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/holidays/${id}`)
  },
}

// Admin API
export const adminApi = {
  getStats: async () => {
    const response = await api.get('/admin/stats')
    return response.data
  },

  listUsers: async (): Promise<User[]> => {
    const response = await api.get('/admin/users')
    return response.data
  },

  createUser: async (data: {
    email: string
    password: string
    full_name: string
    role: 'admin' | 'user'
  }): Promise<User> => {
    const response = await api.post('/admin/users', data)
    return response.data
  },

  updateUser: async (id: number, data: Partial<User>): Promise<User> => {
    const response = await api.put(`/admin/users/${id}`, data)
    return response.data
  },

  deactivateUser: async (id: number): Promise<void> => {
    await api.delete(`/admin/users/${id}`)
  },
}

export default api
