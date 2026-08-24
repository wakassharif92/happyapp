// Shared HTTP contract for both automation bridges (REQ-090).
// The QA Agent's single `automation_action(type, params)` tool (REQ-101)
// speaks this vocabulary regardless of whether it's routed to the
// Playwright bridge (web) or the Appium bridge (mobile) — 'tap' and
// 'click' are synonyms, as are 'swipe' and 'scroll'.

export type ActionType =
  | "navigate"
  | "click"
  | "tap"
  | "type"
  | "press"
  | "scroll"
  | "swipe"
  | "wait";

export type ActionParams = {
  url?: string;
  selector?: string;
  text?: string;
  clear?: boolean;
  key?: string;
  direction?: "up" | "down" | "left" | "right";
  amount?: number;
  ms?: number;
};

export type CreateSessionRequest = {
  baseUrl: string;
  headless?: boolean;
};

export type CreateSessionResponse = {
  sessionId: string;
};

export type ActionRequest = {
  sessionId: string;
  type: ActionType;
  params?: ActionParams;
};

export type ActionResponse = {
  ok: boolean;
  message?: string;
  url?: string;
};

export type ScreenshotResponse = {
  image: string; // base64-encoded PNG
};

export type DomResponse = {
  url: string;
  title: string;
  ariaSnapshot: string;
};

export type BridgeErrorResponse = {
  error: string;
};
