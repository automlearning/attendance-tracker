import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { aiApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Send, Bot, User, Sparkles, ThumbsUp, ThumbsDown, Mic, MicOff, Loader2 } from 'lucide-react'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  feedback?: 'thumbs_up' | 'thumbs_down' | null
  userMessageContent?: string // Store the user message that prompted this response
}

export function ChatPage() {
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([
    "How am I doing this month?",
    "What's my target?",
    "How many office days do I need?",
    "Tips for meeting my target"
  ])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Add initial greeting
  useEffect(() => {
    const firstName = user?.full_name?.split(' ')[0] || 'there'
    setMessages([{
      id: 0,
      role: 'assistant',
      content: `Hi ${firstName}! I'm your AI attendance coach. Ask me anything about your attendance, targets, or tips for meeting your ${user?.target_percentage || 50}% office goal. How can I help you today?`,
      timestamp: new Date()
    }])
  }, [user])

  const handleSend = async (messageText?: string) => {
    const text = messageText || input.trim()
    if (!text || isLoading) return

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await aiApi.chat(text)

      const assistantMessage: ChatMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: response.response,
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])

      if (response.suggestions) {
        setSuggestions(response.suggestions)
      }
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: ChatMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: "Sorry, I couldn't process that. Please try again.",
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    handleSend(suggestion)
  }

  // Handle feedback submission
  const handleFeedback = async (messageId: number, rating: 'thumbs_up' | 'thumbs_down') => {
    const message = messages.find(m => m.id === messageId)
    if (!message || message.role !== 'assistant' || message.feedback) return

    // Find the user message that prompted this response
    const messageIndex = messages.findIndex(m => m.id === messageId)
    const userMessage = messageIndex > 0 ? messages[messageIndex - 1] : null
    if (!userMessage || userMessage.role !== 'user') return

    try {
      await aiApi.submitFeedback({
        user_message: userMessage.content,
        ai_response: message.content,
        rating
      })

      // Update local state to show feedback was recorded
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, feedback: rating } : m
      ))
    } catch (error) {
      console.error('Error submitting feedback:', error)
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
        await transcribeAudio(audioBlob)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error('Error accessing microphone:', error)
      alert('Could not access microphone. Please check permissions.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true)
    try {
      const result = await aiApi.transcribeAudio(audioBlob)
      if (result.success && result.text) {
        setInput(result.text)
      } else {
        console.error('Transcription failed:', result.error)
        alert('Could not transcribe audio. Please try again.')
      }
    } catch (error) {
      console.error('Error transcribing audio:', error)
      alert('Could not transcribe audio. Please try again.')
    } finally {
      setIsTranscribing(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="h-8 w-8 text-primary" />
          AI Assistant
        </h1>
        <p className="text-muted-foreground">Chat with your personal attendance assistant</p>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            Attendance Assistant
          </CardTitle>
          <CardDescription>
            Ask about your progress, get tips, or plan your office days
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className="flex flex-col">
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className={`text-xs mt-1 ${
                    message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                  }`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {/* Feedback buttons for assistant messages (not the initial greeting) */}
                {message.role === 'assistant' && index > 0 && (
                  <div className="flex items-center gap-1 mt-1 ml-1">
                    {message.feedback ? (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        {message.feedback === 'thumbs_up' ? (
                          <><ThumbsUp className="h-3 w-3 text-green-500" /> Thanks for the feedback!</>
                        ) : (
                          <><ThumbsDown className="h-3 w-3 text-red-500" /> Thanks for the feedback!</>
                        )}
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => handleFeedback(message.id, 'thumbs_up')}
                          className="p-1 rounded hover:bg-muted-foreground/10 transition-colors"
                          title="Helpful response"
                        >
                          <ThumbsUp className="h-3.5 w-3.5 text-muted-foreground hover:text-green-500" />
                        </button>
                        <button
                          onClick={() => handleFeedback(message.id, 'thumbs_down')}
                          className="p-1 rounded hover:bg-muted-foreground/10 transition-colors"
                          title="Not helpful"
                        >
                          <ThumbsDown className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-lg px-4 py-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </CardContent>

        {/* Suggestions */}
        {suggestions.length > 0 && messages.length < 4 && (
          <div className="px-4 py-2 border-t bg-muted/30">
            <p className="text-xs text-muted-foreground mb-2">Suggested questions:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(suggestion)}
                  disabled={isLoading}
                  className="text-xs px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="flex gap-2"
          >
            {/* Voice recording button */}
            <Button
              type="button"
              variant={isRecording ? "destructive" : "outline"}
              size="icon"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isLoading || isTranscribing}
              title={isRecording ? "Stop recording" : "Start voice input"}
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isRecording ? "Recording... click mic to stop" : "Ask me anything about your attendance..."}
              disabled={isLoading || isRecording}
              className="flex-1"
            />
            <Button type="submit" disabled={!input.trim() || isLoading || isRecording}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
          {isRecording && (
            <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              Recording... Click the microphone button to stop and transcribe
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
