import { useState, useEffect } from 'react'
import { attendanceApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AttendanceLog, AttendanceStatus } from '@/types'
import { Building2, Home, CalendarOff, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, getDay, addMonths, subMonths } from 'date-fns'

export function AttendancePage() {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [logs, setLogs] = useState<AttendanceLog[]>([])
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
      const data = await attendanceApi.getCalendarView(year, month)
      setLogs(data)
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
      setSelectedDate(null)
    } catch (error) {
      console.error('Failed to log:', error)
    } finally {
      setQuickLogLoading(false)
    }
  }

  const getLogForDate = (date: Date): AttendanceLog | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd')
    return logs.find(log => log.date === dateStr)
  }

  const getStatusColor = (status: AttendanceStatus) => {
    switch (status) {
      case 'in_office': return 'bg-green-500'
      case 'wfh': return 'bg-blue-500'
      case 'leave': return 'bg-amber-500'
      case 'holiday': return 'bg-gray-500'
      default: return 'bg-gray-300'
    }
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
        <p className="text-muted-foreground">View and manage your attendance history</p>
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
                  const isCurrentMonth = isSameMonth(day, currentMonth)
                  const isTodayDate = isToday(day)
                  const isWeekend = getDay(day) === 0 || getDay(day) === 6
                  const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(isSelected ? null : day)}
                      className={`
                        aspect-square p-1 rounded-lg border transition-all relative
                        ${!isCurrentMonth ? 'opacity-30' : ''}
                        ${isTodayDate ? 'ring-2 ring-primary' : ''}
                        ${isSelected ? 'ring-2 ring-primary bg-primary/10' : ''}
                        ${isWeekend && !log ? 'bg-gray-50' : 'hover:bg-accent'}
                      `}
                    >
                      <div className="text-sm">{format(day, 'd')}</div>
                      {log && (
                        <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${getStatusColor(log.status)}`} />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex gap-4 mt-4 justify-center">
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>In Office</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span>WFH</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span>Leave</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Selected date actions */}
      {selectedDate && (
        <Card>
          <CardHeader>
            <CardTitle>Log for {format(selectedDate, 'EEEE, MMMM d, yyyy')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button
                variant={getLogForDate(selectedDate)?.status === 'in_office' ? 'default' : 'outline'}
                onClick={() => handleQuickLog(selectedDate, 'in_office')}
                disabled={quickLogLoading}
              >
                <Building2 className="h-4 w-4 mr-2" />
                In Office
              </Button>
              <Button
                variant={getLogForDate(selectedDate)?.status === 'wfh' ? 'default' : 'outline'}
                onClick={() => handleQuickLog(selectedDate, 'wfh')}
                disabled={quickLogLoading}
              >
                <Home className="h-4 w-4 mr-2" />
                WFH
              </Button>
              <Button
                variant={getLogForDate(selectedDate)?.status === 'leave' ? 'default' : 'outline'}
                onClick={() => handleQuickLog(selectedDate, 'leave')}
                disabled={quickLogLoading}
              >
                <CalendarOff className="h-4 w-4 mr-2" />
                Leave
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
