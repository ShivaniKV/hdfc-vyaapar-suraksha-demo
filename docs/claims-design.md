# Claims and policyholder support: design

Status: built and live on 2 Nov 2026 (Cloudflare version 5b3e5432). Demo: tomorrow (3 Nov 2026). Channel: web chat only. Data: made up, reset to the same starting records every time.

## 1. Goal

One web chat that serves two kinds of people:

| Who | What they want | What the bot does |
|---|---|---|
| Wants a policy | "I run a bakery, what insurance do I need?" | Today's flow: plain explanation, then the Apply tab or the blank form |
| Has a policy, something happened | "My shop caught fire, what do I do?" | Safety first, verify them, guide them, check eligibility, register the claim |
| Has a policy, has a question | "Am I covered for flood?" / "What's my claim status?" | Verify them, answer about *their* policy or claim |

The customer never needs policy words. The bot asks in plain language and explains any technical word in one line.

## 2. The rule that keeps this safe

**Code decides, the AI explains, HDFC ERGO makes the final decision.**

- Eligibility comes from fixed rules in our server, never from the AI's judgement.
- The bot only ever says **"likely covered"** or **"likely not covered"**, followed by "HDFC ERGO's surveyor makes the final decision."
- Never: approved, rejected, guaranteed, "you will get ₹…".
- Everyone can register a claim, even when it looks not covered. Reporting a loss is the customer's right; the decision comes after the survey.

## 3. How the pieces fit

```
Customer ── web chat (Perfox) ──► AI Agent ──► our tools (MCP server) ──► demo database
                                      │                                      ▲
                                      └── knowledge base (4 policy docs)    │
Demo page ── Apply tab · Policy Guide · "Try as" panel · HDFC ERGO Desk tab ───┘
```

- **Perfox** holds the conversation, as today.
- **Our MCP server** is a new piece of the same Cloudflare Worker that hosts the demo page (`/mcp`). Perfox calls it as tools. It holds the fake customers, the rules and the claims. Business rules live here, not in the prompt, which keeps the prompt small and cost down.
- **Database:** one Cloudflare Durable Object (small built-in storage, free tier). Reset empties it; the seed customers live in the code.
- **Demo page** gets two additions: a "Try as" panel and an "HDFC ERGO Desk" tab.

## 4. Demo customers (seed data)

Test OTP for everyone: **123456** (shown on the "Try as" panel).

| | Ramesh Jain | Sunita Sharma | Imran Khan | Priya Nair |
|---|---|---|---|---|
| Business | Jewellery shop, Jaipur | Kirana store, Patna | Electronics shop, Pune | New bakery, Kochi |
| Policy no. | VS-2026-10001 | VS-2026-10002 | VS-2025-10003 | none |
| Mobile | 98290 00001 | 98350 00002 | 98220 00003 | n/a |
| Period | 1 Apr 2026 – 31 Mar 2027 | 1 Jun 2026 – 31 May 2027 | 1 Oct 2025 – 30 Sep 2026 (**expired**) | n/a |
| Section I kind | All Risk | Named Perils, **no** storm and flood add-on | Named Perils | n/a |
| Sections | I, II (jewellery **specifically insured**), XI | I, II | I, II, IV | n/a |
| Sum insured (Section I) | ₹40,00,000 | ₹8,00,000 | ₹15,00,000 | n/a |
| Story | Break-in last night, jewellery stolen | Heavy rain, water entered the shop, stock spoiled | Fire in the godown | Wants to buy a policy |
| Expected result | **Likely covered**, claim registered, status updated from the HDFC ERGO Desk | **Likely not covered** (flood needs the add-on under Named Perils, Policy Wordings page 4), claim still registered with the reason shown | **Likely not covered** (policy expired on 30 Sep 2026), contacts and renewal info | Today's apply flow |

## 5. Eligibility rules (in code, in this order)

Each rule returns a plain reason and a page to cite.

| # | Check | Fails when | Source |
|---|---|---|---|
| 1 | Policy active on incident date | Incident date outside the policy period | Policy schedule |
| 2 | Event covered by their Section I kind | Flood, storm or earthquake under Named Perils without that add-on | Policy Wordings page 4 |
| 3 | Section taken | Event needs a section they don't have (e.g. cash theft without Section XI) | Policy schedule |
| 4 | Section exclusions | Jewellery or gold under Section II not specifically insured | Policy Wordings page 26 |
| 5 | Premises occupied | Empty for more than 30 days without approval | Policy Wordings page 5 |
| 6 | Reported on time | Incident noticed more than 30 days ago (claim form deadline) | Policy Wordings page 104 |
| 7 | Sum insured | Loss above sum insured, or property worth more than the sum insured by over 15% (customer bears a share) | Policy Wordings pages 14–15 |

Rule 7 never fails a claim; it adds a note that the payout may be reduced.

Result: `likely_covered`, `likely_not_covered` or `needs_review`, plus the list of reasons.

## 6. Tools the agent gets (MCP server)

| Tool | When the agent calls it | Returns |
|---|---|---|
| `start_verification(policy_number, mobile)` | Customer says they have a policy and wants help with it | "OTP sent" if the pair matches, otherwise "not found" (never says which part was wrong) |
| `verify_otp(otp)` | Customer gives the OTP | Verified, with first name and business. Stored against this conversation (Perfox sends `X-Sa-Conversation-Id`) |
| `get_my_policy()` | Any question about their own cover | Their policy summary. Refuses unless this conversation is verified |
| `check_claim(event, incident_date, items, estimated_loss)` | After the customer describes what happened | Likely result, reasons with pages, documents needed, deadline |
| `register_claim(...same fields..., description)` | After the customer confirms the summary | Claim reference, e.g. `CLM-2026-0412` |
| `get_claim_status(claim_reference?)` | "What's my claim status?" | Current stage and what happens next |
| `request_callback(reason)` | Customer asks for a person | Callback reference; appears on the HDFC ERGO Desk |

All tools refuse to show policy data until `verify_otp` succeeds in the same conversation.

## 7. Conversation flow (policyholder with a loss)

1. **Safety first.** "Is everyone safe? If there's fire, call the fire brigade on 101; for theft, the police on 112."
2. **Has a policy?** If it isn't obvious: "Do you already have a Vyaapar Suraksha policy with HDFC ERGO?"
3. **Verify.** Policy number and registered mobile, then the OTP.
4. **What happened, in plain words.** What, when, where, what was damaged or lost, a rough value. One or two questions per message.
5. **Check.** `check_claim`, then explain the result kindly in their language, with the page.
6. **What to do now** (Policy Wordings pages 103–104):
   - Tell HDFC ERGO immediately (this registration counts as telling them in the demo).
   - Fire, explosion or lightning: fire brigade and police. Riot, malicious damage, impact damage: police. Landslide: District Administration.
   - Don't throw away or sell damaged items, don't clean up, and don't repair unless it's urgent, until the surveyor has inspected.
   - Take photos. Keep bills, invoices and stock records.
   - Submit the claim form within 30 days.
7. **Confirm and register.** Read back a short summary, ask "Shall I register this?", then `register_claim` and give the reference.
8. **Next steps.** "A surveyor will contact you. You can ask me 'What's my claim status?' any time."

## 8. Demo page additions

**"Try as" panel** (beside the chat): four cards (Ramesh, Sunita, Imran, Priya), each showing the policy number, mobile, OTP, and a one-tap starting message such as "Someone broke into my shop last night".

**"HDFC ERGO Desk" tab**: the insurer's side, where the presenter plays the HDFC ERGO officer.
- Table of registered claims: reference, customer, event, likely result with reasons, time.
- Status buttons: Registered → Surveyor assigned → Under review → Settled. The chat's status answer follows these.
- Callback requests listed separately.
- No real HDFC ERGO person is needed during the demo.

**Reset** clears all claims and callbacks and reloads the seed customers.

## 9. Prompt changes (chat, Common tab)

Small additions only; the rules live in the tools. About +1,500 characters (chat limit is 24,000).

- Replace "You cannot see any customer's policy, claim or payments; give the contacts." with: verify first through the tools; never show policy details before verification.
- New "## Something happened" section: safety line; ask if they have a policy; plain words; use `check_claim`; only "likely covered / likely not covered" with "HDFC ERGO's surveyor makes the final decision"; confirm before `register_claim`; the what-to-do-now steps.
- Change "Nothing is stored" to apply only to the proposal form. Claims are stored (made-up data in the demo).
- Explain any technical word in one line when used.

The voice prompt is unchanged (web chat only for now).

## 10. Order of work, with a cut line for tomorrow

**Must have for the demo**
1. Storage with seed data and reset.
2. MCP server on the Worker: the 7 tools and the rules.
3. Register it in Perfox (Integrations → MCP server) and add it to the agent.
4. Prompt additions; you paste the full prompt.
5. "Try as" panel and HDFC ERGO Desk tab with status buttons.
6. Test all four customers end to end, plus English, Hinglish and Hindi.
7. Update the playbook demo script and push to GitHub.

**Nice to have, after the demo**
- Perfox "authenticated" stamp through the auth callback (shows the verified customer in Perfox's own screens).
- Document upload for photos (Perfox Document Processing).
- WhatsApp and phone versions.

## 11. Risks

- **Time.** Building and testing in one day is tight. If short on time, drop the status buttons first, then the "Try as" one-tap messages.
- **AI wording drift.** The bot might still say "approved". The tool returns exact wording to use, and we test for it.
- **Tool calls add cost and time.** About 1–3 extra tool calls per claim conversation. Knowledge search stays as now.
- **Rollback.** `Baseline 2026-10-29.zip` and Cloudflare version fce85116 restore today's working demo.

## 12. Still to ask the client

- The demo date after tomorrow, and what "delivered properly" means to them.
- Whether "likely covered / likely not covered" wording is acceptable to their compliance team.
- Their real claim intimation channel and turnaround times, to replace the Policy Wordings defaults later.

## New policyholders (added 4 Nov 2026)

- The Apply review page has **Submit to HDFC ERGO (demo)**. It saves the proposal (name, mobile, business, Section I kind, storm and flood or earthquake add-ons, chosen sections with their first rupee amount as sum insured, start date, tenure) as `PRP-2026-0101` onwards, status *Proposal received*. PAN, KYC and bank details are still never collected.
- The HDFC ERGO Desk lists proposals with **Approve and issue policy** and **Decline**. Approving plays HDFC ERGO accepting the proposal and receiving the premium: it issues `VS-2026-10004` onwards, starting on the chosen start date or today if that is earlier, for the chosen tenure. Jewellery is never specifically insured on a new policy.
- Issued policies live in the Durable Object next to the claims, so start_verification, get_my_policy and check_claim work for them exactly as for the three fixed customers. Reset deletes them; the three fixed customers stay in the code.
- API: `POST /api/proposals`, `GET /api/proposals/:ref`, `POST /api/proposals/:ref/approve`, `POST /api/proposals/:ref/decline`. No new MCP tool, so nothing to rediscover in Perfox.
