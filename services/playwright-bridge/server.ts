// REQ-092: Web automation bridge — launches and maintains Playwright browser
// contexts, one per active test run/session. Runs as a standalone Node
// process (never imported into the Next.js server bundle); only
// lib/bridge/client.ts is meant to call it, and only from server-side code.
//
// Usage: tsx services/playwright-bridge/server.ts [--port 4001]

import express from "express";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type {
  ActionRequest,
  ActionResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  DomResponse,
  ScreenshotResponse,
} from "../../lib/bridge/types";

const PORT = Number(
  process.argv.includes("--port")
    ? process.argv[process.argv.indexOf("--port") + 1]
    : (process.env.PLAYWRIGHT_BRIDGE_PORT ?? 4001)
);

type Session = {
  baseUrl: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: number;
};

const sessions = new Map<string, Session>();

const app = express();
app.use(express.json());

function getSession(sessionId: string | undefined): Session {
  if (!sessionId) throw new HttpError(400, "sessionId is required");
  const session = sessions.get(sessionId);
  if (!session) throw new HttpError(404, `No session ${sessionId}`);
  return session;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

app.get("/", (_req, res) => {
  res.json({ status: "ok", activeSessions: sessions.size });
});

app.post("/session", async (req, res, next) => {
  try {
    const { baseUrl, headless = true } = req.body as CreateSessionRequest;
    if (!baseUrl) throw new HttpError(400, "baseUrl is required");

    const browser = await chromium.launch({ headless });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(baseUrl, { waitUntil: "load" });

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { baseUrl, browser, context, page, createdAt: Date.now() });

    const response: CreateSessionResponse = { sessionId };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

app.delete("/session", async (req, res, next) => {
  try {
    const sessionId = (req.query.sessionId as string) ?? req.body?.sessionId;
    const session = sessions.get(sessionId);
    if (session) {
      await session.context.close();
      await session.browser.close();
      sessions.delete(sessionId);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post("/action", async (req, res, next) => {
  try {
    const { sessionId, type, params = {} } = req.body as ActionRequest;
    const session = getSession(sessionId);
    const { page, baseUrl } = session;

    switch (type) {
      case "navigate": {
        if (!params.url) throw new HttpError(400, "url is required");
        const target = new URL(params.url, baseUrl).toString();
        await page.goto(target, { waitUntil: "load" });
        break;
      }
      case "click":
      case "tap": {
        if (!params.selector) throw new HttpError(400, "selector is required");
        await page.locator(params.selector).click();
        break;
      }
      case "type": {
        if (!params.selector) throw new HttpError(400, "selector is required");
        const locator = page.locator(params.selector);
        if (params.clear === false) {
          await locator.pressSequentially(params.text ?? "");
        } else {
          await locator.fill(params.text ?? "");
        }
        break;
      }
      case "press": {
        if (!params.key) throw new HttpError(400, "key is required");
        if (params.selector) {
          await page.locator(params.selector).press(params.key);
        } else {
          await page.keyboard.press(params.key);
        }
        break;
      }
      case "scroll":
      case "swipe": {
        if (params.selector) {
          await page.locator(params.selector).scrollIntoViewIfNeeded();
        } else {
          const amount = params.amount ?? 400;
          const dy =
            params.direction === "up" ? -amount : params.direction === "down" ? amount : 0;
          const dx =
            params.direction === "left" ? -amount : params.direction === "right" ? amount : 0;
          await page.mouse.wheel(dx, dy);
        }
        break;
      }
      case "wait": {
        if (params.selector) {
          await page.locator(params.selector).waitFor({ timeout: params.ms ?? 10000 });
        } else {
          await page.waitForTimeout(params.ms ?? 1000);
        }
        break;
      }
      default:
        throw new HttpError(400, `Unknown action type: ${type}`);
    }

    const response: ActionResponse = { ok: true, url: page.url() };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

app.get("/screenshot", async (req, res, next) => {
  try {
    const session = getSession(req.query.sessionId as string | undefined);
    const buffer = await session.page.screenshot({ type: "png" });
    const response: ScreenshotResponse = { image: buffer.toString("base64") };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

app.get("/dom", async (req, res, next) => {
  try {
    const session = getSession(req.query.sessionId as string | undefined);
    const { page } = session;
    const ariaSnapshot = await page.locator("body").ariaSnapshot();
    const response: DomResponse = {
      url: page.url(),
      title: await page.title(),
      ariaSnapshot,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error(err);
  res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`[playwright-bridge] listening on http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  for (const session of sessions.values()) {
    await session.context.close().catch(() => {});
    await session.browser.close().catch(() => {});
  }
  process.exit(0);
});
