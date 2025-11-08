import React, { useState, useEffect, useRef } from "react";
import "./style.css";

interface Message {
  id: string;
  type: "user" | "assistant" | "system" | "error" | "tool";
  content: string;
  timestamp: number;
  toolName?: string;
}

export default function SidePanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "system",
      content: "SYSTEM INITIALIZED. NEURAL LINK ESTABLISHED.",
      timestamp: Date.now() - 10000,
    },
    {
      id: "2",
      type: "assistant",
      content: "Greetings. I am your AI assistant. How may I help you analyze the network traffic today?",
      timestamp: Date.now() - 8000,
    },
    {
      id: "3",
      type: "user",
      content: "Show me all API requests from the current page",
      timestamp: Date.now() - 5000,
    },
    {
      id: "4",
      type: "tool",
      content: "Executing: get_network_requests({limit: 50})",
      timestamp: Date.now() - 4000,
      toolName: "get_network_requests",
    },
    {
      id: "5",
      type: "assistant",
      content: "I found 127 network requests. Here are the most recent API calls:\n\n• GET /api/users - 200 OK (142ms)\n• POST /api/auth/login - 201 Created (89ms)\n• GET /api/products?page=1 - 200 OK (256ms)\n• PUT /api/cart/items - 200 OK (178ms)\n\nWould you like me to analyze any specific requests in more detail?",
      timestamp: Date.now() - 2000,
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Simulate streaming effect for demo
  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      type: "user",
      content: inputValue,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsStreaming(true);

    // Simulate AI response after a delay
    setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: "assistant",
        content: "Processing your request... Analyzing network patterns and cache data. Stand by.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsStreaming(false);
    }, 1500);
  };

  const getMessageStyle = (type: Message["type"]) => {
    switch (type) {
      case "user":
        return "bg-green-900/40 border-green-500/50 text-green-300";
      case "assistant":
        return "bg-black/60 border-green-700/30 text-green-400";
      case "system":
        return "bg-cyan-950/40 border-cyan-500/50 text-cyan-300";
      case "error":
        return "bg-red-950/40 border-red-500/50 text-red-300";
      case "tool":
        return "bg-yellow-950/40 border-yellow-500/50 text-yellow-300";
      default:
        return "bg-gray-900/40 border-gray-500/50 text-gray-300";
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { 
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  return (
    <div className="h-screen w-full bg-black text-green-400 font-mono flex flex-col relative overflow-hidden">
      {/* Scan line effect */}
      <div className="scan-line" />
      
      {/* Header */}
      <div className="border-b-2 border-green-500 p-4 bg-black/90 backdrop-blur-sm z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-wider glitch" data-text="[AI.TERMINAL]">
              [AI.TERMINAL]
            </h1>
            <div className="text-xs text-green-500 flex items-center gap-2 mt-1">
              <span className="animate-pulse">●</span>
              <span>NEURAL LINK: ACTIVE</span>
              <span className="text-green-700">|</span>
              <span>LATENCY: 12ms</span>
            </div>
          </div>
          <div className="text-xs text-green-600 text-right">
            <div>SESSION: {Date.now().toString(36).toUpperCase()}</div>
            <div className="text-green-700">v2.4.1-alpha</div>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`border-l-2 pl-3 py-2 animate-fade-in ${
              message.type === "user" ? "ml-8" : "mr-8"
            }`}
            data-testid={`message-${message.id}`}
          >
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wider">
                  {message.type === "user" && "[USER]"}
                  {message.type === "assistant" && "[AI.AGENT]"}
                  {message.type === "system" && "[SYSTEM]"}
                  {message.type === "error" && "[ERROR]"}
                  {message.type === "tool" && `[TOOL:${message.toolName?.toUpperCase()}]`}
                </span>
                {message.type === "assistant" && (
                  <span className="text-[8px] text-green-700 border border-green-800 px-1 rounded">
                    CLAUDE-4.5
                  </span>
                )}
              </div>
              <span className="text-[10px] text-green-700 font-normal">
                {formatTimestamp(message.timestamp)}
              </span>
            </div>
            <div className={`text-sm p-3 rounded border ${
              getMessageStyle(message.type)
            } whitespace-pre-wrap leading-relaxed`}>
              <span className="text-green-600 mr-1">&gt;</span>
              {message.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isStreaming && (
          <div className="mr-8 border-l-2 border-green-700/30 pl-3 py-2 animate-fade-in">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold tracking-wider text-green-500">
                [AI.AGENT]
              </span>
              <span className="text-[8px] text-green-700 border border-green-800 px-1 rounded">
                THINKING
              </span>
            </div>
            <div className="text-sm p-3 rounded border bg-black/60 border-green-700/30 text-green-500 flex items-center gap-1">
              <span className="text-green-600 mr-1">&gt;</span>
              <span className="typing-dot">●</span>
              <span className="typing-dot">●</span>
              <span className="typing-dot">●</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t-2 border-green-500 p-4 bg-black/90 backdrop-blur-sm z-10">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Enter command..."
              disabled={isStreaming}
              className="w-full bg-black border-2 border-green-700 rounded px-4 py-3 text-green-400 placeholder-green-800 focus:outline-none focus:border-green-500 focus:shadow-[0_0_15px_rgba(0,255,0,0.3)] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              data-testid="chat-input"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-green-700 blink-cursor text-lg">▮</span>
          </div>
          <button
            onClick={handleSendMessage}
            disabled={isStreaming || !inputValue.trim()}
            className="px-6 py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded border-2 border-green-300 transition-all hover:shadow-[0_0_15px_rgba(0,255,0,0.6)] hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
            data-testid="send-button"
          >
            [ SEND ]
          </button>
        </div>
        <div className="text-[10px] text-green-800 mt-2 flex items-center gap-2">
          <span>→ PRESS ENTER TO SEND</span>
          <span className="text-green-900">|</span>
          <span>CONNECTION: ENCRYPTED</span>
        </div>
      </div>
    </div>
  );
}
