import { definePlugin as u, EXTENSION_POINTS as i } from "@gsmflow/plugin-sdk";
const P = u({
  id: "payment-core",
  name: "Payment Core",
  version: "1.0.0",
  permissions: ["db.read", "db.write", "payment.process"],
  setup(e) {
    e.register(i.CHECKOUT.PAYMENT, {
      priority: 1,
      handler: async (t, a) => {
        const r = a;
        switch (r.method) {
          case "balance":
            return await p(t, r);
          case "stripe":
            return await y(t);
          case "paypal":
            return await m(t);
          default:
            throw new Error(`Unsupported payment method: ${r.method}`);
        }
      }
    }), e.register(i.CHECKOUT.METHOD, {
      priority: 1,
      handler: async (t) => ({
        methods: [
          {
            id: "balance",
            name: "Account Balance",
            description: "Pay using your account balance",
            enabled: !0,
            requiresSetup: !1
          },
          {
            id: "stripe",
            name: "Credit Card",
            description: "Pay with credit or debit card",
            enabled: await f(t),
            requiresSetup: !0
          },
          {
            id: "paypal",
            name: "PayPal",
            description: "Pay with PayPal",
            enabled: await b(t),
            requiresSetup: !0
          }
        ]
      })
    }), e.register(i.BILLING.WEBHOOK, {
      priority: 1,
      handler: async (t, a) => {
        const r = a;
        switch (r.provider) {
          case "stripe":
            return await h(t, r);
          case "paypal":
            return await g(t, r);
          default:
            return t.log.warn(`Unknown webhook provider: ${r.provider}`), null;
        }
      }
    }), e.register(i.INVOICE.GENERATOR, {
      priority: 1,
      handler: async (t, a) => await E(t, a)
    }), e.register(i.ADMIN.SIDEBAR_ITEM, {
      priority: 2,
      handler: async (t) => ({
        id: "payments",
        label: "Payments",
        href: "/admin/payments",
        children: [
          {
            id: "payments-transactions",
            label: "Transactions",
            href: "/admin/payments/transactions"
          },
          {
            id: "payments-methods",
            label: "Payment Methods",
            href: "/admin/payments/methods"
          },
          {
            id: "payments-invoices",
            label: "Invoices",
            href: "/admin/payments/invoices"
          }
        ]
      })
    });
  },
  async onInstall(e) {
    if (e.log.info("Payment plugin installed"), e.hasPermission("db.write"))
      try {
        await e.db.execute(
          `INSERT OR IGNORE INTO settings (key, value, created_at, updated_at) 
					 VALUES (?, ?, ?, ?)`,
          [
            "payment_methods",
            JSON.stringify({
              balance: { enabled: !0 },
              stripe: { enabled: !1, publicKey: "", secretKey: "" },
              paypal: { enabled: !1, clientId: "", clientSecret: "" }
            }),
            (/* @__PURE__ */ new Date()).toISOString(),
            (/* @__PURE__ */ new Date()).toISOString()
          ]
        ), e.log.info("Created payment settings");
      } catch (t) {
        e.log.error("Failed to create payment settings", {
          error: t instanceof Error ? t.message : String(t)
        });
      }
  },
  async onEnable(e) {
    e.log.info("Payment plugin enabled");
  },
  async onDisable(e) {
    e.log.info("Payment plugin disabled");
  },
  async onUninstall(e) {
    e.log.info("Payment plugin uninstalled");
  }
});
async function p(e, t) {
  if (!e.user)
    return { success: !1, error: "User not authenticated" };
  if (!e.hasPermission("payment.process"))
    return { success: !1, error: "Permission denied" };
  try {
    const a = await e.db.query(
      "SELECT balance FROM users WHERE id = ? LIMIT 1",
      [e.user.id]
    );
    if (!a[0])
      return { success: !1, error: "User not found" };
    const r = parseFloat(a[0].balance);
    if (r < t.amount)
      return { success: !1, error: "Insufficient balance" };
    await e.db.execute(
      "UPDATE users SET balance = balance - ? WHERE id = ?",
      [t.amount, e.user.id]
    );
    const s = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return await e.db.execute(
      `INSERT INTO balance_transactions 
			 (id, user_id, type, amount, balance_after, description, created_at) 
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        s,
        e.user.id,
        "debit",
        t.amount,
        r - t.amount,
        t.metadata?.description || "Payment",
        (/* @__PURE__ */ new Date()).toISOString()
      ]
    ), e.log.info("Balance payment processed", {
      userId: e.user.id,
      amount: t.amount,
      transactionId: s
    }), { success: !0, transactionId: s };
  } catch (a) {
    return e.log.error("Balance payment failed", {
      error: a instanceof Error ? a.message : String(a)
    }), { success: !1, error: "Payment processing failed" };
  }
}
async function y(e, t) {
  return e.log.warn("Stripe payment not yet implemented"), { success: !1, error: "Stripe payment not configured" };
}
async function m(e, t) {
  return e.log.warn("PayPal payment not yet implemented"), { success: !1, error: "PayPal payment not configured" };
}
async function f(e) {
  if (!e.hasPermission("db.read"))
    return !1;
  try {
    const t = await e.db.query(
      "SELECT value FROM settings WHERE key = 'payment_methods' LIMIT 1"
    );
    return t[0] ? JSON.parse(t[0].value).stripe?.enabled === !0 : !1;
  } catch {
    return !1;
  }
}
async function b(e) {
  if (!e.hasPermission("db.read"))
    return !1;
  try {
    const t = await e.db.query(
      "SELECT value FROM settings WHERE key = 'payment_methods' LIMIT 1"
    );
    return t[0] ? JSON.parse(t[0].value).paypal?.enabled === !0 : !1;
  } catch {
    return !1;
  }
}
async function h(e, t) {
  return e.log.info("Stripe webhook received", { event: t.event }), { success: !0 };
}
async function g(e, t) {
  return e.log.info("PayPal webhook received", { event: t.event }), { success: !0 };
}
async function E(e, t) {
  if (!e.hasPermission("db.read"))
    return { success: !1, error: "Permission denied" };
  try {
    const a = await e.db.query(
      "SELECT email FROM users WHERE id = ? LIMIT 1",
      [t.userId]
    );
    if (!a[0])
      return { success: !1, error: "User not found" };
    const r = t.items.reduce((n, o) => n + o.price * o.quantity, 0), s = r * 0.1, d = r + s, l = `
			<!DOCTYPE html>
			<html>
			<head>
				<title>Invoice #${t.orderId}</title>
				<style>
					body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
					.header { text-align: center; margin-bottom: 40px; }
					.invoice-details { margin-bottom: 20px; }
					table { width: 100%; border-collapse: collapse; }
					th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
					.total { font-weight: bold; font-size: 1.2em; }
				</style>
			</head>
			<body>
				<div class="header">
					<h1>Invoice</h1>
					<p>Order #${t.orderId}</p>
				</div>
				<div class="invoice-details">
					<p><strong>Bill To:</strong> ${a[0].email}</p>
					<p><strong>Date:</strong> ${(/* @__PURE__ */ new Date()).toLocaleDateString()}</p>
				</div>
				<table>
					<thead>
						<tr>
							<th>Item</th>
							<th>Quantity</th>
							<th>Price</th>
							<th>Total</th>
						</tr>
					</thead>
					<tbody>
						${t.items.map(
      (n) => `
							<tr>
								<td>${n.name}</td>
								<td>${n.quantity}</td>
								<td>${n.price.toFixed(2)}</td>
								<td>${(n.price * n.quantity).toFixed(2)}</td>
							</tr>
						`
    ).join("")}
					</tbody>
					<tfoot>
						<tr>
							<td colspan="3">Subtotal</td>
							<td>${r.toFixed(2)}</td>
						</tr>
						<tr>
							<td colspan="3">Tax (10%)</td>
							<td>${s.toFixed(2)}</td>
						</tr>
						<tr class="total">
							<td colspan="3">Total</td>
							<td>${d.toFixed(2)}</td>
						</tr>
					</tfoot>
				</table>
			</body>
			</html>
		`, c = `invoice_${t.orderId}`;
    return await e.kv.set(c, l, 86400 * 30), e.log.info("Invoice generated", { orderId: t.orderId }), {
      success: !0,
      invoiceUrl: `/api/invoices/${t.orderId}`
    };
  } catch (a) {
    return e.log.error("Invoice generation failed", {
      error: a instanceof Error ? a.message : String(a)
    }), { success: !1, error: "Invoice generation failed" };
  }
}
export {
  P as default
};
//# sourceMappingURL=index.js.map
