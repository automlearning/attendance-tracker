import { useState, useEffect } from 'react'
import { attendanceApi, holidaysApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AttendanceLog, AttendanceStatus, PublicHoliday } from '@/types'
import { Building2, Home, CalendarOff, ChevronLeft, ChevronRight, Thermometer, ShieldCheck, Calendar, Trash2, MousePointerClick } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, getDay, addMonths, subMonths, isFuture, isAfter, startOfDay } from 'date-fns'

export function AttendancePage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [holidays, setHolidays] = useState<PublicHoliday[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [quickLogLoading, setQuickLogLoading] = useState(false)

  useEffect(() => {
    loadMonthData()
  }, [currentMonth])

  const loadMonthData = async () => {
    setIsLoading(true)
    try {
      const year = currentMonth.getFullYear()
      const month = currentMonth.getMonth() + 1
      const [attendanceData, holidayData] = await Promise.all([
        attendanceApi.getCalendarView(year, month),
        holidaysApi.list(year)
      ])
      setLogs(attendanceData)
      setHolidays(holidayData)
    } catch (error) {
      console.error('Failed to load attendance:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickLog = async (date: Date, status: AttendanceStatus) => {
    setQuickLogLoading(true)
    try {
      await attendanceApi.quickLog(status, format(date, 'yyyy-MM-dd'))
      await loadMonthData()
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
      await loadMonthData()
      setSelectedDate(null)
    } catch (error) {
      console.error('Failed to delete:', error)
    } finally {
      setQuickLogLoading(false)
    }
  }

  const getLogForDate = (date: Date): AttendanceLog | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return logs.find(log => log.date === dateStr)
  }

  const getHolidayForDate = (date: Date): PublicHoliday | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return holidays.find(h => h.date === dateStr)
  }

  const getStatusBgColor = (status: AttendanceStatus, date?: Date) => {
    const isFuture = date ? isAfter(startOfDay(date), startOfDay(new Date())) : false

    switch (status) {
      case 'in_office':
        return isFuture ? 'bg-cyan-50 border-dashed border-cyan-300' : 'bg-cyan-100'
      case 'wfh':
        return isFuture ? 'bg-gray-50 border-dashed border-gray-300' : 'bg-gray-100'
      case 'wfh_exempt': return 'bg-slate-200'
      case 'annual_leave': return 'bg-amber-100'
      case 'sick_leave': return 'bg-red-100'
      case 'public_holiday': return 'bg-purple-100'
      case 'planned_office': return 'bg-cyan-50 border-dashed border-cyan-300'
      case 'planned_wfh': return 'bg-gray-50 border-dashed border-gray-300'
      default: return 'bg-gray-100'
    }
  }

  const getStatusColor = (status: AttendanceStatus) => {
    switch (status) {
      case 'in_office': return 'bg-cyan-400'
      case 'wfh': return 'bg-gray-400'
      case 'wfh_exempt': return 'bg-slate-600'
      case 'annual_leave': return 'bg-amber-500'
      case 'sick_leave': return 'bg-red-500'
      case 'public_holiday': return 'bg-purple-500'
      case 'planned_office': return 'bg-cyan-300'
      case 'planned_wfh': return 'bg-gray-300'
      default: return 'bg-gray-300'
    }
  }

  const getStatusLabel = (status: AttendanceStatus, date?: Date) => {
    const isFuture = date ? isAfter(startOfDay(date), startOfDay(new Date())) : false

    switch (status) {
      case 'in_office': return isFuture ? 'Planned' : 'Office'
      case 'wfh': return 'WFH'
      case 'wfh_exempt': return 'Exempt'
      case 'annual_leave': return 'Leave'
      case 'sick_leave': return 'Sick'
      case 'public_holiday': return 'Holiday'
      case 'planned_office': return 'Planned'
      case 'planned_wfh': return 'Plan WFH'
      default: return status
    }
  }

  const getStatusFullLabel = (status: AttendanceStatus, date?: Date) => {
    const isFuture = date ? isAfter(startOfDay(date), startOfDay(new Date())) : false

    switch (status) {
      case 'in_office': return isFuture ? 'Planned: Office' : 'In Office'
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

  const isFutureDate = (date: Date) => {
    return isAfter(startOfDay(date), startOfDay(new Date()))
  }

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Pad the beginning with empty cells
  const startDay = getDay(monthStart)
  const paddedDays = [...Array(startDay).fill(null), ...days]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Attendance Calendar</h1>
        <p className="text-muted-foreground flex items-center gap-2">
          <MousePointerClick className="h-4 w-4" />
          Click any date to log or change your attendance
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle>{format(currentMonth, 'MMMM yyyy')}</CardTitle>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <>
              {/* Calendar header */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {paddedDays.map((day, i) => {
                  if (!day) {
                    return <div key={`empty-${i}`} className="aspect-square" />
                  }

                  const log = getLogForDate(day)
                  const holiday = getHolidayForDate(day)
                  const isCurrentMonth = isSameMonth(day, currentMonth)
                  const isTodayDate = isToday(day)
                  const isWeekend = getDay(day) === 0 || getDay(day) === 6
                  const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')

                  // Determine background color
                  let bgClass = 'bg-white hover:bg-accent'
                  if (log) {
                    bgClass = getStatusBgColor(log.status, day)
                  } else if (holiday) {
                    bgClass = 'bg-purple-100'
                  } else if (isWeekend) {
                    bgClass = 'bg-gray-50'
                  }

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(isSelected ? null : day)}
                      title={holiday ? holiday.name : log ? getStatusFullLabel(log.status, day) : undefined}
                      className={`
                        aspect-square p-1 rounded-lg border transition-all flex flex-col items-center justify-center
                        ${bgClass}
                        ${!isCurrentMonth ? 'opacity-30' : ''}
                        ${isTodayDate ? 'ring-2 ring-primary ring-offset-1' : ''}
                        ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                      `}
                    >
                      <div className={`text-sm font-medium ${isTodayDate ? 'text-primary' : ''}`}>
                        {format(day, 'd')}
                      </div>
                      {log && (
                        <div className="text-[10px] text-gray-500 font-medium truncate w-full text-center">
                          {getStatusLabel(log.status, day)}
                        </div>
                      )}
                      {holiday && !log && (
                        <div className="text-[10px] text-purple-500 font-medium truncate w-full text-center">
                          Holiday
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-4 mt-4 justify-center">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-cyan-400" />
                  <span>In Office</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-cyan-300 border border-dashed border-cyan-400" />
                  <span>Planned Office</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-gray-400" />
                  <span>WFH</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-slate-600" />
                  <span>Exempt</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span>Leave</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span>Sick</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  <span>Holiday</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Selected date actions */}
      {selectedDate && (
        <Card className="border-2 border-cyan-200 bg-cyan-50/30">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-cyan-500" />
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                {isFutureDate(selectedDate) && (
                  <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded">Plan ahead</span>
                )}
              </span>
              {getHolidayForDate(selectedDate) && (
                <span className="text-sm font-normal text-purple-600 flex items-center gap-1 bg-purple-100 px-2 py-1 rounded">
                  {getHolidayForDate(selectedDate)?.name}
                </span>
              )}
            </CardTitle>
            {getLogForDate(selectedDate) && (
              <p className="text-sm text-muted-foreground">
                Currently: <strong className="text-foreground">{getStatusFullLabel(getLogForDate(selectedDate)!.status, selectedDate)}</strong>
                {' '}- Click a button below to change
              </p>
            )}
            {!getLogForDate(selectedDate) && (
              <p className="text-sm text-muted-foreground">
                {isFutureDate(selectedDate) ? 'Plan your attendance for this day' : 'No attendance logged - select a status below'}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button
                variant={getLogForDate(selectedDate)?.status === 'in_office' ? 'default' : 'outline'}
                onClick={() => handleQuickLog(selectedDate, 'in_office')}
                disabled={quickLogLoading}
                className={getLogForDate(selectedDate)?.status === 'in_office'
                  ? 'bg-cyan-500 hover:bg-cyan-600'
                  : isFutureDate(selectedDate) ? 'border-dashed border-cyan-400' : ''}
              >
                <Building2 className="h-4 w-4 mr-2" />
                {isFutureDate(selectedDate) ? 'Office' : 'In Office'}
              </Button>
              <Button
                variant={getLogForDate(selectedDate)?.status === 'wfh' ? 'default' : 'outline'}
                onClick={() => handleQuickLog(selectedDate, 'wfh')}
                disabled={quickLogLoading}
                className={getLogForDate(selectedDate)?.status === 'wfh'
                  ? 'bg-gray-500 hover:bg-gray-600'
                  : isFutureDate(selectedDate) ? 'border-dashed border-gray-400' : ''}
              >
                <Home className="h-4 w-4 mr-2" />
                WFH
              </Button>
              {!isFutureDate(selectedDate) && (
                <Button
                  variant={getLogForDate(selectedDate)?.status === 'wfh_exempt' ? 'default' : 'outline'}
                  onClick={() => handleQuickLog(selectedDate, 'wfh_exempt')}
                  disabled={quickLogLoading}
                  title="Approved WFH that doesn't count against target"
                  className={getLogForDate(selectedDate)?.status === 'wfh_exempt' ? 'bg-slate-600 hover:bg-slate-700' : ''}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  WFH Exempt
                </Button>
              )}
              <Button
                variant={getLogForDate(selectedDate)?.status === 'annual_leave' ? 'default' : 'outline'}
                onClick={() => handleQuickLog(selectedDate, 'annual_leave')}
                disabled={quickLogLoading}
                className={getLogForDate(selectedDate)?.status === 'annual_leave' ? 'bg-amber-600 hover:bg-amber-700' : ''}
              >
                <CalendarOff className="h-4 w-4 mr-2" />
                Leave
              </Button>
              {!isFutureDate(selectedDate) && (
                <Button
                  variant={getLogForDate(selectedDate)?.status === 'sick_leave' ? 'default' : 'outline'}
                  onClick={() => handleQuickLog(selectedDate, 'sick_leave')}
                  disabled={quickLogLoading}
                  className={getLogForDate(selectedDate)?.status === 'sick_leave' ? 'bg-red-600 hover:bg-red-700' : ''}
                >
                  <Thermometer className="h-4 w-4 mr-2" />
                  Sick
                </Button>
              )}
              {getLogForDate(selectedDate) && (
                <Button
                  variant="outline"
                  onClick={() => handleDeleteLog(selectedDate)}
                  disabled={quickLogLoading}
                  className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
