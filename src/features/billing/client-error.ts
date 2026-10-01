export const billingRequiredMessage =
  "You need more credits. Open Settings → Plan and credits to upgrade or add credits.";

export class BillingRequiredError extends Error {
  constructor() {
    super(billingRequiredMessage);
  }
}
