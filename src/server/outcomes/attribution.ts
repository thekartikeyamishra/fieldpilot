/**
 * Value attribution constants. Pure, published and deliberately conservative —
 * the number a customer sees has to survive being questioned.
 */

/** Minutes a technician would otherwise spend walking to a terminal and typing. */
export const TIME_SAVED_MINUTES: Record<string, number> = {
  create_work_order: 14,
  create_incident: 9,
  update_work_order: 4,
  record_measurement: 3,
};

export const ATTRIBUTION_BASIS =
  "Estimated from the manual alternative: stop work, walk to a terminal, locate the asset, read history, type the record. Deliberately conservative.";
