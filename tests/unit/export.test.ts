import { describe, expect, it } from "vitest";
import { EXPORT_ENTITIES, assertIdentifier } from "@/server/export/stream";

describe("export safety", () => {
  it("refuses any identifier that is not a plain table or column name", () => {
    for (const hostile of ["users; drop table users", "users--", "*", "users where 1=1", "USERS", ""]) {
      expect(() => assertIdentifier(hostile), hostile).toThrow();
    }
  });

  it("never exports a password hash or any secret column", () => {
    const forbidden = ["password_hash", "passwordhash", "idempotency_key", "provider_payment_id", "api_key", "secret"];
    for (const spec of EXPORT_ENTITIES) {
      for (const column of spec.columns) {
        expect(forbidden, `${spec.table}.${column}`).not.toContain(column);
      }
    }
  });

  it("selects explicit columns rather than everything", () => {
    for (const spec of EXPORT_ENTITIES) {
      expect(spec.columns.length).toBeGreaterThan(0);
      expect(spec.columns).not.toContain("*");
    }
  });

  it("orders every entity by a column it actually selects, so paging is stable", () => {
    for (const spec of EXPORT_ENTITIES) {
      expect(spec.columns, spec.table).toContain("id");
    }
  });

  it("covers the tenant's full record, not a convenient subset", () => {
    const names = EXPORT_ENTITIES.map((e) => e.name);
    for (const required of ["assets", "incidents", "work_orders", "outcomes", "conversation_events", "audit_events"]) {
      expect(names).toContain(required);
    }
  });
});
