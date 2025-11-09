import React, { useState } from "react";
import { setApiKey } from "../utils/api-key-storage";

interface ApiKeyInputProps {
  onKeySet: () => void;
}

export default function ApiKeyInput({ onKeySet }: ApiKeyInputProps) {
  const [apiKey, setApiKeyInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!apiKey.trim()) return;

    setIsSubmitting(true);
    try {
      await setApiKey(apiKey.trim());
      // Notify parent that key has been set
      onKeySet();
    } catch (error) {
      console.error("[ApiKeyInput] Failed to save API key:", error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-black font-mono text-green-400">
      {/* Scan line effect */}
      <div className="scan-line" />

      <div className="relative w-full max-w-md space-y-6 p-8">
        {/* Header */}
        <div className="border-b-2 border-green-500 pb-4">
          <h1
            className="glitch text-3xl font-bold tracking-wider text-center"
            data-text="[SYSTEM.AUTH]"
          >
            [SYSTEM.AUTH]
          </h1>
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-green-500">
            <span className="animate-pulse">●</span>
            <span>AUTHENTICATION REQUIRED</span>
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-3 rounded border border-green-700 bg-green-950/30 p-4 text-sm">
          <p className="text-green-300">
            <span className="text-green-500">&gt;</span> ENTER API KEY TO
            INITIALIZE
          </p>
          <p className="text-green-600 text-xs">
            <span className="text-green-700">&gt;</span> SECURITY PROTOCOL:
            ACTIVE
          </p>
          <p className="text-green-600 text-xs">
            <span className="text-green-700">&gt;</span> ENCRYPTION: ENABLED
          </p>
        </div>

        {/* Input Field */}
        <div className="space-y-4">
          <div className="relative">
            <label className="mb-2 block text-xs font-bold tracking-wider text-green-500">
              [API.KEY.INPUT]
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Enter your API key..."
              disabled={isSubmitting}
              className="w-full rounded border-2 border-green-700 bg-black px-4 py-3 text-green-400 placeholder-green-800 transition-all focus:border-green-500 focus:shadow-[0_0_15px_rgba(0,255,0,0.3)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="blink-cursor absolute right-4 top-[42px] text-lg text-green-700">
              ▮
            </span>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!apiKey.trim() || isSubmitting}
            className="w-full rounded border-2 border-green-300 bg-green-500 px-6 py-3 font-bold text-black transition-all hover:scale-105 hover:bg-green-400 hover:shadow-[0_0_15px_rgba(0,255,0,0.6)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none"
          >
            {isSubmitting ? "[ INITIALIZING... ]" : "[ INITIALIZE SYSTEM ]"}
          </button>
        </div>

        {/* Footer */}
        <div className="space-y-2 border-t border-green-900 pt-4 text-center text-xs text-green-700">
          <p className="tracking-wide">PRESS ENTER TO SUBMIT</p>
          <p className="glitch-small tracking-widest" data-text="ACCESS GRANTED">
            ACCESS PENDING
          </p>
        </div>
      </div>
    </div>
  );
}

