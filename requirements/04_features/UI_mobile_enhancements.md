# Project: ZISUN Mobile UI Enhancements

**Executive Summary:** This task refines ZISUN’s mobile app UI for improved trust and usability. We will update the **trust-badge bar** to match the warm brand palette, adjust **category image cropping** to emphasize clothing (not just faces), and strengthen the **active tab indicator** in the bottom navigation. The deliverable is a production-ready requirements spec (mobile-first, 9:16) for a UI/UX engineer. 

## Goals  
- **Improve Visual Trust:** Restyle trust badges with brand-aligned colors and higher legibility to boost user confidence.  
- **Emphasize Products:** Ensure category images show full clothing items using focal-point or smart cropping algorithms, so key product details aren’t cut off.  
- **Enhance Navigation Feedback:** Make the active bottom-tab more prominent with clear color and motion cues (e.g. underline or icon scaling) to guide users in the app.  
- **Maintain Performance:** UI changes must preserve fast load (<2s) and responsive behavior (lazy load images, optimize assets).

## Acceptance Criteria  
- **Trust-Badge Update:** The trust-badge bar uses brand warm colors (e.g. `primary-500` background, white text) and meets 4.5:1 contrast. Icons/text are legible on mobile and resize gracefully.  
- **Category Grid Cropping:** Images in category cards are cropped via `object-fit: cover` with focal points on the garment. Clothing is visible (not just faces). If no focal data, default `center` crop is used.  
- **Active Tab Indicator:** The selected tab icon/text uses the brand’s primary color and includes a 2–4px underline or indicator dot. Tapping a tab animates the indicator and icon.  
- **Responsive Layout:** All views optimized for a 9:16 portrait viewport. Layout adapts gracefully at narrow widths (~360px min).  
- **Accessibility & QA:** UI components meet WCAG AA (contrast, touch targets ≥44×44px). All changes are unit tested and visually regression tested.

## Visual Design Specifications  

| **Design Tokens**   | **Value / Example**                     | **Purpose**                         |
|---------------------|-----------------------------------------|-------------------------------------|
| Primary Color       | `#E63946` (red-600)                     | Brand accent (e.g. trust badge BG, active tab) |
| Secondary Color     | `#F4A261` (orange-400)                  | Highlight accents (e.g. badge icon BG) |
| Text Color - Dark   | `#222222` (gray-900)                    | Primary text                        |
| Text Color - Light  | `#FFFFFF`                                | Badge text on dark BG               |
| Background Color    | `#FFFFFF` / `bg-white`                  | Canvas                             |
| Font Family         | *Inter*, *Roboto*, *sans-serif*         | Use system/sans for body & labels   |

- **Typography:** Headings ~20–24px (mobile), body text 16px, small labels 12–14px. Ensure 4.5:1 contrast for text on backgrounds (per WCAG).  
- **Iconography:** Use Material/FontAwesome-style icons. Inactive icons use neutral gray (`text-gray-600`), active tabs use `primary-500`. Badge icons are white-on-primary BG or primary-on-white.

## Component Behavior & States  

### Trust Badge Bar  
- **Layout:** Full-width horizontal bar (height ~48px) fixed above footer. Contains up to 3 badges (e.g. *“Free shipping”*, *“30-day returns”*, *“Secure payment”*). Each badge: icon + short text.  
- **Colors:** BG = Primary-500, Icon = white, Text = white. (E.g. Tailwind `bg-primary text-white`.)

### Category Cards (Image Cropping)  
- **Aspect Ratio:** Cards are 1:1 squares or portrait feeds.  
- **Image Handling:** Use CSS `object-fit: cover`. If image focal metadata is available, apply it via `object-position: X% Y%`.  
- **Fallback:** If no focal data, default `object-position: 50% 25%` to favor the upper body over the strict center.

### Bottom Navigation Bar  
- **Layout:** Fixed bottom; 4–5 icons. Height ~64px including safe area.  
- **Active State:** Active icon and label use `Primary-500`. Underline: a solid 3px line (brand color) under active icon/label.  
- **Inactive State:** Icon & label `text-gray-600`, no underline/dot.
