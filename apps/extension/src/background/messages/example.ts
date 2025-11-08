import type { PlasmoMessaging } from "@plasmohq/messaging";

/**
 * Example background message handler
 * This handler can be called from content scripts or popup using sendToBackground()
 * 
 * Usage from content script or popup:
 * 
 * import { sendToBackground } from "@plasmohq/messaging";
 * 
 * const response = await sendToBackground<ExampleRequest, ExampleResponse>({
 *   name: "example",
 *   body: { message: "Hello from content script!" }
 * });
 * console.log(response.message);
 */

export type ExampleRequest = {
  message: string;
};

export type ExampleResponse = {
  message: string;
};

const handler: PlasmoMessaging.MessageHandler<ExampleRequest, ExampleResponse> = async (req, res) => {
  console.log("Message received in background:", req.body);
  
  // Example: Process the message
  const response: ExampleResponse = {
    message: `Background script received: ${req.body?.message || "no message"}`
  };
  
  res.send(response);
};

export default handler;

