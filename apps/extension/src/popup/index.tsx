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
    <div className="min-w-[300px] p-4 bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
      <div className="flex flex-col items-center gap-4">
        <img src={icon} alt="icon" className="w-16 h-16" />
        <h1 className="text-2xl font-bold">Extension Template</h1>
        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          A Chrome extension template with Plasmo, React, and TailwindCSS
        </p>
        
        <button 
          onClick={handleButtonClick}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
        >
          Click Me
        </button>
        
        {data && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Data: {data}
          </div>
        )}
      </div>
    </div>
  );
};

export default IndexPopup;
