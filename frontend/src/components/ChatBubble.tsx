import { useState, useRef, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { aiApi } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, Bot, User, MessageCircle, X, Minimize2, ThumbsUp, ThumbsDown, Mic, MicOff, Loader2, MessageSquare } from 'lucide-react'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  feedback?: 'thumbs_up' | 'thumbs_down' | null
}

interface PendingFeedback {
  messageId: number
  rating: 'thumbs_up' | 'thumbs_down'
}

export function ChatBubble() {
  const { user } = useAuthStore()
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([
    "How am I doing?",
    "Days needed?",
    "Tips?"
  ])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Feedback state
  const [pendingFeedback, setPendingFeedback] = useState<PendingFeedback | null>(null)
  const [feedbackComment, setFeedbackComment] = useState('')

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Add initial greeting when chat opens
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const firstName = user?.full_name?.split(' ')[0] || 'there'
      setMessages([{
        id: 0,
        role: 'assistant',
        content: `Hi ${firstName}! I'm your AI coach. Ask me about your attendance progress or tips for meeting your ${user?.target_percentage || 50}% target.`,
        timestamp: new Date()
      }])
    }
  }, [isOpen, user, messages.length])

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
        setSuggestions(response.suggestions.slice(0, 3))
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

  // Handle feedback - show comment input first
  const handleFeedbackClick = (messageId: number, rating: 'thumbs_up' | 'thumbs_down') => {
    const message = messages.find(m => m.id === messageId)
    if (!message || message.role !== 'assistant' || message.feedback) return

    setPendingFeedback({ messageId, rating })
    setFeedbackComment('')
  }

  // Submit feedback with optional comment
  const submitFeedback = async (skipComment: boolean = false) => {
    if (!pendingFeedback) return

    const message = messages.find(m => m.id === pendingFeedback.messageId)
    if (!message) return

    const messageIndex = messages.findIndex(m => m.id === pendingFeedback.messageId)
    const userMessage = messageIndex > 0 ? messages[messageIndex - 1] : null
    if (!userMessage || userMessage.role !== 'user') return

    try {
      await aiApi.submitFeedback({
        user_message: userMessage.content,
        ai_response: message.content,
        rating: pendingFeedback.rating,
        comment: skipComment ? undefined : feedbackComment.trim() || undefined
      })
      setMessages(prev => prev.map(m =>
        m.id === pendingFeedback.messageId ? { ...m, feedback: pendingFeedback.rating } : m
      ))
    } catch (error) {
      console.error('Error submitting feedback:', error)
    } finally {
      setPendingFeedback(null)
      setFeedbackComment('')
    }
  }

  // Cancel feedback
  const cancelFeedback = () => {
    setPendingFeedback(null)
    setFeedbackComment('')
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
      }
    } catch (error) {
      console.error('Error transcribing audio:', error)
    } finally {
      setIsTranscribing(false)
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center z-50"
        title="Chat with AI Coach"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    )
  }

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-6 right-6 bg-primary text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-2 px-4 py-3 z-50"
      >
        <Bot className="h-5 w-5" />
        <span className="text-sm font-medium">AI Coach</span>
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 w-80 sm:w-96 h-[500px] bg-background border rounded-lg shadow-2xl flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-primary text-primary-foreground rounded-t-lg">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <span className="font-medium">AI Coach</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1 hover:bg-primary-foreground/20 rounded"
            title="Minimize"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-primary-foreground/20 rounded"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
            )}
            <div className="flex flex-col">
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              </div>
              {/* Feedback buttons for assistant messages (not initial greeting) */}
              {message.role === 'assistant' && index > 0 && (
                <div className="mt-1">
                  {message.feedback ? (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      {message.feedback === 'thumbs_up' ? (
                        <ThumbsUp className="h-3 w-3 text-green-500" />
                      ) : (
                        <ThumbsDown className="h-3 w-3 text-red-500" />
                      )}
                      <span>Thanks for feedback!</span>
                    </span>
                  ) : pendingFeedback?.messageId === message.id ? (
                    <div className="bg-muted/50 rounded-lg p-2 mt-1 space-y-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        {pendingFeedback.rating === 'thumbs_up' ? (
                          <ThumbsUp className="h-3 w-3 text-green-500" />
                        ) : (
                          <ThumbsDown className="h-3 w-3 text-red-500" />
                        )}
                        <span>Add a comment (optional)</span>
                      </div>
                      <textarea
                        value={feedbackComment}
                        onChange={(e) => setFeedbackComment(e.target.value)}
                        placeholder="What could be better?"
                        className="w-full text-xs p-2 rounded border bg-background resize-none"
                        rows={2}
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => submitFeedback(false)}
                          className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                        >
                          Submit
                        </button>
                        <button
                          onClick={() => submitFeedback(true)}
                          className="text-xs px-2 py-1 bg-secondary rounded hover:bg-secondary/80"
                        >
                          Skip
                        </button>
                        <button
                          onClick={cancelFeedback}
                          className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleFeedbackClick(message.id, 'thumbs_up')}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title="Helpful"
                      >
                        <ThumbsUp className="h-3 w-3 text-muted-foreground hover:text-green-500" />
                      </button>
                      <button
                        onClick={() => handleFeedbackClick(message.id, 'thumbs_down')}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title="Not helpful"
                      >
                        <ThumbsDown className="h-3 w-3 text-muted-foreground hover:text-red-500" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            {message.role === 'user' && (
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-muted rounded-lg px-3 py-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick suggestions */}
      {messages.length <= 2 && (
        <div className="px-3 py-2 border-t bg-muted/30">
          <div className="flex flex-wrap gap-1">
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => handleSend(suggestion)}
                disabled={isLoading}
                className="text-xs px-2 py-1 rounded-full bg-secondary hover:bg-secondary/80 transition-colors disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t">
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
            variant={isRecording ? "destructive" : "ghost"}
            size="sm"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading || isTranscribing}
            title={isRecording ? "Stop recording" : "Voice input"}
            className="px-2"
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
            placeholder={isRecording ? "Recording..." : "Ask me anything..."}
            disabled={isLoading || isRecording}
            className="flex-1 text-sm"
          />
          <Button type="submit" size="sm" disabled={!input.trim() || isLoading || isRecording}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
        {isRecording && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            Recording...
          </p>
        )}
      </div>
    </div>
  )
}
