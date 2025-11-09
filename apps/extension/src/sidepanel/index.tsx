import React, { useEffect, useRef, useState } from "react";
import { sendToBackground } from "@plasmohq/messaging";

import type { AbortConversationRequest } from "../background/messages/abort-conversation";
import type {
  GetUpdatesRequest,
  GetUpdatesResponse,
} from "../background/messages/get-conversation-updates";
import type { StartConversationRequest } from "../background/messages/start-conversation";
import { hasApiKey } from "../utils/api-key-storage";
import ApiKeyInput from "./ApiKeyInput";

import "./style.css";

interface Message {
  id: string;
  type: "user" | "assistant" | "system" | "error" | "tool";
  content: string;
  timestamp: number;
  toolName?: string;
}

export default function SidePanel() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      type: "system",
      content: "SYSTEM INITIALIZED. NEURAL LINK ESTABLISHED.",
      timestamp: Date.now(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string>(
    () => `conv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [cacheCount, setCacheCount] = useState<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const cacheCountRef = useRef<NodeJS.Timeout | null>(null);

  // Check for API key on mount
  useEffect(() => {
    hasApiKey().then((exists) => {
      setHasKey(exists);
    });
  }, []);

  // Get current tab ID on mount
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id) {
        setCurrentTabId(tab.id);
      }
    });
  }, []);

  // Poll for cache count every 2 seconds
  useEffect(() => {
    if (!currentTabId) return;

    const fetchCacheCount = async () => {
      try {
        const stats = await sendToBackground({
          name: "get-network-cache",
          body: { tabId: currentTabId },
        });
        setCacheCount(stats?.total || 0);
      } catch (error) {
        console.error("[SidePanel] Failed to fetch cache count:", error);
      }
    };

    // Fetch immediately
    fetchCacheCount();

    // Poll every 2 seconds
    cacheCountRef.current = setInterval(fetchCacheCount, 2000);

    return () => {
      if (cacheCountRef.current) {
        clearInterval(cacheCountRef.current);
      }
    };
  }, [currentTabId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Start polling for updates
  const startPolling = (convId: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(async () => {
      try {
        const updates = await sendToBackground<
          GetUpdatesRequest,
          GetUpdatesResponse
        >({
          name: "get-conversation-updates",
          body: { conversationId: convId },
        });

        console.log(
          `[SidePanel] 📥 Received ${updates.chunks.length} chunks, status: ${updates.status}, fullText length: ${updates.fullText.length}`,
        );

        // Process chunks
        if (updates.chunks.length > 0) {
          console.log(
            `[SidePanel] 📋 Processing chunk types:`,
            updates.chunks.map((c) => c.type),
          );

          updates.chunks.forEach((chunk) => {
            if (chunk.type === "text-delta") {
              console.log(
                `[SidePanel] ✍️ Text delta: "${chunk.data.substring(0, 20)}..."`,
              );
              // Append text to last assistant message or create new one
              setMessages((prev) => {
                const lastMsg = prev[prev.length - 1];
                if (
                  lastMsg &&
                  lastMsg.type === "assistant" &&
                  lastMsg.id === convId
                ) {
                  return [
                    ...prev.slice(0, -1),
                    {
                      ...lastMsg,
                      content: lastMsg.content + chunk.data,
                    },
                  ];
                } else {
                  return [
                    ...prev,
                    {
                      id: convId,
                      type: "assistant",
                      content: chunk.data,
                      timestamp: chunk.timestamp,
                    },
                  ];
                }
              });
            } else if (chunk.type === "tool-call") {
              // Show tool execution
              setMessages((prev) => [
                ...prev,
                {
                  id: `tool-${chunk.timestamp}`,
                  type: "tool",
                  content: `Executing: ${chunk.data.toolName}(${JSON.stringify(chunk.data.args)})`,
                  timestamp: chunk.timestamp,
                  toolName: chunk.data.toolName,
                },
              ]);
            } else if (chunk.type === "error") {
              setMessages((prev) => [
                ...prev,
                {
                  id: `error-${chunk.timestamp}`,
                  type: "error",
                  content: chunk.data,
                  timestamp: chunk.timestamp,
                },
              ]);
            }
          });
        }

        // Check if done
        if (updates.status !== "streaming") {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
          }
          setIsStreaming(false);
          // Don't reset conversationId - keep it for history
        }
      } catch (error) {
        console.error("[SidePanel] Failed to get updates:", error);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
        }
        setIsStreaming(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            type: "error",
            content: `Failed to get updates: ${error instanceof Error ? error.message : String(error)}`,
            timestamp: Date.now(),
          },
        ]);
      }
    }, 300);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isStreaming) return;

    if (!currentTabId) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          type: "error",
          content: "No active tab found. Please refresh the page.",
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    // Add user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      type: "user",
      content: inputValue,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    const promptToSend = inputValue; // Save before clearing
    setInputValue("");
    setIsStreaming(true);

    try {
      // Reuse existing conversationId instead of creating new one
      await sendToBackground<StartConversationRequest, void>({
        name: "start-conversation",
        body: {
          conversationId, // Use persistent ID
          prompt: promptToSend,
          tabId: currentTabId,
        },
      });

      // Start polling for updates
      startPolling(conversationId);
    } catch (error) {
      console.error("[SidePanel] Failed to start conversation:", error);
      setIsStreaming(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          type: "error",
          content: `Failed to start conversation: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: Date.now(),
        },
      ]);
    }
  };

  const handleStop = async () => {
    if (conversationId) {
      try {
        await sendToBackground<AbortConversationRequest, void>({
          name: "abort-conversation",
          body: { conversationId },
        });
      } catch (error) {
        console.error("[SidePanel] Failed to abort:", error);
      }
    }
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    setIsStreaming(false);
  };

  const handleClearConversation = () => {
    // Stop any ongoing streaming
    if (isStreaming) {
      handleStop();
    }

    // Generate new conversation ID
    setConversationId(
      `conv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );

    // Reset messages to initial state
    setMessages([
      {
        id: "welcome",
        type: "system",
        content: "SYSTEM INITIALIZED. NEURAL LINK ESTABLISHED.",
        timestamp: Date.now(),
      },
    ]);

    console.log("[SidePanel] 🔄 Conversation cleared, new session started");
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

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
      second: "2-digit",
    });
  };

  const handleApiKeySet = () => {
    setHasKey(true);
  };

  // Show loading state while checking for API key
  if (hasKey === null) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-black font-mono text-green-400">
        <div className="text-center">
          <div className="mb-4 text-2xl font-bold tracking-wider">
            [INITIALIZING...]
          </div>
          <div className="flex items-center justify-center gap-1">
            <span className="typing-dot">●</span>
            <span className="typing-dot">●</span>
            <span className="typing-dot">●</span>
          </div>
        </div>
      </div>
    );
  }

  // Show API key input if no key is set
  if (!hasKey) {
    return <ApiKeyInput onKeySet={handleApiKeySet} />;
  }

  // Show main chat interface if API key exists
  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-black font-mono text-green-400">
      {/* Scan line effect */}
      <div className="scan-line" />

      {/* Header */}
      <div className="z-10 border-b-2 border-green-500 bg-black/90 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="glitch text-2xl font-bold tracking-wider"
              data-text="[AI.TERMINAL]"
            >
              [AI.TERMINAL]
            </h1>
            <div className="mt-1 flex items-center gap-2 text-xs text-green-500">
              <span className={isStreaming ? "animate-pulse" : ""}>●</span>
              <span>{isStreaming ? "STREAMING" : "READY"}</span>
              <span className="text-green-700">|</span>
              <span>CACHE: {cacheCount} REQ</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={handleClearConversation}
              disabled={isStreaming}
              className="rounded border border-cyan-700 bg-cyan-950/40 px-3 py-1 text-[10px] font-bold text-cyan-400 transition-all hover:bg-cyan-900/60 hover:shadow-[0_0_10px_rgba(0,255,255,0.3)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
            >
              [ NEW SESSION ]
            </button>
            <div className="text-right text-xs text-green-600">
              <div>TAB: {currentTabId || "N/A"}</div>
              <div className="text-green-700">CLAUDE-3.5-SONNET</div>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Container */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`animate-fade-in border-l-2 py-2 pl-3 ${
              message.type === "user" ? "ml-8" : "mr-8"
            }`}
          >
            <div className="mb-1 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tracking-wider">
                  {message.type === "user" && "[USER]"}
                  {message.type === "assistant" && "[AI.AGENT]"}
                  {message.type === "system" && "[SYSTEM]"}
                  {message.type === "error" && "[ERROR]"}
                  {message.type === "tool" &&
                    `[TOOL:${message.toolName?.toUpperCase()}]`}
                </span>
                {message.type === "assistant" && (
                  <span className="rounded border border-green-800 px-1 text-[8px] text-green-700">
                    STREAMING
                  </span>
                )}
              </div>
              <span className="text-[10px] font-normal text-green-700">
                {formatTimestamp(message.timestamp)}
              </span>
            </div>
            <div
              className={`rounded border p-3 text-sm ${getMessageStyle(
                message.type,
              )} overflow-wrap-anywhere whitespace-pre-wrap break-words leading-relaxed`}
            >
              <span className="mr-1 text-green-600">&gt;</span>
              {message.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isStreaming && (
          <div className="animate-fade-in mr-8 border-l-2 border-green-700/30 py-2 pl-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-xs font-bold tracking-wider text-green-500">
                [AI.AGENT]
              </span>
              <span className="rounded border border-green-800 px-1 text-[8px] text-green-700">
                THINKING
              </span>
            </div>
            <div className="flex items-center gap-1 rounded border border-green-700/30 bg-black/60 p-3 text-sm text-green-500">
              <span className="mr-1 text-green-600">&gt;</span>
              <span className="typing-dot">●</span>
              <span className="typing-dot">●</span>
              <span className="typing-dot">●</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="z-10 border-t-2 border-green-500 bg-black/90 p-4 backdrop-blur-sm">
        <div className="flex gap-2">
          <div className="relative flex-1">
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
              className="w-full rounded border-2 border-green-700 bg-black px-4 py-3 text-green-400 placeholder-green-800 transition-all focus:border-green-500 focus:shadow-[0_0_15px_rgba(0,255,0,0.3)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="blink-cursor absolute right-4 top-1/2 -translate-y-1/2 text-lg text-green-700">
              ▮
            </span>
          </div>
          {!isStreaming ? (
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim()}
              className="rounded border-2 border-green-300 bg-green-500 px-6 py-3 font-bold text-black transition-all hover:scale-105 hover:bg-green-400 hover:shadow-[0_0_15px_rgba(0,255,0,0.6)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
            >
              [ SEND ]
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="rounded border-2 border-red-300 bg-red-500 px-6 py-3 font-bold text-black transition-all hover:scale-105 hover:bg-red-400 hover:shadow-[0_0_15px_rgba(255,0,0,0.6)] active:scale-95"
            >
              [ STOP ]
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-green-800">
          <span>→ PRESS ENTER TO SEND</span>
          <span className="text-green-900">|</span>
          <span>{isStreaming ? "STREAMING..." : "CONNECTION: ACTIVE"}</span>
          {currentTabId && (
            <>
              <span className="text-green-900">|</span>
              <span>MONITORING TAB: {currentTabId}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
