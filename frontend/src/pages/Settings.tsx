import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { usersApi, attendanceApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { User, Shield, Target, CheckCircle2, FlaskConical, Loader2, Trash2 } from 'lucide-react'

export function SettingsPage() {
  const { user, setUser } = useAuthStore()
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [testDataResult, setTestDataResult] = useState<{
    success: boolean
    message: string
    monthly_stats: { month: string; office_percentage: number; met_target: boolean }[]
  } | null>(null)

  useEffect(() => {
    if (user) {
      setFullName(user.full_name)
      setEmail(user.email)
    }
  }, [user])

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      const updatedUser = await usersApi.updateProfile({ email, full_name: fullName })
      setUser(updatedUser)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('Failed to save profile:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleGenerateTestData = async (clearExisting: boolean = false) => {
    setIsGenerating(true)
    setTestDataResult(null)
    try {
      const result = await attendanceApi.generateTestData(6, clearExisting)
      setTestDataResult(result)
    } catch (error) {
      console.error('Failed to generate test data:', error)
      setTestDataResult({ success: false, message: 'Failed to generate test data', monthly_stats: [] })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      {/* Attendance Target Info */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Attendance Target
          </CardTitle>
          <CardDescription>
            Your office attendance target
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-lg font-medium">Target</span>
              <span className="text-3xl font-bold text-primary">50%</span>
            </div>
            <p className="text-sm text-muted-foreground">
              You need to be in the office at least 50% of business days each month.
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• In a 20-day month: <strong>10 office days</strong></li>
              <li>• Per fortnight: <strong>5 office days</strong></li>
              <li>• Per week: <strong>2.5 office days</strong></li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
          <CardDescription>Update your personal information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
              {saveSuccess && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" />
                  Profile saved!
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Account
          </CardTitle>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium capitalize">{user?.role}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">Status</span>
            <span className={`font-medium ${user?.is_active ? 'text-green-600' : 'text-red-600'}`}>
              {user?.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Developer Tools */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-amber-600" />
            Developer Tools
          </CardTitle>
          <CardDescription>Generate test data to verify calculations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate 6 months of realistic test attendance data with varying patterns:
            some months above 50% target, some below. Great for testing the dashboard formulas.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => handleGenerateTestData(false)}
              disabled={isGenerating}
              variant="outline"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FlaskConical className="h-4 w-4 mr-2" />
                  Add Test Data
                </>
              )}
            </Button>
            <Button
              onClick={() => handleGenerateTestData(true)}
              disabled={isGenerating}
              variant="destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear & Generate Fresh
            </Button>
          </div>

          {testDataResult && (
            <div className={`p-4 rounded-lg ${testDataResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <p className={`font-medium ${testDataResult.success ? 'text-green-800' : 'text-red-800'}`}>
                {testDataResult.message}
              </p>
              {testDataResult.monthly_stats.length > 0 && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2">
                  {testDataResult.monthly_stats.map((stat, i) => (
                    <div key={i} className="text-sm p-2 bg-white rounded border">
                      <span className="font-medium">{stat.month}</span>
                      <span className={`ml-2 ${stat.met_target ? 'text-green-600' : 'text-red-600'}`}>
                        {stat.office_percentage}%
                      </span>
                      {stat.met_target ? ' ✓' : ' ✗'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
