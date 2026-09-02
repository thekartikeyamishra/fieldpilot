import { config } from "dotenv";

/**
 * Next.js loads .env.local automatically; standalone scripts and drizzle-kit do
 * not. Without this, `npm run db:push` fails with "connection url required"
 * even though setup.ps1 just wrote a perfectly good .env.local.
 *
 * dotenv never overwrites a variable that is already set, so precedence is:
 *   real environment  >  .env.local  >  .env
 */
config({ path: ".env.local" });
config({ path: ".env" });
