import type { PlasmoMessaging } from "@plasmohq/messaging";
import { getEntriesForTab } from "../cache-state";

export interface RequestBody {
  tabId?: number;
}

export interface ResponseBody {
  total: number;
}

const handler: PlasmoMessaging.MessageHandler<RequestBody, ResponseBody> = async (req, res) => {
  try {
    let tabId = req.body?.tabId;
    
    // If no tabId provided, get current active tab
    if (!tabId) {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      tabId = activeTab?.id;
    }
    
    if (!tabId) {
      res.send({ total: 0 });
      return;
    }
    
    const entries = getEntriesForTab(tabId);
    
    res.send({
      total: entries.length,
    });
  } catch (error) {
    console.error("[Get Network Cache] Error:", error);
    res.send({ total: 0 });
  }
};

export default handler;

