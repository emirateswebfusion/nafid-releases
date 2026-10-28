const a4HtmlByWindow = new Map<number, string>();
let lastSharedA4Html = '';

export function setSharedA4Html(html: string, windowId?: number): void {
  lastSharedA4Html = html;
  if (windowId != null) {
    a4HtmlByWindow.set(windowId, html);
  }
}

export function getSharedA4Html(windowId?: number): string {
  if (windowId != null && a4HtmlByWindow.has(windowId)) {
    return a4HtmlByWindow.get(windowId) || '';
  }
  return lastSharedA4Html;
}

export function clearSharedA4Html(windowId?: number): void {
  if (windowId != null) {
    a4HtmlByWindow.delete(windowId);
  }
  if (windowId == null || a4HtmlByWindow.size === 0) {
    lastSharedA4Html = '';
  }
}

