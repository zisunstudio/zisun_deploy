# Image credits

Launch-reel imagery for the ZISUN storefront. **These are not photographs of the
products sold.** They are licensed textile photographs standing in until real
product photography exists.

## Licence

All images are from [Pexels](https://www.pexels.com/license/), free for
commercial use with no attribution required. This file exists for provenance,
not obligation — so that six months from now it is still possible to answer
"where did this file come from and may we use it?"

Downloaded from the Pexels CDN and re-hosted on Tigris
(`https://zisun-media.fly.storage.tigris.dev/products/`). Nothing is hotlinked:
`frontend/next.config.js` allowlists the Tigris host only, so a remote URL would
render as a broken image.

## Launch imagery — TEMPORARY, remove after the video

People wearing kurtis, for the launch reel. These sit under the `launch/`
prefix in the bucket and are used in exactly two places: the home hero and the
three category cards.

| Slot | File | Source | Photographer |
|---|---|---|---|
| Home hero | `launch/home-hero.jpg` | https://www.pexels.com/photo/stylish-woman-in-yellow-floral-kurta-outdoors-30809730/ | Shootsaga |
| Everyday Kurtis | `launch/everyday-kurtis.jpg` | https://www.pexels.com/photo/woman-in-blue-dress-walking-13178920/ | Framesbyambro |
| Occasion & Festive | `launch/occasion-kurtis.jpg` | https://www.pexels.com/photo/elegant-chikankari-kurti-fashion-in-lucknow-28512776/ | Neha Mishra |
| Co-ord Sets | `launch/co-ord-sets.jpg` | https://www.pexels.com/photo/elegant-woman-in-chikankari-kurti-in-lucknow-28512787/ | Neha Mishra |

### Product cards

Product cards carry launch photographs too, at the owner's decision, under
`launch/products/`. Each is labelled **"Representative image"** on the card and
on the product page — see `frontend/src/components/RepresentativeImage.tsx`.

| Product | File | Source | Photographer |
|---|---|---|---|
| Mangalgiri Straight Kurti | `launch/products/mangalgiri-v2.jpg` | https://www.pexels.com/photo/woman-enjoying-outdoor-garden-view-in-kolkata-36281928/ | Kolkatarphotographer |
| Sungudi Everyday Kurti | `launch/products/sungudi-v2.jpg` | https://www.pexels.com/photo/woman-in-pink-dress-walking-on-forest-road-38374231/ | Subhrajyoti Paul |
| Udupi Cotton A-Line | `launch/products/udupi.jpg` | https://www.pexels.com/photo/elegant-woman-in-chikankari-kurti-lucknow-28512779/ | Neha Mishra |
| Chettinad Check Kurti | `launch/products/chettinad-v2.jpg` | https://www.pexels.com/photo/woman-in-red-and-black-3-4-sleeve-midi-dress-169047/ | Vinod Kharkwal |
| Venkatagiri Fine Cotton Kurti | `launch/products/venkatagiri.jpg` | https://www.pexels.com/photo/young-woman-wearing-traditional-clothing-8770996/ | Gustavo Fring |
| Kasavu Panel Kurti | `launch/products/kasavu.jpg` | https://www.pexels.com/photo/elegant-chikankari-kurti-fashion-in-lucknow-28512776/ | Neha Mishra |
| Ilkal Angarkha Kurti | `launch/products/ilkal.jpg` | https://www.pexels.com/photo/portrait-of-a-woman-smiling-20604437/ | Thangaraj |
| Molakalmuru Border Co-ord | `launch/products/molakalmuru.jpg` | https://www.pexels.com/photo/heritage-in-print-tavsi-s-stunning-ajrakh-kurtas-28213774/ | Tavsi Apparel |

Three were replaced after seeing the grid at laptop width: the originals were
portrait close-ups where the face fills the frame and the kurti is barely
visible. A product card has one job, which is showing the garment.

**The label is not optional decoration.** These women are wearing kurtis, but
not *these* kurtis. Beside a name, a price, a size and a stock count, an
unlabelled photograph states what arrives in the parcel, and the Consumer
Protection (E-Commerce) Rules 2020 require product images to be accurate. The
label is what keeps that honest until real photography exists.

It renders only while `NEXT_PUBLIC_LAUNCH_MODE=browse`, so it disappears with
the same flag that opens checkout. That is deliberate: the day someone can buy,
the real photographs must already be in place. **Do not open checkout on these
images.**

**Hero and category tiles are a different case.** A hero or a category tile is
editorial — it sets a mood. A product card carries a name, a price, a size and a
stock count, so an image there is a statement about what arrives in the parcel.
A person in a different kurti next to "Mangalgiri Straight Kurti, Rs 1,699" says
something untrue, and no licence fixes that.

The licences also matter more here than for cloth. Pexels grants the
photographer's copyright; it does not grant rights in the likeness of the person
photographed, and it forbids uses that show identifiable people unfavourably.
Editorial mood-setting is the defensible end of that. Implying a named model
endorses a specific SKU is not.

### To revert

Nothing was overwritten — the cloth images are still at `products/`,
`categories/` and `hero/`. Two steps:

```sql
-- categories back to cloth
update categories
   set image_url = 'https://zisun-media.fly.storage.tigris.dev/categories/' || slug || '.jpg'
 where slug in ('everyday-kurtis','occasion-kurtis','co-ord-sets');

-- product cards back to cloth (note ilkal, kasavu and venkatagiri are -v2)
update product_media m
   set url = x.u, cdn_url = x.u
  from (values
    ('Mangalgiri Straight Kurti','https://zisun-media.fly.storage.tigris.dev/products/mangalgiri.jpg'),
    ('Sungudi Everyday Kurti','https://zisun-media.fly.storage.tigris.dev/products/sungudi.jpg'),
    ('Udupi Cotton A-Line','https://zisun-media.fly.storage.tigris.dev/products/udupi.jpg'),
    ('Chettinad Check Kurti','https://zisun-media.fly.storage.tigris.dev/products/chettinad.jpg'),
    ('Venkatagiri Fine Cotton Kurti','https://zisun-media.fly.storage.tigris.dev/products/venkatagiri-v2.jpg'),
    ('Kasavu Panel Kurti','https://zisun-media.fly.storage.tigris.dev/products/kasavu-v2.jpg'),
    ('Ilkal Angarkha Kurti','https://zisun-media.fly.storage.tigris.dev/products/ilkal-v2.jpg'),
    ('Molakalmuru Border Co-ord','https://zisun-media.fly.storage.tigris.dev/products/molakalmuru.jpg')
  ) as x(pname, u)
  join products p on p.name = x.pname
 where m.product_id = p.id;
```

Then delete `frontend/src/components/RepresentativeImage.tsx` and its two call
sites.

and point `HERO_IMAGE` in `frontend/src/app/page.tsx` back at
`/hero/home-hero.jpg`, then redeploy the web service.

## Selection criteria

Every image is a **textile or weave shot with no identifiable person**. This was
deliberate and it constrains the choices:

- The Pexels and Unsplash licences cover the *photographer's* copyright. Neither
  grants rights in the likeness of people depicted; both state that additional
  permission may be needed where a person is identifiable and the use is
  commercial. A stock photo of an identifiable woman used as the product image
  for a garment we sell implies she models it.
- A fabric shot also makes a weaker factual claim than a photo of a different
  garment would. See the warning below.

## Images

| Product | File | Source | Photographer |
|---|---|---|---|
| Mangalgiri Straight Kurti | `products/mangalgiri.jpg` | https://www.pexels.com/photo/white-blue-and-orange-floral-textile-4566670/ | Ayyappan Ram |
| Sungudi Everyday Kurti | `products/sungudi.jpg` | https://www.pexels.com/photo/colorful-handmade-traditional-fabrics-23749436/ | aahshitpng |
| Udupi Cotton A-Line | `products/udupi.jpg` | https://www.pexels.com/photo/36891999/ | udatommo |
| Chettinad Check Kurti | `products/chettinad.jpg` | https://www.pexels.com/photo/intricate-red-indian-textile-with-embroidery-37975932/ | MS Parikh |
| Venkatagiri Fine Cotton Kurti | `products/venkatagiri-v2.jpg` | https://www.pexels.com/photo/close-up-of-fabric-textures-5908326/ | Pexels contributor |
| Kasavu Panel Kurti | `products/kasavu-v2.jpg` | https://www.pexels.com/photo/cotton-boll-on-beige-linen-fabric-close-up-32795036/ | Pexels contributor |
| Ilkal Angarkha Kurti | `products/ilkal-v2.jpg` | https://www.pexels.com/photo/gray-woven-fabric-texture-close-up-29060193/ | Engin Akyurt |
| Category: Everyday Kurtis | `categories/everyday-kurtis.jpg` | https://www.pexels.com/photo/stack-of-folded-fabrics-with-neutral-tones-35009337/ | mibernaa |
| Category: Occasion & Festive | `categories/occasion-kurtis.jpg` | https://www.pexels.com/photo/close-up-of-folded-silk-and-velvet-fabric-14935628/ | eugenia-remark |
| Category: Co-ord Sets | `categories/co-ord-sets.jpg` | https://www.pexels.com/photo/pile-of-cloth-365066/ | digitalbuggu |
| Home page hero | `hero/home-hero.jpg` | https://www.pexels.com/photo/artisan-textiles-hanging-in-indian-market-37415386/ | Harsh Kukadiya |
| Molakalmuru Border Co-ord | `products/molakalmuru.jpg` | https://www.pexels.com/photo/colorful-sarees-drying-at-varanasi-ghats-33433875/ | Debarshi Mukherjee |

## Replaced after a visual review

Three originals were market and street photographs. Chosen from a list they read
as "Indian textile"; cropped into a product card they read as a fort wall, a
shopfront and a rug. A picture of a building above a garment name and a price is
worse than a plain swatch. They were swapped for close-up cloth.

Colour is deliberately not matched to the product's stated colour. Stock
textures do not come in "Deep Maroon", and forcing the match would strengthen
exactly the implication these images must not make — that this is the garment.

## ⚠️ Before checkout opens

These images sit beside a product name, a price, a size and a stock count, and
the storefront carries a WhatsApp order CTA. That combination is a
representation of what a buyer receives. India's Consumer Protection
(E-Commerce) Rules 2020 require product images to be accurate.

Replace every one of these with photographs of the actual garment before
online ordering opens. Until then, label them as representative in the UI.
