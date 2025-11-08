import React, { useEffect, useState } from "react";
import icon from "data-base64:./icon.png";

import "./style.css";

const IndexPopup = () => {
  const [data, setData] = useState<string>("");

  useEffect(() => {
    // Example: Fetch data when popup opens
    console.log("Popup opened");
    
    // Example: Get data from storage
    chrome.storage.sync.get(["exampleKey"], (result) => {
      if (result.exampleKey) {
        setData(result.exampleKey);
      }
    });
  }, []);

  const handleButtonClick = () => {
    // Example: Store data
    chrome.storage.sync.set({ exampleKey: "Hello from popup!" });
    setData("Hello from popup!");
    
    // Example: Send message to background script
    chrome.runtime.sendMessage({ type: "POPUP_ACTION" }, (response) => {
      console.log("Response from background:", response);
    });
  };

  return (
    <div className="min-w-[350px] p-6 bg-black text-green-400 font-mono border-2 border-green-500 shadow-[0_0_20px_rgba(0,255,0,0.3)]">
      <div className="flex flex-col gap-4">
        {/* Hackery Header */}
        <div className="border-b-2 border-green-500 pb-3 mb-2">
          <div className="flex items-center gap-3">
            <img src={icon} alt="icon" className="w-12 h-12 border-2 border-green-400 rounded p-1 shadow-[0_0_10px_rgba(0,255,0,0.5)]" />
            <div>
              <h1 className="text-xl font-bold tracking-wider glitch" data-text="[EXTENSION.EXE]">
                [EXTENSION.EXE]
              </h1>
              <div className="text-xs text-green-500 flex items-center gap-2">
                <span className="animate-pulse">●</span>
                <span>STATUS: ONLINE</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Terminal-style info */}
        <div className="text-xs space-y-1 bg-green-950/30 p-3 rounded border border-green-700/50">
          <p className="text-green-500">
            <span className="text-green-300">&gt;</span> SYSTEM: Plasmo Framework v0.89.2
          </p>
          <p className="text-green-500">
            <span className="text-green-300">&gt;</span> INTERFACE: React 18 + TailwindCSS
          </p>
          <p className="text-green-500">
            <span className="text-green-300">&gt;</span> CONNECTION: tRPC Active
          </p>
        </div>
        
        {/* Hackery Button */}
        <button 
          onClick={handleButtonClick}
          className="px-4 py-2 bg-green-500 hover:bg-green-400 text-black font-bold rounded border-2 border-green-300 transition-all hover:shadow-[0_0_15px_rgba(0,255,0,0.6)] hover:scale-105 active:scale-95"
        >
          [ EXECUTE COMMAND ]
        </button>
        
        {/* Data output */}
        {data && (
          <div className="text-xs bg-black border border-green-500 p-3 rounded font-mono animate-fade-in">
            <span className="text-green-300">&gt;&gt; OUTPUT:</span>
            <div className="text-green-400 mt-1 pl-4 break-all">
              {data}
            </div>
          </div>
        )}
        
        {/* Footer glitch text */}
        <div className="text-center text-xs text-green-600 tracking-widest pt-2 border-t border-green-900">
          <span className="glitch-small" data-text="HACK THE PLANET">
            HACK THE PLANET
          </span>
        </div>
      </div>
    </div>
  );
};

export default IndexPopup;
