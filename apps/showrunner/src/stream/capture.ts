import { PROFILE_720, type FrameSource, type StreamProfile } from "./types.js";

/**
 * per-agent capture via cdp Page.startScreencast: 720p max, jpeg, ~5-8
 * fps by frame skipping. every frame is acked or chromium stops sending.
 * the websocket is the platform global (node 22+); a factory is injected
 * in tests. slow tv on purpose: this is the cheapest honest camera.
 */

interface CdpSocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "error", listener: (event: unknown) => void): void;
}

export interface CdpScreencastOptions {
  cdpWsUrl: string;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  /** send every nth compositor frame; 2-4 lands in the 5-8 fps band */
  everyNthFrame?: number;
  socketFactory?: (url: string) => CdpSocketLike;
}

export class CdpScreencast implements FrameSource {
  private readonly opts: CdpScreencastOptions;
  private socket: CdpSocketLike | null = null;
  private commandId = 0;

  constructor(opts: CdpScreencastOptions) {
    this.opts = opts;
  }

  async start(onFrame: (jpeg: Buffer) => void): Promise<void> {
    const factory =
      this.opts.socketFactory ??
      ((url: string) => new WebSocket(url) as unknown as CdpSocketLike);
    const socket = factory(this.opts.cdpWsUrl);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", (event) => reject(new Error(`cdp socket error: ${String(event)}`)));
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {
        method?: string;
        params?: { data?: string; sessionId?: number };
      };
      if (message.method !== "Page.screencastFrame" || !message.params?.data) return;
      // ack first: an unacked frame stalls the stream
      this.send(socket, "Page.screencastFrameAck", {
        sessionId: message.params.sessionId ?? 0,
      });
      onFrame(Buffer.from(message.params.data, "base64"));
    });

    this.send(socket, "Page.startScreencast", {
      format: "jpeg",
      quality: this.opts.quality ?? 60,
      maxWidth: this.opts.maxWidth ?? 1280,
      maxHeight: this.opts.maxHeight ?? 720,
      everyNthFrame: this.opts.everyNthFrame ?? 3,
    });
  }

  async stop(): Promise<void> {
    if (!this.socket) return;
    this.send(this.socket, "Page.stopScreencast", {});
    this.socket.close();
    this.socket = null;
  }

  private send(socket: CdpSocketLike, method: string, params: Record<string, unknown>): void {
    socket.send(JSON.stringify({ id: ++this.commandId, method, params }));
  }
}

/** the slice of a playwright page the screencast needs; structural so
 * tests fake it and the stream layer never hard-imports playwright.
 * the parameter is unknown on purpose: playwright's own newCDPSession
 * takes its Page type, and method bivariance lets both satisfy this. */
export interface ScreencastablePage {
  context(): {
    newCDPSession(page: unknown): Promise<CdpClientLike>;
  };
}

interface CdpClientLike {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(event: string, listener: (params: { data: string; sessionId: number }) => void): void;
  detach(): Promise<void>;
}

/**
 * screencast over an existing playwright page: the live runtime already
 * owns the browser, so capture attaches a cdp session to the page the
 * agent is actually using instead of opening a second socket. ack-first,
 * like the raw variant, or chromium stops sending.
 */
export class PlaywrightScreencast implements FrameSource {
  private readonly page: ScreencastablePage;
  private readonly profile: StreamProfile;
  private session: CdpClientLike | null = null;

  constructor(page: ScreencastablePage, profile: StreamProfile = PROFILE_720) {
    this.page = page;
    this.profile = profile;
  }

  async start(onFrame: (jpeg: Buffer) => void): Promise<void> {
    const session = await this.page.context().newCDPSession(this.page);
    this.session = session;
    session.on("Page.screencastFrame", (params) => {
      void session
        .send("Page.screencastFrameAck", { sessionId: params.sessionId })
        .catch(() => undefined);
      onFrame(Buffer.from(params.data, "base64"));
    });
    await session.send("Page.startScreencast", {
      format: "jpeg",
      quality: this.profile.jpegQuality,
      maxWidth: this.profile.width,
      maxHeight: this.profile.height,
      everyNthFrame: this.profile.fps >= 6 ? 2 : 3,
    });
  }

  async stop(): Promise<void> {
    if (!this.session) return;
    await this.session.send("Page.stopScreencast").catch(() => undefined);
    await this.session.detach().catch(() => undefined);
    this.session = null;
  }
}
