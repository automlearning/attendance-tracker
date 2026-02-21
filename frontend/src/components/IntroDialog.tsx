import { CheckCircle2, Sparkles, TrendingUp, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface IntroDialogProps {
  content: {
    greeting: string
    insights: string[]
    action_items: string[]
  }
  onClose: () => void
  onStartOnboarding?: () => void
}

export function IntroDialog({ content, onClose, onStartOnboarding }: IntroDialogProps) {
  const handleGetStarted = () => {
    onClose()
    // Trigger onboarding flow after a short delay
    if (onStartOnboarding) {
      setTimeout(() => {
        onStartOnboarding()
      }, 500)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl mx-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 p-6 rounded-t-lg">
          <div className="flex items-center gap-3">
            <Sparkles className="h-8 w-8 text-white" />
            <h2 className="text-2xl font-bold text-white">
              Welcome to Attendance Tracker!
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Welcome Message */}
          <div className="bg-blue-50 dark:bg-gray-700 rounded-lg p-4 border border-blue-200 dark:border-gray-600">
            <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
              {content.greeting}
            </p>
          </div>

          {/* Key Insights */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Key Insights
              </h3>
            </div>
            <ul className="space-y-2">
              {content.insights.map((insight, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="mt-1">
                    <div className="h-2 w-2 rounded-full bg-purple-600 dark:bg-purple-400" />
                  </div>
                  <span className="text-gray-700 dark:text-gray-300 flex-1">
                    {insight}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Action Items */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Get Started
              </h3>
            </div>
            <ul className="space-y-2">
              {content.action_items.map((action, index) => (
                <li key={index} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-300 flex-1">
                    {action}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* What You Can Do */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-gray-700 dark:to-gray-700 rounded-lg p-4 border border-purple-200 dark:border-gray-600">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              What You Can Do
            </h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-bold">•</span>
                <span className="text-gray-700 dark:text-gray-300">
                  Track your daily attendance with one-click quick-log buttons
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-bold">•</span>
                <span className="text-gray-700 dark:text-gray-300">
                  Use natural language like "I was in office Monday and Tuesday"
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-bold">•</span>
                <span className="text-gray-700 dark:text-gray-300">
                  Get AI assistance and personalized tips to meet your target
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-bold">•</span>
                <span className="text-gray-700 dark:text-gray-300">
                  Plan ahead with the calendar view and track your progress
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 dark:text-purple-400 font-bold">•</span>
                <span className="text-gray-700 dark:text-gray-300">
                  Ask me anything in the chat - I'm here to help!
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-800 px-6 py-4 rounded-b-lg border-t border-gray-200 dark:border-gray-700">
          <Button
            onClick={handleGetStarted}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3"
          >
            Got it, let's go!
          </Button>
        </div>
      </div>
    </div>
  )
}
