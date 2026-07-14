# FundPulse — Founder's Launch & Scale Playbook

Everything you need to take FundPulse from "live on a free tier" to a real product that
Indian investors open every day. Written for you (Madhavan), the solo founder.

**Read this first:** I built the product and can fix code, but I am not a lawyer, a chartered
accountant, or a SEBI-registered adviser. The legal, tax, and regulatory sections below are
a practical map of what to look into and who to hire — not legal or financial advice. For
anything with the word "SEBI," "DPDP," "tax," or "trademark" in it, the cheap move is one
paid hour with the right professional before you scale, not after a notice arrives.

Last updated: 14 July 2026.

---

## 0. The one rule that governs everything

FundPulse shows people **information** about funds they chose to follow. It never tells anyone
what to buy, sell, or hold. Every decision in this document — a feature, a marketing line, a
pricing page — has to pass one test:

> Does this cross from "here is information" into "here is what you should do with your money"?

Stay on the information side and most of the regulatory risk disappears. Cross the line and you
are an unregistered investment adviser, which in India is a SEBI enforcement problem. Keep this
test in your head every time you write copy or add a feature.

---

## 1. Legal & regulatory (India) — highest stakes, do this before real scale

### 1.1 SEBI — the investment-advice line

India regulates investment advice through two SEBI frameworks:
- **Investment Advisers Regulations, 2013** — you need to register as an Investment Adviser if
  you provide personalised investment advice for a fee.
- **Research Analysts Regulations, 2014** — you need to register if you issue research
  reports or recommendations on securities.

FundPulse is designed to sit outside both: it is factual information and alerts on funds the
user already picked, not advice or recommendations, and you do not charge for advice. That
design only holds if you keep it clean:

**Safe (stay here):**
- Price-move alerts, news, NAV history, 52-week high/low, plain-language fund facts.
- "This fund typically moves ±X% a day" — a factual statistic, not a suggestion.
- Empty states, education ("what is a flexi-cap fund").

**Risky (get a lawyer's eyes before scaling, or change):**
- **Starter packs** ("Steady & Simple", "Growth Hunters") that name specific funds. This is the
  single feature closest to a "recommendation." It is currently labelled "not advice," which
  helps, but the safest version is **category-based** ("large-cap index funds", "flexi-cap
  funds") rather than naming specific schemes. I can make that change in an afternoon — say the
  word.
- Any wording like "recommended," "you should," "best fund," "top pick." I already removed the
  ones that existed. Keep them out of every new feature and every marketing asset.
- Ranking or scoring funds against each other in a way that implies "this one is better."

**What to actually do:**
1. Book one hour with a SEBI-savvy lawyer (fintech/securities practice). Ask specifically:
   "Does an information-and-alerts product like this, that names specific funds in curated
   packs, need IA or RA registration? What do I change to stay outside?" Get it in writing.
2. Keep the "not investment advice / not SEBI registered" disclaimer on every surface (done:
   landing footer, Terms, Privacy, alert emails).
3. Never take money *for advice*. Charging for features (unlimited funds, WhatsApp) is fine;
   charging for "what to buy" is not.

### 1.2 Business structure & tax

You can launch as a **sole proprietor** (no formal registration needed to start). Move up when
money or risk appears:

| Structure | When it makes sense | Rough cost |
|---|---|---|
| Sole proprietor | Now, pre-revenue, testing | ₹0 |
| LLP | Some liability protection, low compliance | ~₹7k–12k to set up |
| Private Limited (Pvt Ltd) | You raise money or want a clean cap table | ~₹8k–15k + annual filings |
| One Person Company (OPC) | Solo, want a company but no co-founder | similar to Pvt Ltd |

- **GST:** only mandatory once service turnover crosses **₹20 lakh/year** (₹10 lakh in some
  states). Not a concern pre-revenue. Register when you start charging and approach the limit.
- **Startup India / DPIIT recognition:** free, worth doing once you incorporate. Gives a 50%
  trademark-fee rebate, tax benefits, and easier compliance.
- **Payments:** when you monetise, use **Razorpay** or **Cashfree** (built for India, UPI +
  cards). Live mode needs business KYC docs, so incorporate first if you plan to charge.

### 1.3 DPDP Act 2023 (India's privacy law)

You collect name + email = personal data, so you are a **Data Fiduciary** under the Digital
Personal Data Protection Act, 2023. What you already have (good): consent at signup, a privacy
policy, purpose limitation, and one-click account deletion. What to keep tight as you grow:

- **Consent + notice:** clear, specific, withdrawable. Done — keep it that way; don't quietly
  add new uses of the data without new consent.
- **Grievance redressal:** publish a contact for data complaints. Done (grievance email in the
  privacy policy). Answer those emails.
- **Security safeguards:** reasonable technical measures (RLS, encryption in transit, no secrets
  in code). Mostly done — see the cybersecurity section.
- **Breach notification:** if user data is ever exposed, the Act expects you to notify the Data
  Protection Board of India and affected users. Have a plan (section 5.5) before you need it.
- **Significant Data Fiduciary** duties (DPO, audits) only kick in at large scale — not your
  problem yet, but know the term exists.

### 1.4 Data source licensing

- **mfapi.in** (current NAV source): unofficial community API that scrapes AMFI. No license, no
  SLA, no commercial guarantee. Fine for launch; for a product people rely on daily, move to
  **AMFI's official NAV feed** (amfiindia.com publishes daily NAVAll files). The data is public
  and factual; the official feed is more reliable and cleaner legally.
- **NewsData.io** (news): **check the free-tier Terms** for commercial use and whether you may
  store and redisplay article titles/descriptions. You already mitigate copyright by linking to
  the original source ("Read full article") — keep snippets short and always link out. If the
  free tier forbids commercial use, upgrade or switch (e.g. GNews, or RSS from the sources).
- **AMFI:** fund names and NAVs are factual public data — fine to use. Do **not** use AMFI's or
  any fund house's logo in a way that implies partnership or endorsement.

### 1.5 Terms & disclaimers

Done and live: `terms.html` (information-only, data-may-be-wrong, liability limit, governing
law India) and an updated `privacy.html`. Keep the "Last updated" dates current whenever you
change them, and re-link if you move to a custom domain.

---

## 2. Domain & email deliverability

Right now you are on `fundpulse-chi.vercel.app` and emails send from Brevo's shared sender.
Both work, but a real daily-use product needs its own domain — for trust, for branding, and
because email inbox placement depends on it.

### 2.1 Buy the domain
- Get **fundpulse.in** and/or **fundpulse.com** (buy both if available; redirect one). Indian
  registrars or Cloudflare/Namecheap. ~₹700–1,500/year.
- Point it at Vercel: add the domain in Vercel → Project → Domains, set the DNS records Vercel
  shows. Vercel issues the HTTPS cert automatically.
- Update `APP_URL` (GitHub secret) and the hardcoded fallback in `scripts/alert-engine.js` to
  the new domain so alert-email links point there.

### 2.2 Email deliverability (this is what keeps alerts out of spam)
Once you own a domain, verify **the domain** (not just a single sender) in Brevo and set these
DNS records — they are the difference between the inbox and the spam folder:
- **SPF** — authorises Brevo to send for your domain.
- **DKIM** — cryptographically signs your mail (Brevo gives you the record).
- **DMARC** — a policy record (`v=DMARC1; p=none; rua=...` to start, tighten later).
- **List-Unsubscribe header** — add it to alert emails. Gmail/Yahoo require one-click
  unsubscribe for bulk senders, and it improves deliverability even below that threshold. This
  is a small code change in `scripts/email-template.js` / the send call — I can do it.

Send from something like `alerts@fundpulse.in`. Warm up gradually (don't blast 300 cold emails
day one). Watch your Brevo bounce/complaint stats.

---

## 3. Trademark & intellectual property

### 3.1 Trademark "FundPulse"
1. **Search first** (free): the IP India public search (ipindiaonline.gov.in) and a plain Google
   search. Make sure no one holds "FundPulse" or a confusingly similar mark in a related class.
   Also confirm the domain and social handles are free.
2. **File** at IP India in the relevant classes:
   - **Class 9** — downloadable/mobile software.
   - **Class 36** — financial information services.
   - **Class 42** — SaaS / hosted software.
   File in the classes that match how you describe the product; a lawyer or an online service
   (e.g. Vakilsearch, IndiaFilings) can file for you.
3. **Cost:** ~₹4,500 per class if you have DPIIT/startup recognition (individual rate), ~₹9,000
   per class otherwise. Registration takes 12–24 months, but you can use the ™ symbol
   immediately on filing and ® only after it's granted.
4. Do this **before** you spend money on marketing the name — you don't want to build a brand you
   then have to rename.

### 3.2 Other IP
- **Copyright** in your code and content is automatic on creation (no filing needed in India).
  Keep the repo private if you don't want the source public; add a `LICENSE` file stating "All
  rights reserved" (or an open-source license only if you deliberately want that).
- **Secure the brand surface:** register the social handles (@fundpulse on X, Instagram,
  LinkedIn), even if you won't use them yet.
- If you later hire contractors, use a contract that assigns IP to you/your company.

---

## 4. Cybersecurity

### 4.1 Already done (this session and before)
- **Row-Level Security** on Supabase, re-verified live: anon can read news but can't insert or
  delete; watchlist/profiles/alert_log/push_subscriptions return nothing to anonymous callers.
- **XSS hardening:** fund names escaped before going into the page and into emails.
- **`.gitignore`** so local `.env` files and Supabase CLI tokens can't be committed.
- **Secrets** live only in GitHub Actions secrets, not in code. No secrets found in git history.
- HTTPS everywhere (Vercel), the service-role key never ships to the browser.

### 4.2 Do before/around launch
- **Turn on 2FA** on every account that can hurt you: GitHub, Supabase, Vercel, the domain
  registrar, Brevo, and your email. The domain registrar and email are the crown jewels — if
  someone takes those, they take everything.
- **Rotate keys** if any were ever pasted into a chat, screenshot, or shared doc. The Supabase
  service-role key and Brevo API key are the sensitive ones.
- **Supabase Auth settings:** confirm email confirmation is on, set a sane password policy, and
  turn on leaked-password protection if available.
- **Backups:** Supabase has automatic backups on paid tiers; on free tier, periodically export
  your tables. User data loss is unrecoverable trust loss.

### 4.3 Do as you scale
- **Rate limiting / abuse protection:** the anon key is public by design, so someone can hammer
  your Supabase from a script. Add Supabase rate limits, and consider Cloudflare in front of the
  domain (free tier gives you a WAF and DDoS protection).
- **Dependency scanning:** enable GitHub Dependabot on the repo (free) so you hear about
  vulnerable packages.
- **Monitoring:** an uptime monitor (UptimeRobot, free) on the site and a check that the alert
  engine actually ran (GitHub Actions notifies on failure — make sure those emails reach you).
- **Incident-response plan (write one page now):** if a breach happens — what you shut off, how
  you rotate keys, who you notify (users + DPDP Board), and how you communicate. Having this
  before you need it is the whole point.
- **Responsible disclosure:** a `security@fundpulse.in` address and a line in a `/security` page
  inviting researchers to report issues privately.

---

## 5. Scaling — where the free tiers break and what to do

You are on generous free tiers. Here's where each one runs out and the move when it does. None
of this is urgent now; it's the map so nothing surprises you.

| Service | Free-tier limit | What breaks first | The move |
|---|---|---|---|
| **Vercel** | Hobby: fine for static + generous bandwidth | Bandwidth if you go viral; commercial-use terms on Hobby | Upgrade to Pro (~$20/mo) when you monetise or hit limits |
| **Supabase** | 500MB DB, 50k monthly active users, egress cap, project pauses after 1 week idle | MAU/egress as users grow; **free projects pause when idle** | Upgrade to Pro (~$25/mo) before real traffic — also removes the pause risk |
| **Brevo** | 300 emails/day | Alert volume once you have a few hundred active alerts | Paid plan lifts the cap; a custom domain improves deliverability |
| **NewsData.io** | Low daily request quota | News freshness/coverage as you add funds | Upgrade or switch news source |
| **GitHub Actions** | 2,000 min/mo (free for public repos) | Only if you run the engine far more often | Fine for daily cron; if you need frequent runs, move the engine to a small always-on host |

### 5.1 The pause trap (fix this early)
Supabase **free projects pause after ~7 days of inactivity**. If your project pauses, alerts
stop and logins fail until you wake it. For a product people use daily this is unacceptable —
**upgrade Supabase to Pro before you tell real users to depend on it.** This is the single most
important paid upgrade.

### 5.2 When to leave plain HTML
The current no-build HTML/JS is a feature, not debt — it's fast and simple. Keep it until you
have a validated, growing user base and a concrete need it can't meet (shared components across
many screens, complex state, server-side rendering for SEO). Then migrate to Next.js
deliberately, screen by screen. Don't rewrite on vibes; rewrite when the old thing hurts.

### 5.3 The alert engine at scale
It runs once daily in GitHub Actions and fetches NAVs per unique fund with retries + dedup —
that scales fine to thousands of users on the same funds. Watch for: NAV API rate limits as
unique funds grow (batch/cache), and email send throughput (Brevo cap). If you ever need
intraday or more frequent runs, move it to a scheduled function on a real host.

### 5.4 Cost curve (rough, monthly, as you grow)
- **Now (pre-launch):** ₹0.
- **First real users:** ~$25 Supabase Pro is the one upgrade that matters. Domain ~₹100/mo
  amortised. Still under ~₹2,500/mo.
- **Growing (thousands of DAU):** Supabase Pro + Vercel Pro + Brevo paid + news source ≈
  $70–120/mo. Everything else scales with revenue.

### 5.5 Observability
Add basic monitoring before you have users depending on you: uptime check, alert-engine
success/failure notifications, and a weekly glance at Supabase usage. You can't fix what you
can't see.

---

## 6. Analytics — measure what matters

You deferred analytics deliberately; add it before serious marketing so you can see whether
people actually come back. Use a **privacy-friendly** tool to stay clean under DPDP:

- **Plausible** or **PostHog** (self-host or cloud). Both are light and don't need a cookie
  banner if configured privacy-first. PostHog also gives you funnels and retention out of the box.

**The metrics that tell you if this is working:**
- **Activation:** % of signups who add at least one fund and set at least one alert. This is the
  moment FundPulse becomes useful — if people don't reach it, fix onboarding.
- **Retention (the real scoreboard):** Day 1 / Day 7 / Day 30 return rate. A daily-use product
  lives or dies on D7/D30. Aim to beat "opens once, never again."
- **Alert engagement:** open rate on alert emails, and whether people click through.
- **Habit signals:** funds per user, alerts set per user, days-active per week.

Watch retention above everything. Ten users who open it every day are worth more than a
thousand who signed up once.

---

## 7. Marketing & user acquisition (India)

### 7.1 Positioning
Lead with the wedge: **"Google Alerts, but for your mutual funds."** One sentence, concrete,
and it sidesteps the advice trap because it promises information, not tips. Every asset should
make one promise: *you'll know the day your fund does something, without watching it yourself.*

**Marketing compliance:** the SEBI line applies to your ads too. Never promise returns, never
imply "invest in X," never show cherry-picked performance. "Track your funds and get alerted"
is safe; "grow your wealth with our picks" is not.

### 7.2 Where Indian mutual-fund investors actually are
- **Reddit:** r/IndiaInvestments, r/mutualfundsindia, r/personalfinanceindia. High-intent, but
  they hate self-promotion — show up as a helpful member for weeks first, then share the tool
  where it genuinely answers a question. A "Show Reddit / I built this" post can work if honest.
- **Twitter/X "fintwit India":** a large, active mutual-fund community. Reply usefully, share
  plain-language fund explainers, let people discover the product.
- **YouTube / Telegram / WhatsApp finance communities:** India's finance-creator scene is huge.
  A single creator mentioning "there's a free tool that just tells you when your fund moves" can
  bring a wave. Offer them something real, not a paid shill.
- **SEO — your long game:** build lightweight pages per fund ("SBI PSU Fund — latest unit price,
  news, and alerts"). People Google fund names daily; own those searches. This compounds and is
  free. It also fits the plain-HTML architecture perfectly.
- **Product Hunt:** good for an initial launch-day spike and early adopters. Time it, prepare
  assets, rally your first users to upvote.
- **Play Store presence:** your PWA can be wrapped as a **TWA (Trusted Web Activity)** and
  listed on the Play Store cheaply — many users only trust an app they can install from the
  store, and "daily use" apps benefit from a home-screen icon.

### 7.3 Loops that grow without spend
- **Referral:** "invite a friend, both get unlimited funds" once you have a premium tier.
- **Shareable alerts:** let a user share an interesting move ("SBI PSU rose 4% today — tracked
  with FundPulse") with a link back.
- **The habit itself:** a product people open daily gets word-of-mouth if it's genuinely useful.
  Retention is your best acquisition channel.

### 7.4 A sane launch sequence
1. Add analytics; fix onboarding until activation is solid with a handful of friendly users.
2. Buy the domain, sort email deliverability, upgrade Supabase (no pause).
3. Soft-launch to 20–50 people you know; watch D7 retention; fix what they drop off on.
4. Post where your users are (Reddit/fintwit) as a helpful build-in-public story.
5. Product Hunt + a creator or two once retention proves the product is sticky.
6. Only pour effort into paid/scaled marketing after D7 retention says people come back.

---

## 8. Monetisation (when the time comes)

Your concept already has the tiers. Keep the free tier genuinely useful — a crippled free
product kills the word-of-mouth that is your best channel.

| Tier | Includes | Notes |
|---|---|---|
| Free | 3 funds, email + push alerts, news feed | Real value, forever |
| Premium | Unlimited funds, WhatsApp alerts, more alert types, weekly digest | The upgrade most daily users will want |
| Advisor (later, B2B) | Verified presence, analytics | Only if there's pull |

- Charge for **capability** (more funds, more channels), never for **advice**.
- Payments via Razorpay/Cashfree; incorporate first for live mode.
- Introduce paid only after you have retained, engaged users who'd miss the free features.

---

## 9. What makes this a *daily* product (retention mechanics)

You want people opening FundPulse every day. What earns that:
- **The pulse card** ("all quiet" vs "X moved past your level") — a reason to glance daily.
- **A daily/weekly digest email** — pull people back even on quiet days.
- **WhatsApp alerts** — where Indian users actually are; the highest-value channel to build.
- **More alert types** — all-time high, drawdown from peak, manager change with a real data
  source.
- **Speed and calm** — it loads instantly and never cries wolf. Trust is the retention moat.

Build toward "the first thing they check about their funds," not "another dashboard."

---

## 10. Prioritised action list

**Before you tell real users to rely on it (must-do):**
- [ ] Upgrade Supabase to Pro so the project never pauses. *(highest priority)*
- [ ] Enable email delivery: set `BREVO_API_KEY` + `ALERT_FROM_EMAIL` (done if you've completed
      Brevo setup) and verify a real alert lands in an inbox.
- [ ] Buy the domain; point it at Vercel; update `APP_URL`.
- [ ] Verify the domain in Brevo; set SPF + DKIM + DMARC; add List-Unsubscribe to emails.
- [ ] Turn on 2FA on GitHub, Supabase, Vercel, registrar, Brevo, and your email.
- [ ] One paid hour with a SEBI-savvy lawyer on the advice line + the packs feature.
- [ ] Trademark search for "FundPulse"; grab domain + social handles.
- [ ] Add privacy-friendly analytics; watch activation and D7 retention.

**First 100 users:**
- [ ] File the trademark (after search comes back clean).
- [ ] Decide on the packs feature (category-based vs named) per the lawyer's read.
- [ ] Confirm NewsData.io free-tier commercial terms; plan the AMFI official-feed move.
- [ ] Write the one-page incident-response plan; set up uptime + engine-failure monitoring.
- [ ] Soft-launch, gather feedback, fix onboarding drop-off.

**As you grow / scaling triggers:**
- [ ] Incorporate (LLP or Pvt Ltd) when you monetise or raise money; get DPIIT recognition.
- [ ] Move NAV to AMFI's official feed.
- [ ] Add WhatsApp alerts (the retention unlock) — re-enable the phone/OTP flow at opt-in.
- [ ] Cloudflare in front of the domain; Dependabot; key rotation schedule.
- [ ] Ship monetisation once retention proves stickiness.
- [ ] Consider Play Store listing via TWA.

---

*This is a living document. Update it as decisions get made. When in doubt on anything legal,
tax, or regulatory, spend the hour with a professional — it's the cheapest insurance you'll
buy.*
