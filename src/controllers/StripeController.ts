import { Request, Response } from "express";
import Stripe from "stripe";
import mongoose from "mongoose";
import config from "../config";
import UserModel from "../models/User";
import WorkspaceModel from "../models/Workspace";
import PaymentModel from "../models/Payment";
import { createLogger } from "../utils/logger";

const logger = createLogger("StripeController");
const stripe = config.stripe.secretKey
  ? new Stripe(config.stripe.secretKey)
  : null;

/** Min/max amount in cents per billing period (e.g. $25-$3000/month or year total) */
const MIN_AMOUNT_CENTS = 2500;
const MAX_AMOUNT_CENTS = 300000;

/**
 * POST body: { amountCents: number, creditsPerMonth: number, interval: "month" | "year", workspaceId?: string }
 * Creates a Stripe Checkout Session for Pro subscription.
 * When workspaceId is provided, subscribes the workspace to Pro (credits shared by members).
 * Otherwise subscribes the user (legacy).
 * Returns { url: string } to redirect the user to Stripe Checkout.
 */
export async function createProCheckoutSession(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!stripe) {
    res.status(503).json({ error: "Payments are not configured" });
    return;
  }

  const body = req.body as {
    amountCents?: number;
    creditsPerMonth?: number;
    interval?: string;
    workspaceId?: string;
  };

  const amountCents = typeof body.amountCents === "number" ? body.amountCents : 0;
  const creditsPerMonth =
    typeof body.creditsPerMonth === "number" ? body.creditsPerMonth : 100;
  const interval =
    body.interval === "year" ? "year" : "month";

  if (amountCents < MIN_AMOUNT_CENTS || amountCents > MAX_AMOUNT_CENTS) {
    res.status(400).json({
      error: `Amount must be between $${MIN_AMOUNT_CENTS / 100} and $${MAX_AMOUNT_CENTS / 100} per month`,
    });
    return;
  }

  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : undefined;
  let workspaceName: string | undefined;
  if (workspaceId) {
    const { ensureUserCanManageWorkspace } = await import("../services/workspaceService");
    try {
      await ensureUserCanManageWorkspace(userId!, workspaceId);
    } catch {
      res.status(403).json({ error: "Access denied to this workspace" });
      return;
    }
    const workspace = await WorkspaceModel.findById(workspaceId).select("name").lean();
    workspaceName = workspace?.name?.trim() ?? undefined;
  }
  const appUrl = config.app.url.replace(/\/$/, "");
  const successUrl = workspaceId
    ? `${appUrl}/settings?tab=plans&checkout=success&workspaceId=${encodeURIComponent(workspaceId)}`
    : `${appUrl}/settings?tab=plans&checkout=success`;
  const cancelUrl = workspaceId
    ? `${appUrl}/settings?tab=plans&checkout=cancelled&workspaceId=${encodeURIComponent(workspaceId)}`
    : `${appUrl}/settings?tab=plans&checkout=cancelled`;

  const user = await UserModel.findById(userId).select("email name stripeCustomerId").lean();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  let customerId: string | undefined = user.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: { userId },
    });
    customerId = customer.id;
    await UserModel.findByIdAndUpdate(userId, { $set: { stripeCustomerId: customerId } });
  }

  const productName =
    interval === "year"
      ? `Pro Plan — ${creditsPerMonth.toLocaleString()} credits/month (annual)`
      : `Pro Plan — ${creditsPerMonth.toLocaleString()} credits/month`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: userId,
      metadata: {
        userId,
        creditsPerMonth: String(creditsPerMonth),
        interval,
        ...(workspaceId && { workspaceId }),
        ...(workspaceName && { workspaceName: workspaceName.slice(0, 500) }),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            product_data: {
              name: productName,
              description: `${creditsPerMonth.toLocaleString()} credits per month${interval === "year" ? " · billed annually" : ""}`,
            },
            unit_amount: amountCents,
            recurring: { interval },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      res.status(500).json({ error: "Failed to create checkout session" });
      return;
    }

    res.json({ url: session.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Stripe checkout failed";
    res.status(500).json({ error: message });
  }
}

/**
 * POST body: { credits: number, amountCents: number, workspaceId: string }
 * Creates a Stripe Checkout Session for one-time Pro workspace credit top-up.
 * Top-up credits valid 12 months from most recent purchase.
 * Returns { url: string }.
 */
export async function createTopUpCheckoutSession(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!stripe) {
    res.status(503).json({ error: "Payments are not configured" });
    return;
  }

  const body = req.body as {
    credits?: number;
    amountCents?: number;
    workspaceId?: string;
  };

  const credits = typeof body.credits === "number" ? body.credits : 100;
  const amountCents = typeof body.amountCents === "number" ? body.amountCents : 2500;
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : undefined;

  if (!workspaceId) {
    res.status(400).json({ error: "workspaceId is required" });
    return;
  }

  if (credits < 100 || credits > 10000 || amountCents < 2500 || amountCents > 225000) {
    res.status(400).json({ error: "Invalid credits or amount" });
    return;
  }

  const { ensureUserCanManageWorkspace } = await import("../services/workspaceService");
  try {
    await ensureUserCanManageWorkspace(userId!, workspaceId);
  } catch {
    res.status(403).json({ error: "Access denied to this workspace" });
    return;
  }

  const ws = await WorkspaceModel.findById(workspaceId).select("planStatus").lean();
  if (ws?.planStatus !== "pro") {
    res.status(400).json({ error: "Workspace must be Pro to add top-up credits" });
    return;
  }

  const appUrl = config.app.url.replace(/\/$/, "");
  const successUrl = `${appUrl}/settings?tab=plans&checkout=success&workspaceId=${encodeURIComponent(workspaceId)}&topup=1`;
  const cancelUrl = `${appUrl}/settings?tab=plans&checkout=cancelled&workspaceId=${encodeURIComponent(workspaceId)}`;

  const user = await UserModel.findById(userId).select("email name stripeCustomerId").lean();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  let customerId: string | undefined = user.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: { userId },
    });
    customerId = customer.id;
    await UserModel.findByIdAndUpdate(userId, { $set: { stripeCustomerId: customerId } });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      client_reference_id: userId,
      metadata: {
        userId,
        workspaceId,
        type: "topup",
        credits: String(credits),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            product_data: {
              name: `Credits top-up — ${credits.toLocaleString()} credits`,
              description: "Valid for 12 months from your most recent purchase.",
            },
            unit_amount: amountCents,
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      res.status(500).json({ error: "Failed to create checkout session" });
      return;
    }

    res.json({ url: session.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Top-up checkout failed";
    res.status(500).json({ error: message });
  }
}

/**
 * POST body: { flow?: "payment_method_update" | "invoices" }
 * Creates a Stripe Billing Portal session. Returns { url: string }.
 * Creates a Stripe Customer for the user if they don't have one (so Free users can open the portal too).
 */
export async function createBillingPortalSession(
  req: Request,
  res: Response
): Promise<void> {
  const userId = req.auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!stripe) {
    res.status(503).json({ error: "Payments are not configured" });
    return;
  }

  const body = (req.body ?? {}) as { flow?: string };
  const flow = body.flow === "payment_method_update" ? "payment_method_update" : undefined;

  const user = await UserModel.findById(userId).select("email name stripeCustomerId").lean();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  let customerId = user.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: { userId },
    });
    customerId = customer.id;
    await UserModel.findByIdAndUpdate(userId, { $set: { stripeCustomerId: customerId } });
  }

  const appUrl = config.app.url.replace(/\/$/, "");
  const returnUrl = `${appUrl}/settings?tab=plans`;

  try {
    const sessionParams: Stripe.BillingPortal.SessionCreateParams = {
      customer: customerId,
      return_url: returnUrl,
    };
    if (flow === "payment_method_update") {
      sessionParams.flow_data = {
        type: "payment_method_update",
        after_completion: {
          type: "redirect",
          redirect: { return_url: returnUrl },
        },
      };
    }
    const session = await stripe.billingPortal.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Billing portal failed";
    res.status(500).json({ error: message });
  }
}

/**
 * Stripe webhook handler. Must receive raw body (express.raw) for signature verification.
 * Subscribes to: checkout.session.completed → set user plan to "pro".
 */
export async function stripeWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = config.stripe.webhookSecret;

  if (!sig || !webhookSecret || !stripe) {
    res.status(400).send("Webhook secret or Stripe not configured");
    return;
  }

  const body = req.body as Buffer | string;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    logger.warn("Stripe webhook signature verification failed:", message);
    res.status(400).send(`Webhook Error: ${message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id ?? session.metadata?.userId;
    const workspaceId = session.metadata?.workspaceId;
    const isTopUp = session.metadata?.type === "topup";

    if (!userId) {
      logger.warn("Stripe webhook: checkout.session.completed missing userId");
      res.status(200).send("OK");
      return;
    }

    // One-time top-up for Pro workspace
    if (isTopUp && workspaceId) {
      const credits =
        typeof session.metadata?.credits === "string"
          ? parseInt(session.metadata.credits, 10)
          : 100;
      const safeCredits = Number.isFinite(credits) && credits > 0 ? credits : 100;
      try {
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1); // +12 months from purchase
        await WorkspaceModel.findByIdAndUpdate(workspaceId, {
          $inc: { topUpCreditsBalance: safeCredits },
          $set: { topUpCreditsExpiresAt: expiresAt },
        });
        logger.info("Stripe webhook: workspace top-up added", {
          workspaceId,
          userId,
          credits: safeCredits,
        });
        const amountCents = session.amount_total ?? 0;
        if (amountCents > 0) {
          try {
            const existing = await PaymentModel.findOne({ stripeSessionId: session.id }).lean();
            if (!existing) {
              await PaymentModel.create({
                stripeSessionId: session.id,
                userId,
                workspaceId: workspaceId && mongoose.Types.ObjectId.isValid(workspaceId)
                  ? new mongoose.Types.ObjectId(workspaceId)
                  : undefined,
                priceAmount: amountCents / 100,
                currency: "usd",
                type: "topup",
              });
            }
          } catch (payErr) {
            logger.error("Stripe webhook: failed to record top-up payment", { sessionId: session.id, err: payErr });
          }
        }
      } catch (err) {
        logger.error("Stripe webhook: failed to add top-up", { workspaceId, userId, err });
        res.status(500).send("Internal error");
        return;
      }
      res.status(200).send("OK");
      return;
    }

    const creditsPerMonth =
      typeof session.metadata?.creditsPerMonth === "string"
        ? parseInt(session.metadata.creditsPerMonth, 10)
        : 100;
    const safeCredits = Number.isFinite(creditsPerMonth) && creditsPerMonth > 0
      ? creditsPerMonth
      : 100;

    const subscriptionId = session.subscription
      ? (typeof session.subscription === "string" ? session.subscription : session.subscription.id)
      : undefined;

    try {
      if (workspaceId && subscriptionId) {
        const interval = session.metadata?.interval === "year" ? "year" : "month";
        await WorkspaceModel.findByIdAndUpdate(workspaceId, {
          $set: {
            planStatus: "pro",
            proCreditsPerMonth: safeCredits,
            stripeSubscriptionId: subscriptionId,
            stripeSubscriptionInterval: interval,
          },
        });
        const workspaceName =
          session.metadata?.workspaceName?.trim() ??
          (await WorkspaceModel.findById(workspaceId).select("name").lean())?.name?.trim();
        if (workspaceName && stripe) {
          try {
            await stripe.subscriptions.update(subscriptionId, {
              metadata: {
                workspace_id: workspaceId,
                workspace_name: workspaceName.slice(0, 500),
              },
            });
          } catch (metaErr) {
            logger.error("Stripe webhook: failed to set subscription metadata", {
              subscriptionId,
              err: metaErr,
            });
          }
        }
        logger.info("Stripe webhook: workspace upgraded to Pro", {
          workspaceId,
          userId,
          creditsPerMonth: safeCredits,
        });
      } else {
        await UserModel.findByIdAndUpdate(userId, {
          $set: {
            plan: "pro",
            proCreditsPerMonth: safeCredits,
          },
        });
        logger.info("Stripe webhook: user upgraded to Pro", {
          userId,
          creditsPerMonth: safeCredits,
        });
      }
      const amountCents = session.amount_total ?? 0;
      if (amountCents > 0) {
        try {
          const existing = await PaymentModel.findOne({ stripeSessionId: session.id }).lean();
          if (!existing) {
            await PaymentModel.create({
              stripeSessionId: session.id,
              userId,
              workspaceId: workspaceId && mongoose.Types.ObjectId.isValid(workspaceId)
                ? new mongoose.Types.ObjectId(workspaceId)
                : undefined,
              priceAmount: amountCents / 100,
              currency: "usd",
              type: "subscription",
            });
          }
        } catch (payErr) {
          logger.error("Stripe webhook: failed to record subscription payment", { sessionId: session.id, err: payErr });
        }
      }
    } catch (err) {
      logger.error("Stripe webhook: failed to update plan", { userId, workspaceId, err });
      res.status(500).send("Internal error");
      return;
    }
  }

  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const subscriptionId = subscription.id;
    const interval = subscription.items?.data?.[0]?.plan?.interval;
    const intervalValue = interval === "year" ? "year" : "month";
    try {
      const updated = await WorkspaceModel.findOneAndUpdate(
        { stripeSubscriptionId: subscriptionId },
        { $set: { stripeSubscriptionInterval: intervalValue } }
      );
      if (updated) {
        logger.info("Stripe webhook: synced subscription interval", {
          workspaceId: updated._id,
          interval: intervalValue,
        });
      }
    } catch (err) {
      logger.error("Stripe webhook: failed to sync subscription interval", {
        subscriptionId,
        err,
      });
    }
  }

  res.status(200).send("OK");
}
