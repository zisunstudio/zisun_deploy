# Monetization Strategy & Unit Economics

> **Document ID:** REQ-16  
> **Version:** 1.0  
> **Owner:** Business Lead  
> **PRD Source:** Section 16 (Lines 839-863)

---

## 1. Overview

This document outlines the business model and unit economics for the ZISUN platform. Understanding the revenue model ensures the engineering team builds features that directly support profitability (e.g., prioritizing checkout conversion over complex but non-revenue-generating features).

---

## 2. Revenue Models

### 2.1 Phase 1–2: Direct Margin (1P Model)
For the first 6 months, ZISUN operates as a first-party (1P) retailer holding its own inventory.
- **Model:** Buy wholesale, sell retail.
- **Margin:** Target 40%–60% gross margin on apparel. (e.g., ₹200–₹500 profit per item).
- **Positioning:** Priced at a deliberate premium compared to mass-market platforms (Meesho, Flipkart). The premium is justified by the high-quality editorial content feed and curated aesthetic.

### 2.2 Phase 3–4: Platform Revenue (Marketplace Model)
As the platform scales to 10k+ users, it transitions to a marketplace model.
- **Vendor Commission:** 5%–15% GMV commission on third-party vendor sales.
- **Featured Placement:** Vendors pay ₹15,000–₹50,000 per campaign for premium placement in the content feed (e.g., Sponsored Occasion Bundles).
- **Subscription Services (Phase 4):** Premium AI styling service (e.g., ₹299–₹499/month) providing personalized weekly outfit curation.

---

## 3. Unit Economics (MVP Targets)

To achieve break-even on standard monthly infrastructure and operational costs (estimated at ₹50,000/month for Phase 1), the platform must meet specific unit economic targets.

### 3.1 Target Breakdown per Order

| Metric | Amount | Percentage of AOV |
|--------|--------|-------------------|
| **Average Order Value (AOV)** | **₹900** | **100%** |
| COGS (Product Cost) | - ₹450 | 50% |
| Fulfillment (Shiprocket) | - ₹80 | 8.8% |
| Payment Gateway (Razorpay ~2%) | - ₹18 | 2.0% |
| **Gross Profit per Order** | **₹352** | **39.1%** |

### 3.2 Break-Even Calculation

- **Monthly Fixed Costs (Est.):** ₹50,000 (Servers, SaaS tools, basic ops).
- **Target Gross Margin:** ₹352 per order.
- **Break-Even Volume:** `50,000 / 352` = **142 orders per month**.

*Engineering Note:* Every fractional percentage drop in payment success rate or cart abandonment directly impacts the 142-order threshold. Performance optimizations (reducing load times) directly increase the conversion rate, hitting break-even faster.
