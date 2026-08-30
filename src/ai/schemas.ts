import { z } from "zod";

/**
 * The only shape the system will accept from a model. Free-form text never
 * drives a side effect; anything that fails this schema is repaired once and
 * then discarded in favour of the deterministic fallback.
 */

export const proposalSchema = z.object({
  tool: z.enum(["create_work_order", "update_work_order", "record_measurement", "create_incident"]),
  summary: z.string().min(3).max(160),
  args: z.record(z.unknown()),
});

export const agentTurnSchema = z.object({
  /** Read aloud. Short: this is spoken to someone holding a wrench. */
  spoken: z.string().min(1).max(400),
  understanding: z.object({
    problem: z.string().max(200).nullable(),
    missing: z.array(z.string().max(80)).max(3).default([]),
  }),
  recommendation: z
    .object({
      text: z.string().max(300),
      confidence: z.enum(["low", "medium", "high"]),
    })
    .nullable()
    .default(null),
  /** Must be refs the server minted (E1, E2 ...). Unknown refs are dropped. */
  evidenceRefs: z.array(z.string().max(8)).max(6).default([]),
  question: z.string().max(200).nullable().default(null),
  proposal: proposalSchema.nullable().default(null),
});

export type AgentTurn = z.infer<typeof agentTurnSchema>;
export type Proposal = z.infer<typeof proposalSchema>;

export const AGENT_JSON_SHAPE = `{
  "spoken": string,
  "understanding": { "problem": string|null, "missing": string[] },
  "recommendation": { "text": string, "confidence": "low"|"medium"|"high" } | null,
  "evidenceRefs": string[],
  "question": string|null,
  "proposal": { "tool": "create_work_order"|"update_work_order"|"record_measurement"|"create_incident", "summary": string, "args": object } | null
}`;
