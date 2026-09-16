"use client";

import { useState } from "react";
import { Button, Tag } from "./ui";

type Pack = { sku: string; label: string; credits: number; amountMinor: number; currency: string };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const format = (amountMinor: number, currency: string) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);

/**
 * Credit purchase. The browser sends only a sku — it never sends a price, and
 * it never grants a credit. Success here just refreshes the balance; the actual
 * grant happens server-side when the provider's signed webhook arrives.
 */
export default function BuyCredits({
  packs,
  enabled,
  intlPacks = [],
}: {
  packs: Pack[];
  enabled: boolean;
  intlPacks?: Pack[];
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Currency is the buyer's explicit choice, not a guess from their IP. Getting
  // it wrong means charging the wrong amount in the wrong currency.
  const [intl, setIntl] = useState(false);
  const shown = intl && intlPacks.length ? intlPacks : packs;
  const currency = shown[0]?.currency ?? "INR";

  const buy = async (sku: string) => {
    setBusy(sku);
    setNotice(null);

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, currency }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setNotice(json?.error?.message ?? "Couldn't start checkout. You have not been charged.");
        return;
      }

      const checkout = json.data as {
        orderId: string; amountMinor: number; currency: string;
        publicKey: string; provider: string; credits: number; autoFulfilled: boolean;
        checkoutUrl?: string;
      };

      // Development provider: no money moves, credits are already granted.
      if (checkout.autoFulfilled) {
        setNotice(`${checkout.credits} credits added (test mode — no payment was taken).`);
        setTimeout(() => window.location.reload(), 900);
        return;
      }

      // Redirect-style providers (Square) hand back a hosted page. Nothing is
      // granted here either — the signed webhook is still the only thing that
      // creates credits.
      if (checkout.checkoutUrl) {
        window.location.href = checkout.checkoutUrl;
        return;
      }

      const loaded = await loadRazorpay();
      if (!loaded || !window.Razorpay) {
        setNotice("Couldn't load the payment window. You have not been charged.");
        return;
      }

      const checkoutWindow = new window.Razorpay({
        key: checkout.publicKey,
        order_id: checkout.orderId,
        amount: checkout.amountMinor,
        currency: checkout.currency,
        name: "FieldPilot",
        description: `${checkout.credits} credits`,
        theme: { color: "#0f6fb8" },
        handler: () => {
          // Confirmation, not authorisation. The webhook does the granting.
          setNotice("Payment received. Your credits appear as soon as it settles.");
          setTimeout(() => window.location.reload(), 2500);
        },
        modal: {
          ondismiss: () => setNotice("Checkout closed. Nothing was charged."),
        },
      });

      checkoutWindow.open();
    } catch {
      setNotice("Something went wrong before payment. You have not been charged.");
    } finally {
      setBusy(null);
    }
  };

  if (!enabled) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Credit purchase is switched off in this environment. Set a payment provider in the
        environment to enable it.
      </p>
    );
  }

  const toggle = intlPacks.length ? (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      {[
        { on: false, label: "India (INR)" },
        { on: true, label: "International" },
      ].map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => setIntl(option.on)}
          className="tag"
          style={{
            cursor: "pointer",
            borderColor: intl === option.on ? "var(--signal)" : undefined,
            color: intl === option.on ? "var(--signal)" : undefined,
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      {toggle}
      <div className="grid gap-3 sm:grid-cols-3">
        {shown.map((pack) => (
          <div key={pack.sku} className="panel flex flex-col gap-2 p-4">
            <p className="data text-lg font-semibold">{pack.credits.toLocaleString()}</p>
            <p className="legend">credits</p>
            <p className="data text-sm">{format(pack.amountMinor, pack.currency)}</p>
            <p className="data text-[11px] text-[var(--muted)]">
              {format(Math.round(pack.amountMinor / pack.credits), pack.currency)} each
            </p>
            <Button
              className="mt-1"
              variant={pack.sku === "credits_400" ? "primary" : "secondary"}
              disabled={busy !== null}
              onClick={() => void buy(pack.sku)}
            >
              {busy === pack.sku ? "Opening…" : "Buy"}
            </Button>
          </div>
        ))}
      </div>

      {notice ? <p className="panel p-3 text-sm">{notice}</p> : null}

      <p className="text-xs text-[var(--muted)]">
        Credits never expire and are consumed only when a question needs a paid model.{" "}
        <Tag>no auto-renewal</Tag>
      </p>
    </div>
  );
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
