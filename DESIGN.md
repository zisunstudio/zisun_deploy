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
