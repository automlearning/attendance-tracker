import { useState, useEffect } from 'react'
import { targetsApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Target, PeriodType } from '@/types'
import { Target as TargetIcon, Plus, Trash2 } from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths } from 'date-fns'

export function TargetsPage() {
  const [targets, setTargets] = useState<Target[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [periodType, setPeriodType] = useState<PeriodType>('monthly')
  const [percentage, setPercentage] = useState('60')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  useEffect(() => {
    loadTargets()
  }, [])

  useEffect(() => {
    // Set default dates based on period type
    const today = new Date()
    if (periodType === 'weekly') {
      setStartDate(format(startOfWeek(today), 'yyyy-MM-dd'))
      setEndDate(format(endOfWeek(today), 'yyyy-MM-dd'))
    } else if (periodType === 'monthly') {
      setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'))
      setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'))
    } else if (periodType === 'quarterly') {
      setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'))
      setEndDate(format(endOfMonth(addMonths(today, 2)), 'yyyy-MM-dd'))
    }
  }, [periodType])

  const loadTargets = async () => {
    setIsLoading(true)
    try {
      const data = await targetsApi.list()
      setTargets(data)
    } catch (error) {
      console.error('Failed to load targets:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateTarget = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormLoading(true)
    try {
      await targetsApi.create({
        period_type: periodType,
        period_start: startDate,
        period_end: endDate,
        office_percentage: parseFloat(percentage),
      })
      await loadTargets()
      setShowForm(false)
    } catch (error) {
      console.error('Failed to create target:', error)
    } finally {
      setFormLoading(false)
    }
  }

  const handleDeleteTarget = async (id: number) => {
    if (!confirm('Are you sure you want to delete this target?')) return

    try {
      await targetsApi.delete(id)
      await loadTargets()
    } catch (error) {
      console.error('Failed to delete target:', error)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Targets</h1>
          <p className="text-muted-foreground">Set and track your office attendance goals</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          New Target
        </Button>
      </div>

      {/* Create Target Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Target</CardTitle>
            <CardDescription>Set your office attendance goal</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTarget} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="periodType">Period Type</Label>
                  <select
                    id="periodType"
                    value={periodType}
                    onChange={(e) => setPeriodType(e.target.value as PeriodType)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="percentage">Target Percentage</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="percentage"
                      type="number"
                      min="0"
                      max="100"
                      value={percentage}
                      onChange={(e) => setPercentage(e.target.value)}
                      className="flex-1"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={formLoading}>
                  {formLoading ? 'Creating...' : 'Create Target'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Targets List */}
      <div className="space-y-4">
        {targets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <TargetIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No targets yet</h3>
              <p className="text-muted-foreground text-center max-w-sm">
                Create your first target to start tracking your office attendance goals.
              </p>
            </CardContent>
          </Card>
        ) : (
          targets.map((target) => (
            <Card key={target.id} className={target.is_active ? 'border-primary' : ''}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <TargetIcon className="h-5 w-5" />
                      {target.office_percentage}% Office Target
                      {target.is_active && (
                        <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                          Active
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {target.period_type.charAt(0).toUpperCase() + target.period_type.slice(1)} target:{' '}
                      {format(new Date(target.period_start), 'MMM d, yyyy')} -{' '}
                      {format(new Date(target.period_end), 'MMM d, yyyy')}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteTarget(target.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
