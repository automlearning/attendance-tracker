import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/authStore'
import { attendanceApi, targetsApi, aiApi, holidaysApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { AttendanceSummary, TargetProgress, AttendanceStatus, Suggestion, ParsedAttendanceEntry, AIGreeting, AICoaching, AttendanceLog, PublicHoliday } from '@/types'
import {
  Building2,
  Home,
  CalendarOff,
  Target,
  TrendingUp,
  AlertCircle,
  Lightbulb,
  Send,
  CheckCircle2,
  Thermometer,
  Sparkles,
  ShieldCheck,
  Calendar,
  MessageCircle,
  ArrowRight,
  Mic,
  MicOff,
  Loader2
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, parseISO, isAfter, startOfDay } from 'date-fns'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'

// Extended summary with forecasting fields
interface ExtendedSummary extends AttendanceSummary {
  future_unlogged_days: number  // Future business days not yet logged
  future_available_days: number  // Future days you could go to office (unlogged + planned WFH)
}

// Calculate summary from calendar data (same logic as backend)
function calculateSummaryFromCalendar(
  logs: AttendanceLog[],
  holidays: PublicHoliday[],
  monthStart: Date,
  monthEnd: Date
): ExtendedSummary {
  const today = startOfDay(new Date())

  // Get all days in the month
  const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Count weekdays (Mon-Fri)
  const weekdays = allDays.filter(day => !isWeekend(day))

  // Get holiday dates that fall on weekdays
  const holidayDates = new Set(
    holidays
      .filter(h => {
        const hDate = parseISO(h.date)
        return !isWeekend(hDate)
      })
      .map(h => h.date)
  )

  // Business days = weekdays - public holidays on weekdays
  const businessDaysList = weekdays.filter(day => !holidayDates.has(format(day, 'yyyy-MM-dd')))
  const businessDays = businessDaysList.length

  // Get logged dates
  const loggedDates = new Set(logs.map(log => log.date))

  // Count future business days that are NOT logged yet (days you can still go to office)
  const futureUnloggedDays = businessDaysList.filter(day => {
    const dayStr = format(day, 'yyyy-MM-dd')
    return isAfter(startOfDay(day), today) && !loggedDates.has(dayStr)
  }).length

  // Count by status based on date (future = planned, past/today = actual)
  let officeDays = 0
  let plannedOfficeDays = 0
  let wfhDays = 0
  let plannedWfhDays = 0
  let exemptDays = 0
  let annualLeave = 0
  let sickLeave = 0

  for (const log of logs) {
    const logDate = parseISO(log.date)
    const isFuture = isAfter(startOfDay(logDate), today)

    switch (log.status) {
      case 'in_office':
        if (isFuture) {
          plannedOfficeDays++
        } else {
          officeDays++
        }
        break
      case 'wfh':
        if (isFuture) {
          plannedWfhDays++
        } else {
          wfhDays++
        }
        break
      case 'planned_office':
        plannedOfficeDays++
        break
      case 'planned_wfh':
        plannedWfhDays++
        break
      case 'wfh_exempt':
        exemptDays++
        break
      case 'annual_leave':
        annualLeave++
        break
      case 'sick_leave':
        sickLeave++
        break
    }
  }

  const leaveDays = annualLeave + sickLeave
  const workDays = businessDays - leaveDays - exemptDays

  // Office % = Office Days / Work Days (business days minus leave/exempt)
  // This gives the true percentage of "eligible" days you went to office
  const officePercentage = workDays > 0 ? Math.round((officeDays / workDays) * 100) : 0

  // Total % = (Office Days + Planned Office Days) / Work Days
  const totalPercentage = workDays > 0 ? Math.round(((officeDays + plannedOfficeDays) / workDays) * 100) : 0

  // Available days = future unlogged + future WFH (can change WFH to office)
  const futureAvailableDays = futureUnloggedDays + plannedWfhDays

  return {
    period_start: format(monthStart, 'yyyy-MM-dd'),
    period_end: format(monthEnd, 'yyyy-MM-dd'),
    business_days: businessDays,
    leave_days: leaveDays,
    exempt_days: exemptDays,
    work_days: workDays,
    office_days: officeDays,
    wfh_days: wfhDays,
    planned_office_days: plannedOfficeDays,
    planned_wfh_days: plannedWfhDays,
    office_percentage: Math.round(officePercentage * 10) / 10,
    total_percentage: Math.round(totalPercentage * 10) / 10,
    future_unlogged_days: futureUnloggedDays,
    future_available_days: futureAvailableDays,
    target_percentage: 50.0,
  }
}

export function DashboardPage() {
  const { user } = useAuthStore()
  const [summary, setSummary] = useState<ExtendedSummary | null>(null)
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [holidays, setHolidays] = useState<PublicHoliday[]>([])
  const [progress, setProgress] = useState<TargetProgress | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [greeting, setGreeting] = useState<AIGreeting | null>(null)
  const [coaching, setCoaching] = useState<AICoaching | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [quickLogLoading, setQuickLogLoading] = useState<AttendanceStatus | null>(null)
  const [todayLogged, setTodayLogged] = useState<AttendanceStatus | null>(null)

  // Natural language input
  const [nlInput, setNlInput] = useState('')
  const [nlParsing, setNlParsing] = useState(false)
  const [parsedEntries, setParsedEntries] = useState<ParsedAttendanceEntry[]>([])
  const [nlMessage, setNlMessage] = useState('')

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  useEffect(() => {
    loadDashboardData()
    loadGreeting()
    loadCoaching()
  }, [user?.target_percentage])

  const loadGreeting = async () => {
    try {
      const greetingData = await aiApi.getGreeting()
      setGreeting(greetingData)
    } catch (error) {
      console.error('Failed to load greeting:', error)
    }
  }

  const loadCoaching = async () => {
    try {
      const coachingData = await aiApi.getCoaching()
      setCoaching(coachingData)
    } catch (error) {
      console.error('Failed to load coaching:', error)
    }
  }

  const loadDashboardData = async () => {
    setIsLoading(true)
    try {
      const today = new Date()
      const monthStartDate = startOfMonth(today)
      const monthEndDate = endOfMonth(today)
      const year = today.getFullYear()
      const month = today.getMonth() + 1

      // Load calendar data and holidays (same data source as Attendance Calendar page)
      const [calendarData, holidayData] = await Promise.all([
        attendanceApi.getCalendarView(year, month),
        holidaysApi.list(year)
      ])

      setLogs(calendarData)
      setHolidays(holidayData)

      // Calculate summary from calendar data (same logic as backend)
      const calculatedSummary = calculateSummaryFromCalendar(
        calendarData,
        holidayData,
        monthStartDate,
        monthEndDate
      )
      setSummary(calculatedSummary)

      // Load target progress
      try {
        const progressData = await targetsApi.getProgress()
        setProgress(progressData)
      } catch {
        // No active target
      }

      // Load suggestions
      try {
        const suggestionsData = await aiApi.getSuggestions()
        setSuggestions(suggestionsData.suggestions)
      } catch {
        // AI suggestions failed
      }

      // Check if today is logged from the calendar data
      const todayStr = format(today, 'yyyy-MM-dd')
      const todayLog = calendarData.find(log => log.date === todayStr)
      if (todayLog) {
        setTodayLogged(todayLog.status)
      } else {
        setTodayLogged(null)
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickLog = async (status: AttendanceStatus) => {
    setQuickLogLoading(status)
    try {
      await attendanceApi.quickLog(status)
      setTodayLogged(status)
      await loadDashboardData()
    } catch (error) {
      console.error('Quick log failed:', error)
    } finally {
      setQuickLogLoading(null)
    }
  }

  const handleNLParse = async () => {
    if (!nlInput.trim()) return

    setNlParsing(true)
    setParsedEntries([])
    setNlMessage('')

    try {
      const result = await aiApi.parseNaturalLanguage(nlInput)
      if (result.success && result.entries.length > 0) {
        setParsedEntries(result.entries)
        setNlMessage(result.message || '')
      } else {
        setNlMessage(result.message || 'Could not parse input')
      }
    } catch (error) {
      setNlMessage('Failed to parse input')
    } finally {
      setNlParsing(false)
    }
  }

  const confirmParsedEntries = async () => {
    try {
      for (const entry of parsedEntries) {
        await attendanceApi.quickLog(entry.status, entry.date)
      }
      setParsedEntries([])
      setNlInput('')
      setNlMessage('Entries saved successfully!')
      await loadDashboardData()
    } catch (error) {
      setNlMessage('Failed to save entries')
    }
  }

  // Voice recording handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach(track => track.stop())
        await transcribeAndParse(audioBlob)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error('Error accessing microphone:', error)
      setNlMessage('Could not access microphone. Please check permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const transcribeAndParse = async (audioBlob: Blob) => {
    setIsTranscribing(true)
    setNlMessage('Transcribing...')
    try {
      const result = await aiApi.transcribeAudio(audioBlob)
      if (result.success && result.text) {
        setNlInput(result.text)
        setNlMessage('Transcribed! Parsing...')
        // Auto-parse the transcribed text
        setNlParsing(true)
        const parseResult = await aiApi.parseNaturalLanguage(result.text)
        if (parseResult.success && parseResult.entries.length > 0) {
          setParsedEntries(parseResult.entries)
          setNlMessage(parseResult.message || 'Review and confirm entries below')
        } else {
          setNlMessage(parseResult.message || 'Could not parse - try typing instead')
        }
        setNlParsing(false)
      } else {
        setNlMessage(result.error || 'Could not transcribe audio')
      }
    } catch (error) {
      console.error('Error transcribing audio:', error)
      setNlMessage('Transcription failed - try again')
    } finally {
      setIsTranscribing(false)
    }
  }

  const getStatusIcon = (status: AttendanceStatus) => {
    switch (status) {
      case 'in_office': return <Building2 className="h-4 w-4" />
      case 'wfh': return <Home className="h-4 w-4" />
      case 'wfh_exempt': return <ShieldCheck className="h-4 w-4" />
      case 'annual_leave': return <CalendarOff className="h-4 w-4" />
      case 'sick_leave': return <Thermometer className="h-4 w-4" />
      case 'public_holiday': return <Calendar className="h-4 w-4" />
      case 'planned_office': return <Building2 className="h-4 w-4" />
      case 'planned_wfh': return <Home className="h-4 w-4" />
      default: return null
    }
  }

  const getStatusLabel = (status: AttendanceStatus) => {
    switch (status) {
      case 'in_office': return 'In Office'
      case 'wfh': return 'WFH'
      case 'wfh_exempt': return 'WFH (Exempt)'
      case 'annual_leave': return 'Annual Leave'
      case 'sick_leave': return 'Sick Leave'
      case 'public_holiday': return 'Public Holiday'
      case 'planned_office': return 'Planned: Office'
      case 'planned_wfh': return 'Planned: WFH'
      default: return status
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* AI Greeting Section */}
      {greeting && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-full">
                <Sparkles className="h-5 w-5 text-cyan-500" />
              </div>
              <div className="flex-1 space-y-3">
                <p className="text-lg font-medium text-blue-900">{greeting.greeting}</p>
                {greeting.features.length > 0 && (
                  <ul className="space-y-1 text-sm text-blue-800">
                    {greeting.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-cyan-500 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-sm text-blue-700 font-medium mt-2">
                  {greeting.quick_tip}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold">Welcome back, {user?.full_name?.split(' ')[0]}!</h1>
        <p className="text-muted-foreground">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Attendance Summary Cards - At the top for visibility */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Actual Attendance */}
        <Card className="border-2 border-cyan-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4 text-cyan-500" />
              Actual Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-3xl font-bold text-cyan-500 cursor-help"
              title="Office days logged up to and including today"
            >
              {summary?.office_days || 0} days
            </div>
            <div
              className={`text-lg font-semibold cursor-help ${(summary?.office_percentage || 0) >= 50 ? 'text-green-600' : 'text-amber-600'}`}
              title="Actual office days ÷ Work days (business days minus leave/exempt)"
            >
              {summary?.office_percentage || 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              of {summary?.work_days || 0} work days
            </p>
          </CardContent>
        </Card>

        {/* Planned Attendance */}
        <Card className="border-2 border-cyan-300 border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-cyan-300" />
              Planned Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-3xl font-bold text-cyan-300 cursor-help"
              title="Future office days you've scheduled (not yet occurred)"
            >
              {summary?.planned_office_days || 0} days
            </div>
            <div
              className="text-lg font-semibold text-cyan-300 cursor-help"
              title="Planned office days ÷ Work days this month"
            >
              +{summary?.work_days ? Math.round((summary?.planned_office_days || 0) / summary.work_days * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              planned for this month
            </p>
          </CardContent>
        </Card>

        {/* Total (Actual + Planned) */}
        <Card className={`border-2 ${(summary?.total_percentage || 0) >= 50 ? 'border-green-400 bg-green-50/50' : 'border-amber-400 bg-amber-50/50'}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-3xl font-bold cursor-help"
              title="Actual + Planned office days"
            >
              {(summary?.office_days || 0) + (summary?.planned_office_days || 0)} days
            </div>
            <div
              className={`text-lg font-semibold cursor-help ${(summary?.total_percentage || 0) >= 50 ? 'text-green-600' : 'text-amber-600'}`}
              title="(Actual + Planned) ÷ Total business days. Target is 50%."
            >
              {summary?.total_percentage || 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(summary?.total_percentage || 0) >= 50
                ? '✓ On track to meet 50% target'
                : `${50 - (summary?.total_percentage || 0)}% below 50% target`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* AI Coaching Card */}
      {coaching && (
        <Card className={`border-2 ${
          coaching.status === 'on_track' ? 'border-green-200 bg-gradient-to-r from-green-50 to-emerald-50' :
          coaching.status === 'at_risk' ? 'border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50' :
          coaching.status === 'behind' ? 'border-red-200 bg-gradient-to-r from-red-50 to-orange-50' :
          'border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50'
        }`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className={`p-2 rounded-full ${
                coaching.status === 'on_track' ? 'bg-green-100' :
                coaching.status === 'at_risk' ? 'bg-amber-100' :
                coaching.status === 'behind' ? 'bg-red-100' :
                'bg-blue-100'
              }`}>
                <MessageCircle className={`h-5 w-5 ${
                  coaching.status === 'on_track' ? 'text-green-600' :
                  coaching.status === 'at_risk' ? 'text-amber-600' :
                  coaching.status === 'behind' ? 'text-red-600' :
                  'text-cyan-500'
                }`} />
              </div>
              <span className={
                coaching.status === 'on_track' ? 'text-green-900' :
                coaching.status === 'at_risk' ? 'text-amber-900' :
                coaching.status === 'behind' ? 'text-red-900' :
                'text-blue-900'
              }>{coaching.headline}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className={`text-sm ${
              coaching.status === 'on_track' ? 'text-green-800' :
              coaching.status === 'at_risk' ? 'text-amber-800' :
              coaching.status === 'behind' ? 'text-red-800' :
              'text-blue-800'
            }`}>{coaching.message}</p>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white/50 rounded-lg p-3 text-center cursor-help" title="Days you've been in the office this month">
                <div className="text-2xl font-bold text-cyan-500">{coaching.stats.office_days}</div>
                <div className="text-xs text-muted-foreground">Office Days</div>
              </div>
              <div className="bg-white/50 rounded-lg p-3 text-center cursor-help" title="Office days needed to meet target percentage">
                <div className="text-2xl font-bold text-purple-600">{coaching.stats.target_office_days}</div>
                <div className="text-xs text-muted-foreground">Target ({coaching.stats.target_percentage}%)</div>
              </div>
              <div className="bg-white/50 rounded-lg p-3 text-center cursor-help" title="Actual office attendance to date (office days ÷ business days)">
                <div className={`text-2xl font-bold ${coaching.stats.current_percentage >= coaching.stats.target_percentage ? 'text-green-600' : 'text-amber-600'}`}>
                  {coaching.stats.current_percentage}%
                </div>
                <div className="text-xs text-muted-foreground">Actual %</div>
              </div>
              <div className="bg-white/50 rounded-lg p-3 text-center cursor-help" title="Business days minus leave/exempt. Used for % calculation.">
                <div className="text-2xl font-bold text-slate-600">{coaching.stats.work_days}</div>
                <div className="text-xs text-muted-foreground">Work Days</div>
              </div>
              <div className="bg-white/50 rounded-lg p-3 text-center cursor-help" title="Business days remaining in the month">
                <div className="text-2xl font-bold text-cyan-400">{coaching.stats.remaining_days}</div>
                <div className="text-xs text-muted-foreground">Days Left</div>
              </div>
            </div>

            {/* Action Items */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">What to do:</p>
              <ul className="space-y-2">
                {coaching.action_items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <ArrowRight className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                      coaching.status === 'on_track' ? 'text-green-600' :
                      coaching.status === 'at_risk' ? 'text-amber-600' :
                      coaching.status === 'behind' ? 'text-red-600' :
                      'text-cyan-500'
                    }`} />
                    <span className="text-slate-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Days needed callout for at-risk or behind */}
            {(coaching.status === 'at_risk' || coaching.status === 'behind') && coaching.stats.days_needed > 0 && (
              <div className={`p-3 rounded-lg ${
                coaching.status === 'at_risk' ? 'bg-amber-100' : 'bg-red-100'
              }`}>
                <p className={`text-sm font-medium ${
                  coaching.status === 'at_risk' ? 'text-amber-800' : 'text-red-800'
                }`}>
                  {coaching.stats.can_meet_target
                    ? `You need ${coaching.stats.days_needed} more office day${coaching.stats.days_needed > 1 ? 's' : ''} to hit ${coaching.stats.target_percentage}%`
                    : `Even with all remaining days in office, you'll reach ${((coaching.stats.office_days + coaching.stats.remaining_days) / coaching.stats.business_days * 100).toFixed(1)}%`
                  }
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Log Section */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Log</CardTitle>
          <CardDescription>
            {todayLogged
              ? `Today logged as: ${getStatusLabel(todayLogged)}`
              : 'Log your attendance for today'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              variant={todayLogged === 'in_office' ? 'default' : 'outline'}
              onClick={() => handleQuickLog('in_office')}
              disabled={quickLogLoading !== null}
              className="flex-1 min-w-[120px]"
              style={todayLogged === 'in_office' ? { backgroundColor: '#00bfff' } : {}}
            >
              <Building2 className="h-5 w-5 mr-2" />
              {quickLogLoading === 'in_office' ? 'Logging...' : 'In Office'}
            </Button>
            <Button
              size="lg"
              variant={todayLogged === 'wfh' ? 'default' : 'outline'}
              onClick={() => handleQuickLog('wfh')}
              disabled={quickLogLoading !== null}
              className={`flex-1 min-w-[120px] ${todayLogged === 'wfh' ? 'bg-gray-500 hover:bg-gray-600' : ''}`}
            >
              <Home className="h-5 w-5 mr-2" />
              {quickLogLoading === 'wfh' ? 'Logging...' : 'WFH'}
            </Button>
            <Button
              size="lg"
              variant={todayLogged === 'wfh_exempt' ? 'default' : 'outline'}
              onClick={() => handleQuickLog('wfh_exempt')}
              disabled={quickLogLoading !== null}
              className="flex-1 min-w-[120px]"
              title="Approved WFH that doesn't count against 50% target"
            >
              <ShieldCheck className="h-5 w-5 mr-2" />
              {quickLogLoading === 'wfh_exempt' ? 'Logging...' : 'WFH Exempt'}
            </Button>
            <Button
              size="lg"
              variant={todayLogged === 'annual_leave' ? 'default' : 'outline'}
              onClick={() => handleQuickLog('annual_leave')}
              disabled={quickLogLoading !== null}
              className={`flex-1 min-w-[120px] ${todayLogged === 'annual_leave' ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
            >
              <CalendarOff className="h-5 w-5 mr-2" />
              {quickLogLoading === 'annual_leave' ? 'Logging...' : 'Leave'}
            </Button>
            <Button
              size="lg"
              variant={todayLogged === 'sick_leave' ? 'default' : 'outline'}
              onClick={() => handleQuickLog('sick_leave')}
              disabled={quickLogLoading !== null}
              className={`flex-1 min-w-[120px] ${todayLogged === 'sick_leave' ? 'bg-red-600 hover:bg-red-700' : ''}`}
            >
              <Thermometer className="h-5 w-5 mr-2" />
              {quickLogLoading === 'sick_leave' ? 'Logging...' : 'Sick'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Natural Language Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Log with AI
          </CardTitle>
          <CardDescription>
            Type or speak naturally, e.g., "I was in office Monday and Tuesday, WFH Wednesday"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {/* Voice recording button */}
            <Button
              type="button"
              variant={isRecording ? "destructive" : "outline"}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={nlParsing || isTranscribing}
              title={isRecording ? "Stop recording" : "Voice input"}
            >
              {isTranscribing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isRecording ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
            <Input
              placeholder={isRecording ? "Recording... click mic to stop" : "Describe your attendance..."}
              value={nlInput}
              onChange={(e) => setNlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNLParse()}
              disabled={isRecording}
              className="flex-1"
            />
            <Button onClick={handleNLParse} disabled={nlParsing || !nlInput.trim() || isRecording}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {isRecording && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Recording... Click the microphone button to stop and transcribe
            </p>
          )}

          {nlMessage && !parsedEntries.length && (
            <p className="text-sm text-muted-foreground">{nlMessage}</p>
          )}

          {parsedEntries.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">Parsed entries:</p>
              <div className="flex flex-wrap gap-2">
                {parsedEntries.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-md text-sm"
                  >
                    {getStatusIcon(entry.status)}
                    <span>{format(new Date(entry.date), 'MMM d')}</span>
                    <span className="text-muted-foreground">-</span>
                    <span>{getStatusLabel(entry.status)}</span>
                  </div>
                ))}
              </div>
              <Button onClick={confirmParsedEntries} className="w-full">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirm & Save
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Target Progress Gauge */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Progress to 50% Target
            </CardTitle>
            <CardDescription>
              Need {summary?.work_days ? Math.ceil(summary.work_days * 0.5) : 0} office days out of {summary?.work_days || 0} work days
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Actual', value: summary?.office_percentage || 0 },
                      { name: 'Planned', value: Math.max(0, (summary?.total_percentage || 0) - (summary?.office_percentage || 0)) },
                      { name: 'Remaining', value: Math.max(0, 100 - (summary?.total_percentage || 0)) }
                    ]}
                    cx="50%"
                    cy="50%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius={60}
                    outerRadius={80}
                    dataKey="value"
                  >
                    <Cell fill="#00bfff" />
                    <Cell fill="#87ceeb" />
                    <Cell fill="#e5e7eb" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center -mt-16">
              <div className={`text-4xl font-bold ${(summary?.total_percentage || 0) >= 50 ? 'text-green-600' : 'text-amber-600'}`}>
                {summary?.total_percentage || 0}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400"></span> Actual: {summary?.office_percentage || 0}%</span>
                {' | '}
                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-300"></span> Planned: +{(summary?.total_percentage || 0) - (summary?.office_percentage || 0)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attendance Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Monthly Breakdown
            </CardTitle>
            <CardDescription>Days by category this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: 'Office', days: summary?.office_days || 0, fill: '#00bfff' },
                    { name: 'Planned', days: summary?.planned_office_days || 0, fill: '#87ceeb' },
                    { name: 'WFH', days: summary?.wfh_days || 0, fill: '#9ca3af' },
                    { name: 'Leave', days: summary?.leave_days || 0, fill: '#f59e0b' },
                  ]}
                  layout="vertical"
                  margin={{ left: 10, right: 30 }}
                >
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={60} />
                  <Tooltip />
                  <Bar dataKey="days" radius={[0, 4, 4, 0]}>
                    {[
                      { fill: '#00bfff' },
                      { fill: '#87ceeb' },
                      { fill: '#9ca3af' },
                      { fill: '#f59e0b' },
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Forecast Card */}
      <Card className="bg-gradient-to-r from-slate-50 to-slate-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            End of Month Forecast
          </CardTitle>
          <CardDescription>
            See what your final attendance percentage could be based on different scenarios.
            This helps you plan how many office days you need for the rest of the month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            // Use work days (business days minus leave/exempt) for percentage calculation
            const workDays = summary?.work_days || 0
            const officeDays = summary?.office_days || 0
            const plannedOfficeDays = summary?.planned_office_days || 0

            // Available days = future unlogged + future WFH (can change WFH to office)
            const availableDays = summary?.future_available_days || 0

            // Best case: Actual + Planned + all available days become office
            const bestCaseOfficeDays = officeDays + plannedOfficeDays + availableDays
            const bestCasePercentage = workDays > 0 ? Math.round(bestCaseOfficeDays / workDays * 100) : 0

            // Worst case: only current office + planned office count (all available become WFH)
            const worstCaseOfficeDays = officeDays + plannedOfficeDays
            const worstCasePercentage = workDays > 0 ? Math.round(worstCaseOfficeDays / workDays * 100) : 0

            // How many more office days needed to hit 50%?
            const targetOfficeDays = Math.ceil(workDays * 0.5)
            const neededForTarget = Math.max(0, targetOfficeDays - worstCaseOfficeDays)
            const canMeetTarget = neededForTarget <= availableDays

            return (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 bg-white rounded-lg border">
                  <div className="text-sm font-medium text-green-700">Best Case</div>
                  <div className="text-xs text-muted-foreground mb-1">Actual + Planned + {availableDays} WFH days converted to Office</div>
                  <div className="text-2xl font-bold text-green-600">{bestCasePercentage}%</div>
                </div>
                <div className="p-4 bg-white rounded-lg border">
                  <div className="text-sm font-medium text-amber-700">Worst Case</div>
                  <div className="text-xs text-muted-foreground mb-1">WFH every remaining day</div>
                  <div className="text-2xl font-bold text-amber-600">{worstCasePercentage}%</div>
                </div>
                <div className="p-4 bg-white rounded-lg border">
                  <div className="text-sm font-medium text-blue-700">To Hit 50%</div>
                  <div className="text-xs text-muted-foreground mb-1">Additional office days needed</div>
                  <div className={`text-2xl font-bold ${canMeetTarget ? 'text-green-600' : 'text-red-600'}`}>
                    {neededForTarget} days
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {neededForTarget === 0
                      ? '✓ Already on track with actual + planned!'
                      : canMeetTarget
                        ? `${availableDays} days available - achievable!`
                        : `Only ${availableDays} days available - not enough`}
                  </div>
                </div>
              </div>
            )
          })()}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium cursor-help" title="Weekdays minus public holidays">Business Days</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.business_days || 0}</div>
            <p className="text-xs text-muted-foreground cursor-help" title="Business days minus leave and exempt days. This is used for percentage calculation.">
              Work days: {summary?.work_days || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">In Office</CardTitle>
            <Building2 className="h-4 w-4 text-cyan-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-500">{summary?.office_days || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Planned Office</CardTitle>
            <Building2 className="h-4 w-4 text-cyan-300" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-300">{summary?.planned_office_days || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">WFH</CardTitle>
            <Home className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-500">{summary?.wfh_days || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Leave + Exempt</CardTitle>
            <CalendarOff className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{(summary?.leave_days || 0) + (summary?.exempt_days || 0)}</div>
          </CardContent>
        </Card>
      </div>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5" />
              Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {suggestions.map((suggestion, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    suggestion.type === 'warning'
                      ? 'bg-amber-50 text-amber-900'
                      : suggestion.type === 'reminder'
                      ? 'bg-blue-50 text-blue-900'
                      : 'bg-green-50 text-green-900'
                  }`}
                >
                  {suggestion.type === 'warning' ? (
                    <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Lightbulb className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  )}
                  <p className="text-sm">{suggestion.message}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
