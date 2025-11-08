/**
 * Example utility functions for content scripts
 * Add your DOM manipulation or page interaction helpers here
 */

/**
 * Wait for an element to appear in the DOM
 * @param selector CSS selector to wait for
 * @param timeout Maximum time to wait in milliseconds
 * @returns Promise that resolves with the element or null if timeout
 */
export const waitForElement = (
  selector: string,
  timeout = 5000
): Promise<Element | null> => {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
};

/**
 * Inject a custom element into the page
 * @param html HTML string to inject
 * @param targetSelector Where to inject the element
 * @param position Position relative to target
 */
export const injectElement = (
  html: string,
  targetSelector: string,
  position: InsertPosition = "beforeend"
): HTMLElement | null => {
  const target = document.querySelector(targetSelector);
  if (!target) {
    console.error(`Target element not found: ${targetSelector}`);
    return null;
  }

  const temp = document.createElement("div");
  temp.innerHTML = html;
  const element = temp.firstElementChild as HTMLElement;

  if (!element) {
    console.error("Failed to create element from HTML");
    return null;
  }

  target.insertAdjacentElement(position, element);
  return element;
};

