import React, { useState, useEffect, useRef } from "react";
import { sendToBackground } from "@plasmohq/messaging";
import type { StartConversationRequest } from "../background/messages/start-conversation";
import type { GetUpdatesRequest, GetUpdatesResponse } from "../background/messages/get-conversation-updates";
import type { AbortConversationRequest } from "../background/messages/abort-conversation";
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
			id: "welcome",
			type: "system",
			content: "SYSTEM INITIALIZED. NEURAL LINK ESTABLISHED.",
			timestamp: Date.now(),
		},
	]);
	const [inputValue, setInputValue] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [conversationId, setConversationId] = useState<string | null>(null);
	const [currentTabId, setCurrentTabId] = useState<number | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const pollingRef = useRef<NodeJS.Timeout | null>(null);

	// Get current tab ID on mount
	useEffect(() => {
		chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
			if (tab?.id) {
				setCurrentTabId(tab.id);
			}
		});
	}, []);

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
				const updates = await sendToBackground<GetUpdatesRequest, GetUpdatesResponse>({
					name: "get-conversation-updates",
					body: { conversationId: convId },
				});

				console.log(
					`[SidePanel] 📥 Received ${updates.chunks.length} chunks, status: ${updates.status}, fullText length: ${updates.fullText.length}`
				);

				// Process chunks
				if (updates.chunks.length > 0) {
					console.log(`[SidePanel] 📋 Processing chunk types:`, updates.chunks.map(c => c.type));
					
					updates.chunks.forEach((chunk) => {
						if (chunk.type === "text-delta") {
							console.log(`[SidePanel] ✍️ Text delta: "${chunk.data.substring(0, 20)}..."`);
							// Append text to last assistant message or create new one
							setMessages((prev) => {
								const lastMsg = prev[prev.length - 1];
								if (lastMsg && lastMsg.type === "assistant" && lastMsg.id === convId) {
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
					setConversationId(null);
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
		setInputValue("");
		setIsStreaming(true);

		try {
			// Start conversation
			const convId = `conv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
			setConversationId(convId);

			await sendToBackground<StartConversationRequest, void>({
				name: "start-conversation",
				body: {
					conversationId: convId,
					prompt: inputValue,
					tabId: currentTabId,
				},
			});

			// Start polling for updates
			startPolling(convId);
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
		setConversationId(null);
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
							<span className={isStreaming ? "animate-pulse" : ""}>●</span>
							<span>{isStreaming ? "STREAMING" : "READY"}</span>
							<span className="text-green-700">|</span>
							<span>TAB: {currentTabId || "N/A"}</span>
						</div>
					</div>
					<div className="text-xs text-green-600 text-right">
						<div>SESSION: {Date.now().toString(36).toUpperCase()}</div>
						<div className="text-green-700">CLAUDE-3.5-SONNET</div>
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
										STREAMING
									</span>
								)}
							</div>
							<span className="text-[10px] text-green-700 font-normal">
								{formatTimestamp(message.timestamp)}
							</span>
						</div>
						<div
							className={`text-sm p-3 rounded border ${getMessageStyle(
								message.type
							)} whitespace-pre-wrap leading-relaxed`}
						>
							<span className="text-green-600 mr-1">&gt;</span>
							{message.content}
						</div>
					</div>
				))}

				{/* Typing indicator */}
				{isStreaming && (
					<div className="mr-8 border-l-2 border-green-700/30 pl-3 py-2 animate-fade-in">
						<div className="flex items-center gap-2 mb-1">
							<span className="text-xs font-bold tracking-wider text-green-500">[AI.AGENT]</span>
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
						/>
						<span className="absolute right-4 top-1/2 -translate-y-1/2 text-green-700 blink-cursor text-lg">
							▮
						</span>
					</div>
					{!isStreaming ? (
						<button
							onClick={handleSendMessage}
							disabled={!inputValue.trim()}
							className="px-6 py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded border-2 border-green-300 transition-all hover:shadow-[0_0_15px_rgba(0,255,0,0.6)] hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
						>
							[ SEND ]
						</button>
					) : (
						<button
							onClick={handleStop}
							className="px-6 py-3 bg-red-500 hover:bg-red-400 text-black font-bold rounded border-2 border-red-300 transition-all hover:shadow-[0_0_15px_rgba(255,0,0,0.6)] hover:scale-105 active:scale-95"
						>
							[ STOP ]
						</button>
					)}
				</div>
				<div className="text-[10px] text-green-800 mt-2 flex items-center gap-2">
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
