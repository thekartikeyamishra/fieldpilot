process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.AUTH_SECRET ??= "test-secret-that-is-definitely-long-enough-32";
process.env.RAZORPAY_WEBHOOK_SECRET ??= "test-webhook-secret";
process.env.PAYMENTS_PROVIDER ??= "mock";
