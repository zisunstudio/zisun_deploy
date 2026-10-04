# Sharing ZISUN: the policy, and where it could be gamed

The customer-facing policy is the page at `/share` (`frontend/src/app/share/page.tsx`).
This file is the reasoning behind it, the rules as the code enforces them, and a
register of every loophole we have thought of, with what closes it and what is
still open. Amounts live in one place: `backend/app/services/referral.py`
(mirrored for display in `frontend/src/lib/referral.ts`).

## What it is

A woman who has received a ZISUN piece gets a code. A friend who uses it takes
₹100 off her first order (₹500 or more). When the friend's order is *complete*,
the first woman is thanked with ₹150 of store credit. A small number of creators
are given codes by hand and are thanked in money instead.

## How it must read

ZISUN's brand is plain dealing: prices that include tax, claims computed from the
catalogue, no countdowns. The sharing arrangement has to sound like the same
shop.

- It is a **thank-you, not an income**. The words are "tell a friend" and "we
  thank you", never "earn", "win", "cash", "unlimited" or "refer and earn".
- **One level only.** A code rewards the person who shared it, for an order by
  someone she told. Nobody earns from a friend's friend. This is not, and must
  never become, a chain.
- **No urgency and no ranking.** No expiry on a code, no "ends soon", no
  leaderboard, no badge, no progress bar towards a tier.
- **No reminders.** We do not message a customer to push her to share. Her code
  appears in two quiet places (her order page after delivery, her account) and
  nowhere else.
- **Everything that could surprise her is said before it happens**: when the
  credit arrives, what cancels it, what the credit cannot do.
- **Her friend's privacy is hers.** The sharer sees that an order exists and its
  state, never who placed it.
- **A creator says she is paid.** Any post carrying a creator code must say so
  ("#ad" or "gifted", per ASCI and the CCPA's 2022 endorsement guidelines).

## The rules, as enforced

| Rule | Where |
|---|---|
| Friend's discount ₹100, flat, on a bag of ₹500 or more | `referral.BUYER_DISCOUNT_PAISE`, `MIN_ORDER_PAISE` |
| First website order only, by account | `referral.check_buyer` |
| Not the owner's own order | `referral.check_buyer` |
| Not an order to the owner's address, nor to any address that has ordered before | `referral.check_address` |
| Once per buyer | `Coupon.per_user_limit = 1` |
| One code per order (the checkout takes one) | `checkout` |
| Reward exists only as *pending* until the order is DELIVERED and 14 days have passed | `referral.settle_decision`, `HOLD_DAYS` |
| Cancelled, failed, refused or returned order: reward void | `referral.settle_decision` |
| Order comes back *after* the reward was earned: reward reversed | `referral.settle` (status `reversed`) |
| Cash paid before a reversal is listed to deduct from the next payment | console, "To take back" |
| Store credit is derived (earned minus spent), never a stored number | `referral.credit_balance` |
| Credit spent only by a signed-in buyer on her own account | `checkout.guest_checkout` |
| Credit never takes an order below ₹1 | `checkout.initiate_checkout` |
| A customer gets a code only after a delivered order | `referral.customer_code` |
| A code can be switched off | console, Referrals |

**Why 14 days.** The exchange policy gives 24 hours to raise an exchange, 3 days
to post the piece back, and a courier takes up to 8 days. Fourteen days from
delivery covers the whole of it, so "complete" means what a customer would
understand it to mean. A size exchange does not undo a sale, so it does not
affect the thank-you.

**Marking an order as come back.** The console's order list has "Came back" on a
shipped or delivered order. Until 2026-10-04 there was no way to record this at
all: the status existed but nothing could set it, so a refunded sale stayed a
sale in the money figures and would have kept its reward.

## Loophole register

| # | The trick | Closed by | Still open |
|---|---|---|---|
| 1 | She uses her own code | Owner cannot use her own code | - |
| 2 | She orders to her own door under a second phone number | Address check: the owner's address refuses her code | An address typed differently enough (a different first line) passes. See 9. |
| 3 | A buyer uses a new phone number each time to get ₹100 off again | Address check: an address that has ordered before is not a first order | Same as 2. |
| 4 | Order with a friend's code, collect the reward, then send it back | Reward waits 14 days; a returned order voids or reverses it | - |
| 5 | Refuse the parcel at the door (COD), reward already counted | Nothing is earned before delivery plus 14 days | - |
| 6 | Code posted on a coupon-listing site | First-order-only and new-household-only: it can only buy genuinely new customers. Console can switch a code off. | We pay ₹150 to the poster for customers who found us through a coupon site. Watch for a code with many orders from unrelated places; switch it off. |
| 7 | Two friends "refer" each other | Each can only be referred on a first order, and a code is issued only after a delivered order. So at most one of them can ever be the referred one. | - |
| 8 | Someone types another customer's phone number at checkout to spend her credit | Credit needs her signed-in session, not her number | - |
| 9 | Fake address variations ("Flat 12" / "No. 12, 1st floor") | Normalising letters and digits of the first line plus pincode catches spacing and punctuation | Genuinely different wording passes. Not worth an address-verification service at this size; the 14-day hold and the console's order list are the backstop. Revisit if referral orders pass ~20 a month. |
| 10 | Creator is paid, then orders come back | Reversed rewards are listed "To take back" | Recovery is by deduction from her next payment; if she never earns again it is a small loss. Paying creators only at month end, after the hold, keeps this rare. |
| 11 | Staff or family use codes | - | A matter of conduct, not code. Family addresses are caught by the address check only if they have ordered before. |
| 12 | Order placed with a code is later edited to a cheaper order | Orders cannot be edited after placement | - |
| 13 | Credit used to get a piece free and resell it | Credit cannot cover the last rupee; it is per account and cannot be transferred | Someone could accumulate credit over many genuine referrals. That is the arrangement working. |
| 14 | A reward is earned on an order the marketplace fulfilled | Codes exist only on zisun.in checkout | - |
| 15 | Rounding: ₹100 off pushes a ₹500 bag below a tax or shipping threshold | Discount lowers the taxable value (`gst.apportion_discount`); shipping does not depend on the total | - |

## What needs a person, not code

- **TDS on creator payments.** Commission to one person above the yearly
  threshold may need tax deducted at source (section 194H). Ask the CA for the
  current threshold before any creator's payments approach it. Store credit to
  customers is a discount on a future sale, not a payment.
- **GST on store credit.** The code treats spent credit as a discount, which
  lowers the taxable value of that order. Confirm with the CA.
- **Creator disclosure.** Check the first post under each creator code.
- **A code that looks wrong.** Console, Referrals: orders per code. A customer's
  code with more than a handful of orders, or orders bunched in a day, is worth
  a look before the hold ends.

## Marketing use

The arrangement is not a growth campaign, and it should not be advertised as one.
It works when the piece is good enough to mention. What we do with it:

1. **A card in the parcel**, hand-signed, with her code and one sentence. This is
   the moment she is most likely to tell someone.
2. **Her order page after delivery** shows the code with a WhatsApp button.
3. **Reposting customers who tag ZISUN** is the stronger engine and costs
   nothing. Sharing codes support it; they do not replace it.
4. **Creators:** five to ten, chosen for fit, each gifted a piece. Paid per
   completed order, monthly, after the hold.

Never: a pop-up asking a visitor to share, a "share to unlock" discount, a
referral banner on the home page, or a message to a customer who has not shared.
