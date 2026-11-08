import {
  centsToValue,
  errorFromResponse,
  parseApproveUrl,
  parseAuthorization,
  PaypalError,
  type PaypalAuthorization,
} from "./parse";

/** Sandbox only. There is deliberately no switch to the live-money API. */
const SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
const TIMEOUT_MS = 15_000;

async function call(path: string, init: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(SANDBOX_BASE + path, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new PaypalError("timeout", "PayPal did not answer in time.");
    }
    throw new PaypalError("network", "Could not reach PayPal.");
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) throw errorFromResponse(res.status, body);
  return body;
}

async function accessToken(): Promise<string> {
  const id = process.env["PAYPAL_CLIENT_ID"];
  const secret = process.env["PAYPAL_CLIENT_SECRET"];
  if (!id || !secret) throw new PaypalError("config", "PayPal Sandbox keys are not set up yet.");
  try {
    const body = (await call("/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    })) as { access_token?: string };
    if (!body.access_token) throw new PaypalError("config", "PayPal did not return an access token.");
    return body.access_token;
  } catch (err) {
    if (err instanceof PaypalError && err.kind === "api" && (err.status === 401 || err.status === 400)) {
      throw new PaypalError("config", "PayPal rejected the Sandbox keys. Check they are Sandbox (not live) credentials.", err.status, err.issue);
    }
    throw err;
  }
}

async function authed(path: string, method: string, requestId: string, body?: unknown): Promise<unknown> {
  const token = await accessToken();
  return call(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      "PayPal-Request-Id": requestId,
    },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

export interface CreateOrderInput {
  requestKey: string;
  referenceId: string;
  amountCents: number;
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}

export const sandboxPaypal = {
  async createOrder(input: CreateOrderInput): Promise<{ orderId: string; approveUrl: string }> {
    const order = (await authed("/v2/checkout/orders", "POST", input.requestKey, {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          custom_id: input.referenceId,
          description: input.description.slice(0, 127),
          amount: { currency_code: input.currency, value: centsToValue(input.amountCents) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Payrail",
            shipping_preference: "NO_SHIPPING",
            user_action: "CONTINUE",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    })) as { id?: string };
    const approveUrl = parseApproveUrl(order);
    if (!order.id || !approveUrl) throw new PaypalError("api", "PayPal did not return an approval link.");
    return { orderId: order.id, approveUrl };
  },

  async authorizeOrder(orderId: string, requestKey: string): Promise<PaypalAuthorization> {
    const order = await authed(`/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, "POST", requestKey, {});
    const auth = parseAuthorization(order);
    if (!auth) throw new PaypalError("api", "PayPal did not return an authorization.");
    return auth;
  },

  async getOrderAuthorization(orderId: string): Promise<PaypalAuthorization | null> {
    const token = await accessToken();
    const order = await call(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseAuthorization(order);
  },

  async voidAuthorization(authorizationId: string, requestKey: string): Promise<void> {
    await authed(`/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, "POST", requestKey);
  },

  /** Captures the full authorized amount. The PayPal-Request-Id makes retries return the same capture. */
  async captureAuthorization(authorizationId: string, requestKey: string): Promise<{ captureId: string | null; status: string }> {
    const body = (await authed(
      `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
      "POST",
      requestKey,
      { final_capture: true },
    )) as { id?: string; status?: string } | null;
    return { captureId: body?.id ?? null, status: body?.status ?? "UNKNOWN" };
  },
};

export type SandboxPaypal = typeof sandboxPaypal;

/** Configuration check only: authenticates without creating an order or moving funds. */
export async function verifySandboxCredentials(): Promise<void> {
  await accessToken();
}
