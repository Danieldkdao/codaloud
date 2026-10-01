# Codaloud pricing proposal for review

**Prepared and approved 2026-09-29.** The eight USD prices are now applied to RevenueCat Test Store products, both RevenueCat paywalls are published, and the app usage meter implements the approved rates. Apple and Google store prices remain pending their store credentials and product setup; see [RevenueCat setup](./revenuecat-setup.md). This model uses public list prices, not actual Codaloud invoices or customer behavior. [Vendor source notes](./market-pricing-sources.md) record first-party list prices and open measurement questions. The [Codaloud product specification](https://app.notion.com/p/3d2b3d6d3d6f809b9c82e98a68e01be1) fixes 50 Free, 200 Tier 1, and 1,000 Tier 2 monthly credits; two paid tiers with the same features; monthly/yearly subscriptions; and 100/200/500/1,000-credit packs.

## Recommendation

Use one internal credit as a **metering unit**, with an upper planning budget of **$0.01 in marginal vendor cost per credit**. It is not a stored dollar balance. Charge by measured units where possible, round to whole credits, and absorb only bounded canceled or failed work. Use a $0.008/credit target in production telemetry to leave a 20% cost buffer against the $0.01 ceiling. A 50-credit Free account therefore carries up to $0.50 of variable-cost exposure per monthly cycle; the three-day 200-credit trial carries up to $2.00 per trial account. This exposure makes abuse protection and a spend checkpoint essential.

### Retail prices to approve

| Plan | Included credits | Proposed USD price | Effective monthly price | Notes |
| --- | ---: | ---: | ---: | --- |
| Free | 50/month | $0 | $0 | Local editing, local Git, and projects remain free. Online AI/voice consumes the allowance. No top-ups. |
| Tier 1 monthly | 200/month | **$14.99/month** | $14.99 | Paid sandbox/terminal and model picker. |
| Tier 1 yearly | 200 each month | **$149.99/year** | $12.50 | 16.6% less than 12 monthly payments; credits still refresh monthly. |
| Tier 2 monthly | 1,000/month | **$39.99/month** | $39.99 | Same features, larger monthly allowance. |
| Tier 2 yearly | 1,000 each month | **$399.99/year** | $33.33 | 16.6% less than 12 monthly payments; credits still refresh monthly. |

| Top-up pack (paid subscribers only) | Proposed USD price | Price per credit | Why this size |
| ---: | ---: | ---: | --- |
| 100 | **$4.99** | 4.99¢ | Smallest fixed pack. |
| 200 | **$8.99** | 4.50¢ | 10% cheaper per credit than 100. |
| 500 | **$19.99** | 4.00¢ | 20% cheaper per credit than 100. |
| 1,000 | **$34.99** | 3.50¢ | 30% cheaper per credit than 100. |

The plan price pays for paid feature access, infrastructure, and the monthly credit allowance. Top-up credits persist after cancellation as the spec requires, so they cost more per credit than Tier 2's monthly allowance. Tier 1 plus the cheapest 800-credit combination is $48.96/month, above Tier 2's $39.99; this avoids making the larger plan an obviously worse buy. The requested arbitrary 10–10,000-credit custom pack needs a separate store-approved product design: the present app and RevenueCat catalog only implement four fixed SKUs. Do not advertise arbitrary packs yet.

**Market context.** The proposed $14.99 entry tier sits between [GitHub Copilot Pro's $10/month](https://github.com/features/copilot/plans) and [Cursor Pro's $20/month](https://prod.cursor.com/help/account-and-billing/pricing). The $39.99 higher tier is close to [Copilot Pro+'s $39/month](https://github.com/features/copilot/plans) and below [Cursor Pro+'s $60/month](https://prod.cursor.com/help/account-and-billing/pricing). [Replit Core's monthly price is $20, or $18/month when billed annually](https://replit.com/pricing). These are product-positioning anchors, not proof of demand or of a comparable feature set. Test willingness to pay with users before shipping.

### Suggested credit deductions

The amounts below cover Codaloud's current billable paths. For AI token generation and Trigger compute, debit `max(action minimum, ceil(actual attributable cost / $0.008))` credits **after a usable result**; charge at checkpoints for work that continues. Add the separate voice, web, and sandbox units listed below only when those resources are used. Do not count the same vendor cost twice. The examples use conservative public list rates, not observed Codaloud usage. The action minimum covers setup, rounding, and unmetered transport. Show the completed action and credits spent in the ledger. Never let balance become negative.

| User action | Proposed deduction | Vendor cost driver and example |
| --- | --- | --- |
| Manual editing, local Git, project browsing, local parsing | **0** | On-device work; no per-action vendor charge. GitHub account linking and ordinary repository API use have no priced request in this model. |
| Brief AI answer or code explanation | **1-credit minimum**; typically **1–2** | GPT-5.4 Mini at [$0.75/M input, $4.50/M output](https://openrouter.ai/openai/gpt-5.4-mini). Example: 10k input + 1k output ≈ **1.2¢ vendor cost**, so **2 credits** at the $0.008 target. |
| Inline edit suggestion | **2-credit minimum**; typically **2–5** | Same model. Example: 10k input + 2k output ≈ **1.65¢**, so **3 credits** at the $0.008 target. Only debit when an actionable result is delivered. Intent classification is bundled with the parent request. |
| Background agent task | **2-credit minimum**, then measured usage; working estimate **2–10**, with a hard per-task budget | DeepSeek V4.1 Flash token usage, Trigger compute, and any Firecrawl calls. The current task can run up to 25 model steps, so never price it as a single completion. DeepSeek's public input rate varied between page/index snapshots; budget at least [$0.05/M input and $0.60/M output](https://openrouter.ai/deepseek/deepseek-v4.1-flash) and meter actual provider cost. |
| Voice listening and realtime transport | **3 credits per started minute** while microphone/agent are connected | Conservative regular Deepgram Nova-3 English streaming **$0.0077/min**, plus LiveKit agent and participant-minute overage up to roughly **$0.011/min** under the Ship public rates: about **1.9¢/min** before generated speech or model tokens. [Deepgram](https://deepgram.com/pricing), [LiveKit](https://livekit.com/pricing). |
| Spoken response or read-aloud explanation | **1 credit per started 150 characters** of synthesized text | Budget ElevenLabs Flash at **$0.05/1k characters** although its live API page displayed $0.04 on retrieval; 150 characters cost at most **0.75¢** at the budget rate. [ElevenAPI](https://elevenlabs.io/pricing/api). Do not synthesize or charge when speech is disabled. |
| Voice reply or voice-triggered quick edit | Voice-minute and speech deductions **plus the measured model cost** (1-credit minimum for a usable model reply) | A one-minute session with 400 spoken characters and one low-cost model reply is roughly **7 credits**: 3 for connection, 3 for TTS, 1 for the model. Longer speech or GPT-5.4 Mini editing costs more. |
| Web search in an agent task | **2 credits per search** in addition to model cost | Firecrawl search costs **2 Firecrawl credits** even with Codaloud's 3-result limit. Hobby PAYG-equivalent $5/1,000 credits puts one search around **1¢**; 2 Codaloud credits leave room for rate changes and overhead. [Firecrawl](https://www.firecrawl.dev/pricing). |
| Scrape one page in an agent task | **1 credit per page** in addition to model cost | Basic Firecrawl scrape costs **1 Firecrawl credit**, about **0.5¢** at Hobby PAYG equivalent. [Firecrawl](https://www.firecrawl.dev/pricing). |
| Paid terminal / sandbox | **2 credits to start**, then **1 credit per started 3 minutes** of bounded active compute | At an **assumed 2 vCPU / 4 GiB** reservation, Daytona list rates imply **$0.1656/hour** before disk, versus 20 credits/hour. This rate is contingent on explicitly pinning resources and reducing idle auto-stop from the current 30 minutes to about 5 minutes. Include agent-triggered sandbox runs in the same meter. [Daytona pricing](https://www.daytona.io/pricing). |

The fixed voice and terminal figures are proposed user-facing rates. Before implementation, instrument actual charges and adjust the per-action meter if a provider changes price or a larger resource/model is selected. Do not separately debit a model classification that is part of one user request. Do not charge canceled speech with no submitted/returned result or a Codaloud-side failure without a usable result, as the product spec requires. Limit costly work before it exceeds the available balance.

**What an allowance feels like:** At the illustrative 7 credits for one minute of spoken voice, 200 credits cover about **28 minutes** and 1,000 cover about **142 minutes** if the user spends the entire allowance on that activity. With speech disabled and roughly 3 credits per listening minute plus model usage, the allowance lasts longer. This is an estimate, not a promised time quota: answer length, edit model, task steps, and speech settings change the debit. Review this experience with users before approval; 200 credits may feel small for a voice-first product even when the unit economics are positive.

## What currently costs Codaloud money

| Category | Current code path | Cost and status |
| --- | --- | --- |
| OpenRouter AI | Quick edit, explanation, voice replies, agent tasks, intent classification | Metered tokens per provider/model; current IDs are DeepSeek V4.1 Flash, GPT-5.4 Mini, and Jev 1.13. Jev is [$0.042/M input tokens](https://openrouter.ai/typesafe/jev-1.13), usually negligible beside speech/edits. OpenRouter's [Standard platform fee is 5.5%](https://openrouter.ai/pricing/); verify whether the account's usage-cost reporting includes this fee before adding it in the ledger. |
| Deepgram + ElevenLabs + LiveKit | Realtime voice and spoken explanations | Audio minutes, generated characters, agent session/connection minutes; [LiveKit Ship starts at $50/month and includes 5,000 agent minutes](https://livekit.com/pricing). Pay the fixed plan once, not once per user action. Direct provider keys mean Deepgram/ElevenLabs are separate bills. |
| Daytona | Terminal and execution sandbox | Reserved CPU, RAM, disk while started; disk can continue while stopped before archive. [State billing](https://www.daytona.io/docs/billing). The app pins new sandboxes to 2 vCPU/4 GiB and a five-minute auto-stop, checks paid access, and meters start and connected compute time. |
| Firecrawl | Agent web search and one-page scrape | Search/scrape credits; [Hobby costs $19/month monthly or $16/month billed yearly for 5,000 credits](https://www.firecrawl.dev/pricing). |
| Trigger.dev | Durable background agent tasks | [Small 1x: $0.0000338/executing second plus $0.000025/run](https://trigger.dev/pricing); plan fees include usage credits. |
| Neon, API hosting, terminal gateway | Identity, billing ledger, service endpoints | Neon compute/storage and hosting are shared overhead, not an editor-action rate. [Neon lists Launch compute at $0.106/CU-hour](https://neon.com/blog/major-compute-price-reduction-on-neon); actual plan/hosting bill is unknown. |
| RevenueCat + stores | Subscription and top-up checkout | [RevenueCat is free below $2,500 monthly tracked revenue, then 1% of the full month's MTR](https://www.revenuecat.com/pricing). [Apple standard commission is 30%, with qualifying 15% cases](https://developer.apple.com/programs/whats-included/). [Google's fee varies by product, region, and install date](https://support.google.com/googleplay/android-developer/answer/112622?hl=en-GB). Apple Developer membership is $99/year. |

No account invoices, usage exports, signed vendor contracts, or production hosting bill were available. The code proves integrations and request paths, **not** that each vendor account is currently on a paid plan or that users have generated billable traffic. Dev Tunnels provide development forwarding; local Git/editor operations have no listed per-action cloud cost. Do not attribute a project-wide subscription fee to each action.

## Profitability stress test

Assume **30% store commission + 1% RevenueCat fee on gross retail** even though the latter is currently free below its revenue threshold, and suppose each granted/purchased credit is fully consumed at the **$0.01 vendor-cost ceiling**. Ignore unused credits. The remainder is **contribution before** LiveKit/Firecrawl/Trigger/Neon/API fixed fees, sandbox idle storage, tax, refunds, support, and marketing. Actual net profit is lower. Annual subscriptions grant the listed credits each month, so the comparison amortizes the annual receipt over 12 months.

| Purchase | Retail per month or pack | After 31% deductions | Max variable cost | Remaining contribution |
| --- | ---: | ---: | ---: | ---: |
| Tier 1 monthly | $14.99 | $10.34 | $2.00 | **$8.34** |
| Tier 1 yearly, per month | $12.50 | $8.62 | $2.00 | **$6.62** |
| Tier 2 monthly | $39.99 | $27.59 | $10.00 | **$17.59** |
| Tier 2 yearly, per month | $33.33 | $23.00 | $10.00 | **$13.00** |
| 100-credit pack | $4.99 | $3.44 | $1.00 | **$2.44** |
| 200-credit pack | $8.99 | $6.20 | $2.00 | **$4.20** |
| 500-credit pack | $19.99 | $13.79 | $5.00 | **$8.79** |
| 1,000-credit pack | $34.99 | $24.14 | $10.00 | **$14.14** |

At these conservative ceilings, ten fully consuming Tier 1 monthly customers contribute about **$83.40/month** before fixed fees. Five Tier 2 monthly customers contribute about **$87.95/month**. For scale, LiveKit Ship $50 + Trigger Hobby $10 + Firecrawl Hobby $19 alone total **$79/month** if those paid plans are used; hosting, Neon paid usage, and the $99/year Apple membership add more. A small customer base may therefore lose money despite positive per-customer contribution. Free and trial usage must be included in this break-even calculation. [LiveKit](https://livekit.com/pricing), [Trigger.dev](https://trigger.dev/pricing), [Firecrawl](https://www.firecrawl.dev/pricing), [Apple](https://developer.apple.com/support/compare-memberships/).

## Launch verification checklist

1. Capture p50/p90/p99 production usage for model tokens, generated speech characters, audio/agent/connection minutes, search/scrape calls, Trigger billable seconds, and Daytona resource-hours. The app requests OpenRouter per-response cost accounting and caps provider token prices; compare reported costs with real account invoices and platform mix. The [DeepSeek model page](https://openrouter.ai/deepseek/deepseek-v4.1-flash) lists provider endpoints materially above the headline rate. Do not claim guaranteed profitability from public rates.
2. Confirm atomic, idempotent debit and mid-task checkpoints under concurrent production traffic. The implementation now calls `chargeCredits` for billable actions and gates the terminal by tier and balance. Verify server capacity limits and the paid-only sandbox entitlement in deployed environments. Keep local work available when balance is zero.
3. Measure actual Daytona size, idle auto-stop, concurrent/warm sandboxes, and stopped-disk costs. New sandboxes use 2 vCPU/4 GiB, and the app shortens idle auto-stop to five minutes. Bound task steps and model spend before dispatch; stop at zero balance and return allowed partial results.
4. Test Store demo prices and both paywalls are configured and published. Real Apple/Google checkout still requires store credentials, corresponding store prices, and end-to-end sandbox tests before launch.
5. Confirm the store's actual upgrade/downgrade/proration behavior against the product spec. A backend promise to charge an exact price difference or set a new billing date cannot override a store-controlled transaction.

Approval of this proposal should specify whether the **$14.99/$39.99 monthly plans, $149.99/$399.99 annual plans, four pack prices, and action meter** are acceptable. After approval, implement usage metering and revenue safeguards, configure Test Store/demo prices, then configure and test real store products before publishing paywalls. Do not publish unapproved prices or enable paid checkout merely because a Test Store simulation succeeds.
