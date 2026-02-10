import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { attendanceApi, targetsApi, aiApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { AttendanceSummary, TargetProgress, AttendanceStatus, Suggestion, ParsedAttendanceEntry, AIGreeting } from '@/types'
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
  Sparkles
} from 'lucide-react'
import { format, startOfMonth, endOfMonth } from 'date-fns'

export function DashboardPage() {
  const { user } = useAuthStore()
  const [summary, setSummary] = useState<AttendanceSummary | null>(null)
  const [progress, setProgress] = useState<TargetProgress | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [greeting, setGreeting] = useState<AIGreeting | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [quickLogLoading, setQuickLogLoading] = useState<AttendanceStatus | null>(null)
  const [todayLogged, setTodayLogged] = useState<AttendanceStatus | null>(null)

  // Natural language input
  const [nlInput, setNlInput] = useState('')
  const [nlParsing, setNlParsing] = useState(false)
  const [parsedEntries, setParsedEntries] = useState<ParsedAttendanceEntry[]>([])
  const [nlMessage, setNlMessage] = useState('')

  useEffect(() => {
    loadDashboardData()
    loadGreeting()
  }, [])

  const loadGreeting = async () => {
    try {
      const greetingData = await aiApi.getGreeting()
      setGreeting(greetingData)
    } catch (error) {
      console.error('Failed to load greeting:', error)
    }
  }

  const loadDashboardData = async () => {
    setIsLoading(true)
    try {
      const today = new Date()
      const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')
      const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd')

      // Load summary
      const summaryData = await attendanceApi.getSummary(monthStart, monthEnd)
      setSummary(summaryData)

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

      // Check if today is logged
      const todayStr = format(today, 'yyyy-MM-dd')
      const todayLogs = await attendanceApi.list(todayStr, todayStr)
      if (todayLogs.length > 0) {
        setTodayLogged(todayLogs[0].status)
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

  const getStatusIcon = (status: AttendanceStatus) => {
    switch (status) {
      case 'in_office': return <Building2 className="h-4 w-4" />
      case 'wfh': return <Home className="h-4 w-4" />
      case 'annual_leave': return <CalendarOff className="h-4 w-4" />
      case 'sick_leave': return <Thermometer className="h-4 w-4" />
      default: return null
    }
  }

  const getStatusLabel = (status: AttendanceStatus) => {
    switch (status) {
      case 'in_office': return 'In Office'
      case 'wfh': return 'WFH'
      case 'annual_leave': return 'Annual Leave'
      case 'sick_leave': return 'Sick Leave'
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
                <Sparkles className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1 space-y-3">
                <p className="text-lg font-medium text-blue-900">{greeting.greeting}</p>
                {greeting.features.length > 0 && (
                  <ul className="space-y-1 text-sm text-blue-800">
                    {greeting.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-blue-600 flex-shrink-0" />
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
            >
              <Building2 className="h-5 w-5 mr-2" />
              {quickLogLoading === 'in_office' ? 'Logging...' : 'In Office'}
            </Button>
            <Button
              size="lg"
              variant={todayLogged === 'wfh' ? 'default' : 'outline'}
              onClick={() => handleQuickLog('wfh')}
              disabled={quickLogLoading !== null}
              className="flex-1 min-w-[120px]"
            >
              <Home className="h-5 w-5 mr-2" />
              {quickLogLoading === 'wfh' ? 'Logging...' : 'WFH'}
            </Button>
            <Button
              size="lg"
              variant={todayLogged === 'annual_leave' ? 'default' : 'outline'}
              onClick={() => handleQuickLog('annual_leave')}
              disabled={quickLogLoading !== null}
              className="flex-1 min-w-[120px]"
            >
              <CalendarOff className="h-5 w-5 mr-2" />
              {quickLogLoading === 'annual_leave' ? 'Logging...' : 'Annual Leave'}
            </Button>
            <Button
              size="lg"
              variant={todayLogged === 'sick_leave' ? 'default' : 'outline'}
              onClick={() => handleQuickLog('sick_leave')}
              disabled={quickLogLoading !== null}
              className="flex-1 min-w-[120px]"
            >
              <Thermometer className="h-5 w-5 mr-2" />
              {quickLogLoading === 'sick_leave' ? 'Logging...' : 'Sick Leave'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Natural Language Input */}
      <Card>
        <CardHeader>
          <CardTitle>Log with AI</CardTitle>
          <CardDescription>
            Type naturally, e.g., "I was in office Monday and Tuesday, WFH Wednesday"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Describe your attendance..."
              value={nlInput}
              onChange={(e) => setNlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleNLParse()}
            />
            <Button onClick={handleNLParse} disabled={nlParsing || !nlInput.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>

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

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Attendance</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.attendance_percentage || 0}%</div>
            <p className="text-xs text-muted-foreground">(Work Days - Leave) / Total Days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Office %</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.office_percentage || 0}%</div>
            <p className="text-xs text-muted-foreground">In Office / (In Office + WFH)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Work Days</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_workdays || 0}</div>
            <p className="text-xs text-muted-foreground">total this month</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">In Office</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.in_office_days || 0}</div>
            <p className="text-xs text-muted-foreground">days this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">WFH</CardTitle>
            <Home className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.wfh_days || 0}</div>
            <p className="text-xs text-muted-foreground">days this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Annual Leave</CardTitle>
            <CalendarOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.annual_leave_days || 0}</div>
            <p className="text-xs text-muted-foreground">days this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sick Leave</CardTitle>
            <Thermometer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.sick_leave_days || 0}</div>
            <p className="text-xs text-muted-foreground">days this month</p>
          </CardContent>
        </Card>
      </div>

      {/* Target Progress */}
      {progress && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Target Progress
            </CardTitle>
            <CardDescription>
              {progress.target.office_percentage}% office target for{' '}
              {format(new Date(progress.target.period_start), 'MMM d')} -{' '}
              {format(new Date(progress.target.period_end), 'MMM d')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Current: {progress.current_percentage}%</span>
                <span>Target: {progress.target.office_percentage}%</span>
              </div>
              <div className="h-3 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    progress.on_track ? 'bg-green-500' : 'bg-amber-500'
                  }`}
                  style={{
                    width: `${Math.min(100, (progress.current_percentage / progress.target.office_percentage) * 100)}%`
                  }}
                />
              </div>
            </div>

            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{progress.days_in_office} days in office</span>
              <span>{progress.days_remaining} days remaining</span>
            </div>

            {!progress.on_track && progress.days_needed_to_meet_target > 0 && (
              <p className="text-sm text-amber-600">
                You need {progress.days_needed_to_meet_target} more office day(s) to meet your target.
              </p>
            )}

            {progress.on_track && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                You're on track to meet your target!
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
