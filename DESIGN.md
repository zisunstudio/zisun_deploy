# ZISUN — design thesis

The reasoning behind the storefront. `CLAUDE.md` says what must not break;
this says why the site looks the way it does, so the next change can be
judged against an intention rather than a mood.

## 1. Audit — what the site said before this pass

Read as a first-time visitor with a five-second budget, the previous home
page communicated **"choose a product"**: a product photograph with a
slogan over it, a moving yellow ribbon, an icon row, nine product cards
each carrying its own "Shop Now" button, a category rail with item counts,
a founder note with a tilted product card beside it. Every section ended
in a button. The brand colour appeared in a footer and a dot.

Symptoms and their root causes are different things:

| Symptom | Root cause |
|---|---|
| Nine "Shop Now" buttons on one screen | The hero card component was reused for the grid, so every card inherited a hero's call to action |
| Hero reads as a listing ("This piece · Purple Rose…") | The hero is data-driven by whatever the shelf puts first; the brand never speaks for itself |
| Five competing colours above the fold (garment, turmeric, white, green, burgundy) | "Gen Z" was interpreted as energy — sticker, ribbon, heart — rather than as confidence and restraint |
| Burgundy is not remembered | It sat on small things and one footer; the actions people touch (buttons, the wordmark) were black |
| Type feels playful, not assured | A soft, wonky serif (Fraunces at SOFT 85) is a bakery's voice, not a fashion label's |
| Cards feel like an app store | 20px radii, drop shadows, hearts, pills — the grammar of utility apps |
| Trust reads as a checklist | Icon badges say "we are a store"; a label's trust comes from tone, photography and the founder |

## 2. Thesis

**ZISUN is a point of view about the ordinary day, and the clothes are how
it is worn.** The site should read as a small, confident fashion label that
happens to sell handloom kurtis and co-ords — not a kurti store dressed up.

Desire is built in this order: a woman, a line, a colour, whitespace → the
name of the label → what it makes → the pieces → the facts → the purchase.
The product grid arrives fourth, not first, and when it arrives it is
quiet: photograph, name, price.

The five-second test: *this feels different, feminine, tasteful,
trustworthy, modern; I want to see more; I can imagine wearing this.* Every
decision below is checked against that sentence.

## 3. The system

**Colour.** Burgundy `#7A1F3A` is the brand colour and is spent only where
memory is built: the wordmark on light grounds, every primary action, the
section eyebrows, the footer, the WhatsApp button, the price badge. Nothing
else is burgundy. Ground is warm ivory (`porcelain #FAF8F6`); text is a
plum-black `ink #1A1417`; panels are `rose #F6ECEA`; muted text `#6F6A6C`.
Turmeric survives only on coupon tickets, which are allowed a different
voice because a deal *is* a different voice. Product colours never
redefine the palette: a purple garment is a purple garment on an ivory page
with a burgundy button.

**Type.** Instrument Serif for headlines and product names — a
contemporary, classical serif with masthead authority at 48–96px and none
of the Didone "luxury" cliché. Instrument Sans for everything the hand
touches: prices, labels, buttons, body. Caveat for exactly one line: the
founder's signature. Section eyebrows are 11px uppercase, tracked 0.22em,
in burgundy — the one recurring brand mark inside the page.

**Space.** Sections breathe: 64–96px between them on a phone, 120px on a
desktop, page gutters 20/32px. Cards have 8px corners and no shadow;
depth comes from photography, not from CSS. One primary action per screen.

**Motion.** Sections rise 18px as they enter, once. The hero's words arrive
in sequence. Nothing spins, scrolls sideways on its own, or pulses.
The one exception is the loom (§8), which moves only because the visitor
moves it: it weaves with her scroll and gives under her finger, then is
still. Nothing on the site animates by itself in a loop.

**Photography** is the highest-leverage element and the one code cannot
supply. The hero and cards use the first photograph of the featured piece;
the founder art-directs the site by choosing which photograph is first in
the console, or by publishing a Content card from Admin → Content, which
the home page takes as its hero. The brief for future shoots: a real woman
in a real place, movement, fabric texture, the day rather than the studio.

## 4. Information architecture

**Home**, in the order desire is built:

1. Hero — one photograph, the label's line ("Not made for *everyone*."),
   one action ("See the drop"), and the piece worn, as a magazine credit
   line rather than a product chip.
2. One quiet line of promises in small caps: handloom · ships across India
   · 24-hour size exchange. No icons, no card.
3. Deals — only when something is on offer or a coupon is live.
4. The drop — six pieces, photograph + name + price, no buttons, generous
   gaps. A link to everything.
5. The label's statement — three lines in serif with air around them.
   What ZISUN is *for*, in the founder's words (`MANIFESTO` in
   `lib/brand.ts`).
6. What are you dressing for? — the categories, presented as occasions:
   each tile carries its name and the description the founder writes for it
   ("the commute, the errand, the long lunch"). No item counts.
7. Made of — three typographic facts about the cloth. No icons.
8. A note from Sushmita — her line, her story, her signature. Nothing to
   buy beside it; the drop is above.
9. ZISUN Tales — one line inviting people to the WhatsApp group where
   drops land first. Real community, not manufactured social proof.
10. Footer in burgundy.

**Product page**, in the order a decision is made: photographs (swipe,
counter, thumbnails) → category → name → price and any offer → colour →
size and the size guide → **the description, as the reasons to want it**
→ the assurances (exchange, dispatch, help) → the fabric, cut and legal
facts, which are there to be found rather than to be read first. The buy
action is pinned and burgundy.

**Collection page** — "Collection", a count, filters as quiet chips, the
same quiet cards.

**Navigation** — Home, Collection, Wishlist, Bag. One search button. No
profile until there are orders to show.

## 5. Why each decision helps

- *One CTA per screen* makes the one that remains feel deliberate; nine
  buttons make each one worthless.
- *Burgundy on the actions* means the colour is touched, not just seen —
  the fastest route to "that colour is ZISUN".
- *The grid fourth* lets the visitor meet the label before its catalogue;
  the products then read as expressions of a taste she has already
  accepted.
- *No hearts, stickers or flowers* keeps femininity in the letterforms,
  the photographs and the tone, where it ages well.
- *Occasions as copy, not as a new taxonomy* gives the mood-led discovery
  the brief asks for without inventing data the catalogue does not have;
  the founder writes one line per category and the page does the rest.
- *Facts without icons* read as a label stating things, not a store
  reassuring you.

## 6. What was deliberately left alone

The data model and every API. The admin console. The bag → WhatsApp order
flow. The photograph strip on the product page. Coupon tickets. Size
guide, legal declarations, fabric and garment details (moved lower, not
changed). The shelf ordering. The token architecture in
`tailwind.config.ts` (values changed, names kept, `rani` still aliases
burgundy). `Reveal`. The tab bar's structure. `next/font` setup.

## 7. Review criteria

Before calling any storefront change done, look at the home page and a
product page on a phone and ask, without reading: does this feel different,
feminine, tasteful, trustworthy and modern; do I want to scroll; can I
imagine wearing it? If a change makes the answer to any of those weaker,
it is not done.

## 8. The living layer

The first pass made the site tasteful. Tasteful is a 4/10 experience: nothing
on it could only have been made by ZISUN, and nothing on it was alive. The
catalogue is small (one piece, at the time of writing), so "AI that
recommends" would be theatre. What a small label *can* do that a marketplace
cannot is make one piece, and the day she is wearing it in, feel attended to.
Three additions, each an expression of something already in the thesis:

**The loom** (`lib/weave.ts`, `components/Weave.tsx`). A generative cloth
with the real structure of South Indian handloom: a warp in the piece's
colour, a weft of ivory that has taken some of the dye, irregular
pinstripes, a ribbed burgundy-and-gold selvedge, and one of four
interlacings. It is deterministic from a seed.
- On the home page the seed is today's date and the colours are the drop's,
  so there is a new cloth every day with nobody touching it, and the visitor
  weaves it by scrolling: bare warp first, weft rising row by row, shuttle
  alternating. It sits directly above the label's statement.
- On a product page the seed is the product id, led by the selected colour.
  "No. D20A · Herringbone" is that piece's weave on every device, forever,
  which is what lets it go on a swing tag or an order card later.
- It answers a touch with a ripple and the lightest haptic tick.
Burgundy in the selvedge is within the colour rule: it is the label's hand
on the cloth, which is where memory is built. Colours come from
`colours.ts` by name; the file has no hex codes.

**The day** (`DAYPARTS` in `lib/brand.ts`). ZISUN is "a point of view about
the ordinary day", so the page says one line about the part of the day she
is actually in, read from her clock after mount. Four lines, hers to rewrite.

**Ways to wear it** (`components/WaysToWear.tsx`, `products.styling_notes`).
Occasion chips under the description; one note at a time in the serif, in
the same voice as the description. Claude drafts them in the console from
the facts on the form, she edits and saves, and the page serves stored
text. The credit line says exactly that, because an honest "drafted with
AI, approved by Sushmita" is a better brand statement than a chatbot.

Review additions to §7: scroll the home page on a mid-range Android and
watch the loom - if it stutters, lower `cols`/`rows` before shipping; and
check every new section with reduced motion on, where the cloth must
simply be there, finished.

## 9. What the page says about the garment

The founder reviewed the live product page and the gap she found was not
visual - it was that the facts she enters when she lists a piece were not
reaching the customer. Three causes, only one of which was cosmetic:

1. **A read-back bug** in the admin API silently wiped the seven garment
   attributes on every second save (see CLAUDE.md). She was right that the
   page ignored what she typed; it had been deleting it.
2. **Half the fields did not exist.** Fit, length, embroidery, bottom,
   occasion and the contents of a set had nowhere to go, so they went in
   the description or nowhere.
3. **Warehouse words.** "Net quantity: 5" on a single co-ord set, and
   "Dimensions: 42, 44" on a garment.

The principles for this part of the page:

**One fact, one place.** Pockets was printed on both the fabric panel and
the garment panel; it is a fact about the cut, so it lives with neck and
sleeve. The garment's described colour is suppressed when it only repeats
the swatch the customer has already tapped.

**Availability is silence until it is news.** No "In stock" on a healthy
size - that is noise dressed as information. At or below three, the exact
count in the selected size, with the label's real position underneath:
small batches, no re-runs. The scarcity is true or it is not shown, and
nothing counts down.

**What you get, beside what it costs.** A co-ord set is two garments and
the page could not say so; the only place it appeared was the statutory
net-quantity row. Said plainly under the price it is also the honest
argument for the number next to it.

**The promise leads, the limit follows.** "24h size exchange · no returns"
put the page's only negative sentence directly under the buy button. The
exchange covers the thing that actually goes wrong with clothes bought
online; the refund page states the limits in full, one tap away.

**Entering a fact must be cheaper than skipping it.** Fourteen fields per
product, typed on a phone, do not get filled - which is the real reason the
page was bare. "Fill from the description" reads the sentence she has
already written and fills only the empty boxes, never overwriting hers.
That is the fix for points 3, 4, 5, 8 and 9 of her review; the schema was
only the half of it that was visible in code.
