// REQ-091: Mobile automation bridge — maintains an Appium session against a
// local Android emulator/device via webdriverio. Requires the emulator and
// an Appium server to already be running locally (REQ-091).
//
// NOTE: unlike the Playwright bridge, this has not been exercised against
// real hardware/emulator in this build — there was no Android
// emulator/Appium server available to test against. It's written to the
// same contract and should work, but treat it as unverified until run
// against a real device.
//
// Usage: tsx services/appium-bridge/server.ts [--port 4002]

import express from "express";
import { remote } from "webdriverio";
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
    : (process.env.APPIUM_BRIDGE_PORT ?? 4002)
);

const APPIUM_SERVER_URL = process.env.APPIUM_SERVER_URL ?? "http://localhost:4723";

type Session = {
  driver: WebdriverIO.Browser;
  createdAt: number;
};

const sessions = new Map<string, Session>();

const app = express();
app.use(express.json());

class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

function getSession(sessionId: string | undefined): Session {
  if (!sessionId) throw new HttpError(400, "sessionId is required");
  const session = sessions.get(sessionId);
  if (!session) throw new HttpError(404, `No session ${sessionId}`);
  return session;
}

// Android keycodes for the handful of "press" targets the QA Agent is
// likely to ask for. https://developer.android.com/reference/android/view/KeyEvent
const ANDROID_KEYCODES: Record<string, number> = {
  Enter: 66,
  Back: 4,
  Home: 3,
  Tab: 61,
  Delete: 67,
  Escape: 111,
};

app.get("/", (_req, res) => {
  res.json({ status: "ok", activeSessions: sessions.size, appiumServerUrl: APPIUM_SERVER_URL });
});

app.post("/session", async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as CreateSessionRequest & {
      capabilities?: Record<string, unknown>;
    };
    const url = new URL(APPIUM_SERVER_URL);

    const driver = await remote({
      hostname: url.hostname,
      port: Number(url.port) || 4723,
      path: process.env.APPIUM_SERVER_PATH ?? "/",
      logLevel: "silent",
      capabilities: {
        platformName: "Android",
        "appium:automationName": "UiAutomator2",
        "appium:deviceName": process.env.APPIUM_DEVICE_NAME ?? "Android Emulator",
        ...(process.env.APPIUM_APP_PACKAGE
          ? { "appium:appPackage": process.env.APPIUM_APP_PACKAGE }
          : {}),
        ...(process.env.APPIUM_APP_ACTIVITY
          ? { "appium:appActivity": process.env.APPIUM_APP_ACTIVITY }
          : {}),
        ...body.capabilities,
      },
    });

    const sessionId = crypto.randomUUID();
    sessions.set(sessionId, { driver, createdAt: Date.now() });

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
      await session.driver.deleteSession().catch(() => {});
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
    const { driver } = getSession(sessionId);

    switch (type) {
      case "navigate": {
        if (!params.url) throw new HttpError(400, "url is required");
        if (typeof driver.url !== "function") {
          throw new HttpError(400, "navigate is only supported in a webview context");
        }
        await driver.url(params.url);
        break;
      }
      case "click":
      case "tap": {
        if (!params.selector) throw new HttpError(400, "selector is required");
        await driver.$(params.selector).click();
        break;
      }
      case "type": {
        if (!params.selector) throw new HttpError(400, "selector is required");
        const el = driver.$(params.selector);
        if (params.clear === false) {
          await el.addValue(params.text ?? "");
        } else {
          await el.setValue(params.text ?? "");
        }
        break;
      }
      case "press": {
        if (!params.key) throw new HttpError(400, "key is required");
        const keycode = ANDROID_KEYCODES[params.key];
        if (keycode === undefined) {
          throw new HttpError(400, `Unsupported key "${params.key}". Supported: ${Object.keys(ANDROID_KEYCODES).join(", ")}`);
        }
        await driver.pressKeyCode(keycode);
        break;
      }
      case "scroll":
      case "swipe": {
        const { width, height } = await driver.getWindowSize();
        const direction = params.direction ?? "up";
        const startX = width / 2;
        const startY = height / 2;
        const amount = params.amount ?? height / 3;
        const [endX, endY] =
          direction === "up"
            ? [startX, startY - amount]
            : direction === "down"
              ? [startX, startY + amount]
              : direction === "left"
                ? [startX - amount, startY]
                : [startX + amount, startY];

        await driver
          .action("pointer", { parameters: { pointerType: "touch" } })
          .move({ duration: 0, x: Math.round(startX), y: Math.round(startY) })
          .down()
          .move({ duration: 300, x: Math.round(endX), y: Math.round(endY) })
          .up()
          .perform();
        break;
      }
      case "wait": {
        if (params.selector) {
          await driver.$(params.selector).waitForDisplayed({ timeout: params.ms ?? 10000 });
        } else {
          await driver.pause(params.ms ?? 1000);
        }
        break;
      }
      default:
        throw new HttpError(400, `Unknown action type: ${type}`);
    }

    const response: ActionResponse = { ok: true };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

app.get("/screenshot", async (req, res, next) => {
  try {
    const { driver } = getSession(req.query.sessionId as string | undefined);
    const base64 = await driver.takeScreenshot();
    const response: ScreenshotResponse = { image: base64 };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

app.get("/dom", async (req, res, next) => {
  try {
    const { driver } = getSession(req.query.sessionId as string | undefined);
    const source = await driver.getPageSource();
    // No direct "url"/"title" concept for a native app — report what we can.
    const response: DomResponse = {
      url: "",
      title: "",
      ariaSnapshot: source,
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
  res.status(500).json({
    error: `${message} (is the Appium server running at ${APPIUM_SERVER_URL} with a device/emulator attached?)`,
  });
});

app.listen(PORT, () => {
  console.log(`[appium-bridge] listening on http://localhost:${PORT}, targeting Appium server at ${APPIUM_SERVER_URL}`);
});

process.on("SIGINT", async () => {
  for (const session of sessions.values()) {
    await session.driver.deleteSession().catch(() => {});
  }
  process.exit(0);
});
