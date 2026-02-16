import { useState, useEffect, useRef } from 'react'
import { attendanceApi, holidaysApi, aiApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { AttendanceLog, AttendanceStatus, PublicHoliday, ParsedAttendanceEntry } from '@/types'
import {
  Building2,
  Home,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Thermometer,
  ShieldCheck,
  Calendar,
  Trash2,
  Sparkles,
  Send,
  CheckCircle2,
  Mic,
  MicOff,
  Loader2
} from 'lucide-react'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  getDay,
  addMonths,
  subMonths,
  isAfter,
  startOfDay,
  isSameDay
} from 'date-fns'

export function MultiCalendarPage() {
  const [centerMonth, setCenterMonth] = useState(new Date())
  const [monthsToShow, setMonthsToShow] = useState<3 | 6>(3)
  const [allLogs, setAllLogs] = useState<AttendanceLog[]>([])
  const [allHolidays, setAllHolidays] = useState<PublicHoliday[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [quickLogLoading, setQuickLogLoading] = useState(false)

  // AI input state
  const [nlInput, setNlInput] = useState('')
  const [nlParsing, setNlParsing] = useState(false)
  const [parsedEntries, setParsedEntries] = useState<ParsedAttendanceEntry[]>([])
  const [nlMessage, setNlMessage] = useState('')

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Calculate the months to display
  const getMonthsArray = () => {
    const months: Date[] = []
    const offset = monthsToShow === 3 ? 1 : 2
    for (let i = -offset; i <= (monthsToShow === 3 ? 1 : 3); i++) {
      months.push(addMonths(centerMonth, i))
    }
    return months
  }

  const months = getMonthsArray()

  useEffect(() => {
    loadAllData()
  }, [centerMonth, monthsToShow])

  const loadAllData = async () => {
    setIsLoading(true)
    try {
      // Get year range for data loading
      const years = [...new Set(months.map(m => m.getFullYear()))]

      // Load attendance for all visible months
      const logPromises = months.map(month =>
        attendanceApi.getCalendarView(month.getFullYear(), month.getMonth() + 1)
      )
      const holidayPromises = years.map(year => holidaysApi.list(year))

      const [logsArrays, holidaysArrays] = await Promise.all([
        Promise.all(logPromises),
        Promise.all(holidayPromises)
      ])

      // Flatten and dedupe logs
      const allLogsFlat = logsArrays.flat()
      const uniqueLogs = allLogsFlat.filter((log, index, self) =>
        index === self.findIndex(l => l.date === log.date)
      )
      setAllLogs(uniqueLogs)

      // Flatten and dedupe holidays
      const allHolidaysFlat = holidaysArrays.flat()
      const uniqueHolidays = allHolidaysFlat.filter((h, index, self) =>
        index === self.findIndex(hol => hol.date === h.date)
      )
      setAllHolidays(uniqueHolidays)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickLog = async (date: Date, status: AttendanceStatus) => {
    setQuickLogLoading(true)
    try {
      await attendanceApi.quickLog(status, format(date, 'yyyy-MM-dd'))
      await loadAllData()
    } catch (error) {
      console.error('Failed to log:', error)
    } finally {
      setQuickLogLoading(false)
    }
  }

  const handleDeleteLog = async (date: Date) => {
    const log = getLogForDate(date)
    if (!log) return

    setQuickLogLoading(true)
    try {
      await attendanceApi.delete(log.id)
      await loadAllData()
      setSelectedDate(null)
    } catch (error) {
      console.error('Failed to delete:', error)
    } finally {
      setQuickLogLoading(false)
    }
  }

  const getLogForDate = (date: Date): AttendanceLog | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return allLogs.find(log => log.date === dateStr)
  }

  const getHolidayForDate = (date: Date): PublicHoliday | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return allHolidays.find(h => h.date === dateStr)
  }

  const isFutureDate = (date: Date) => isAfter(startOfDay(date), startOfDay(new Date()))

  const getStatusBgColor = (status: AttendanceStatus, date?: Date) => {
    const future = date ? isFutureDate(date) : false
    switch (status) {
      case 'in_office': return future ? 'bg-cyan-50' : 'bg-cyan-200'
      case 'wfh': return future ? 'bg-gray-50' : 'bg-gray-200'
      case 'wfh_exempt': return 'bg-slate-300'
      case 'annual_leave': return 'bg-amber-200'
      case 'sick_leave': return 'bg-red-200'
      case 'public_holiday': return 'bg-purple-200'
      default: return 'bg-gray-200'
    }
  }

  const getStatusLabel = (status: AttendanceStatus) => {
    switch (status) {
      case 'in_office': return 'O'
      case 'wfh': return 'H'
      case 'wfh_exempt': return 'E'
      case 'annual_leave': return 'L'
      case 'sick_leave': return 'S'
      case 'public_holiday': return 'P'
      default: return ''
    }
  }

  // AI parsing
  const handleNLParse = async () => {
    if (!nlInput.trim()) return
    setNlParsing(true)
    setParsedEntries([])
    setNlMessage('')

    try {
      const result = await aiApi.parseNaturalLanguage(nlInput)
      if (result.success && result.entries.length > 0) {
        setParsedEntries(result.entries)
        setNlMessage(result.message || `Found ${result.entries.length} entries`)
      } else {
        setNlMessage(result.message || 'Could not parse input')
      }
    } catch {
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
      setNlMessage('Entries saved!')
      await loadAllData()
    } catch {
      setNlMessage('Failed to save entries')
    }
  }

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach(track => track.stop())
        await transcribeAndParse(audioBlob)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch {
      setNlMessage('Could not access microphone')
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
        setNlMessage('Parsing...')
        setNlParsing(true)
        const parseResult = await aiApi.parseNaturalLanguage(result.text)
        if (parseResult.success && parseResult.entries.length > 0) {
          setParsedEntries(parseResult.entries)
          setNlMessage(`Found ${parseResult.entries.length} entries - confirm below`)
        } else {
          setNlMessage(parseResult.message || 'Could not parse')
        }
        setNlParsing(false)
      } else {
        setNlMessage(result.error || 'Transcription failed')
      }
    } catch {
      setNlMessage('Transcription failed')
    } finally {
      setIsTranscribing(false)
    }
  }

  // Render a single mini calendar
  const renderMiniCalendar = (month: Date) => {
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
    const startDay = getDay(monthStart)
    const paddedDays = [...Array(startDay).fill(null), ...days]

    return (
      <div key={month.toISOString()} className="border rounded-lg p-2 bg-white">
        <div className="text-center font-semibold text-sm mb-2 text-primary">
          {format(month, 'MMM yyyy')}
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-[10px]">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="text-center text-muted-foreground font-medium">
              {d}
            </div>
          ))}
          {paddedDays.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} className="aspect-square" />

            const log = getLogForDate(day)
            const holiday = getHolidayForDate(day)
            const isCurrentMonth = isSameMonth(day, month)
            const isTodayDate = isToday(day)
            const isWeekend = getDay(day) === 0 || getDay(day) === 6
            const isSelected = selectedDate && isSameDay(selectedDate, day)

            let bgClass = isWeekend ? 'bg-gray-100' : 'bg-white'
            if (log) bgClass = getStatusBgColor(log.status, day)
            else if (holiday) bgClass = 'bg-purple-100'

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(isSelected ? null : day)}
                className={`
                  aspect-square rounded text-[10px] flex items-center justify-center
                  ${bgClass}
                  ${!isCurrentMonth ? 'opacity-30' : ''}
                  ${isTodayDate ? 'ring-1 ring-primary font-bold' : ''}
                  ${isSelected ? 'ring-2 ring-blue-500' : ''}
                  hover:ring-1 hover:ring-gray-400
                `}
                title={holiday?.name || (log ? log.status : undefined)}
              >
                <span className={log ? 'font-semibold' : ''}>
                  {format(day, 'd')}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Multi-Month Calendar</h1>
          <p className="text-muted-foreground">View and manage attendance across multiple months</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={monthsToShow === 3 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMonthsToShow(3)}
          >
            3 Months
          </Button>
          <Button
            variant={monthsToShow === 6 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMonthsToShow(6)}
          >
            6 Months
          </Button>
        </div>
      </div>

      {/* AI Input Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5" />
            Log with Voice or Text
          </CardTitle>
          <CardDescription>
            Say or type: "I was in office every Monday in January" or "WFH Dec 15-20"
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button
              variant={isRecording ? "destructive" : "outline"}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={nlParsing || isTranscribing}
            >
              {isTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> :
               isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Input
              placeholder={isRecording ? "Recording..." : "Describe attendance for any month..."}
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
              Recording... Click mic to stop
            </p>
          )}

          {nlMessage && !parsedEntries.length && (
            <p className="text-sm text-muted-foreground">{nlMessage}</p>
          )}

          {parsedEntries.length > 0 && (
            <div className="space-y-2 p-3 bg-secondary/50 rounded-lg">
              <p className="text-sm font-medium">{nlMessage}</p>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {parsedEntries.map((entry, i) => (
                  <div
                    key={i}
                    className={`text-xs px-2 py-1 rounded ${
                      entry.status === 'in_office' ? 'bg-cyan-100' :
                      entry.status === 'wfh' ? 'bg-gray-100' :
                      entry.status === 'annual_leave' ? 'bg-amber-100' : 'bg-gray-100'
                    }`}
                  >
                    {format(new Date(entry.date), 'MMM d')} - {entry.status.replace('_', ' ')}
                  </div>
                ))}
              </div>
              <Button onClick={confirmParsedEntries} size="sm" className="w-full">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirm & Save {parsedEntries.length} Entries
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="outline"
          onClick={() => setCenterMonth(subMonths(centerMonth, monthsToShow))}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous {monthsToShow}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setCenterMonth(new Date())}
        >
          Today
        </Button>
        <Button
          variant="outline"
          onClick={() => setCenterMonth(addMonths(centerMonth, monthsToShow))}
        >
          Next {monthsToShow}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {/* Multi-month grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className={`grid gap-4 ${monthsToShow === 3 ? 'md:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-6'}`}>
          {months.map(month => renderMiniCalendar(month))}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center text-sm">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-cyan-200" /> Office</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-cyan-50" /> Planned</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-gray-200" /> WFH</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-slate-300" /> Exempt</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-200" /> Leave</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-200" /> Sick</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-purple-100" /> Holiday</div>
      </div>

      {/* Selected date actions */}
      {selectedDate && (
        <Card className="border-2 border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              {isFutureDate(selectedDate) && (
                <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded">Future</span>
              )}
            </CardTitle>
            {getLogForDate(selectedDate) && (
              <p className="text-sm text-muted-foreground">
                Currently: <strong>{getLogForDate(selectedDate)!.status.replace('_', ' ')}</strong>
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={getLogForDate(selectedDate)?.status === 'in_office' ? 'default' : 'outline'}
                onClick={() => handleQuickLog(selectedDate, 'in_office')}
                disabled={quickLogLoading}
              >
                <Building2 className="h-4 w-4 mr-1" /> Office
              </Button>
              <Button
                size="sm"
                variant={getLogForDate(selectedDate)?.status === 'wfh' ? 'default' : 'outline'}
                onClick={() => handleQuickLog(selectedDate, 'wfh')}
                disabled={quickLogLoading}
              >
                <Home className="h-4 w-4 mr-1" /> WFH
              </Button>
              <Button
                size="sm"
                variant={getLogForDate(selectedDate)?.status === 'wfh_exempt' ? 'default' : 'outline'}
                onClick={() => handleQuickLog(selectedDate, 'wfh_exempt')}
                disabled={quickLogLoading}
              >
                <ShieldCheck className="h-4 w-4 mr-1" /> Exempt
              </Button>
              <Button
                size="sm"
                variant={getLogForDate(selectedDate)?.status === 'annual_leave' ? 'default' : 'outline'}
                onClick={() => handleQuickLog(selectedDate, 'annual_leave')}
                disabled={quickLogLoading}
              >
                <CalendarOff className="h-4 w-4 mr-1" /> Leave
              </Button>
              <Button
                size="sm"
                variant={getLogForDate(selectedDate)?.status === 'sick_leave' ? 'default' : 'outline'}
                onClick={() => handleQuickLog(selectedDate, 'sick_leave')}
                disabled={quickLogLoading}
              >
                <Thermometer className="h-4 w-4 mr-1" /> Sick
              </Button>
              {getLogForDate(selectedDate) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteLog(selectedDate)}
                  disabled={quickLogLoading}
                  className="text-red-600 border-red-300"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
