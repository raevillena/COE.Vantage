// The only part of the extension API these scripts use (no @types/chrome dependency needed).
declare const chrome:
  | {
      action?: { onClicked: { addListener(listener: () => void): void } };
      tabs?: { create(properties: { url: string }): Promise<unknown> };
      runtime?: {
        sendMessage(message: unknown): Promise<unknown>;
        onMessage: {
          addListener(listener: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void): void;
        };
      };
      storage?: {
        local: {
          get(key: string): Promise<Record<string, unknown>>;
          set(items: Record<string, unknown>): Promise<void>;
          remove(key: string): Promise<void>;
        };
      };
    }
  | undefined;
