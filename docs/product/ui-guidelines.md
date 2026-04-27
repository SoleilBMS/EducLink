# EducLink UI Guidelines (V3-01 Foundation)

## 1) Brand Identity
EducLink visual identity should communicate a modern, trustworthy, and practical EdTech SaaS product for schools.

- **Logo:** EducLink wordmark with graduation cap mark.
- **Slogan:** _"L’école connectée, intelligente et simplifiée"_.
- **Core personality:** clean, calm, efficient, intelligent.
- **Design intent:** reduce cognitive load for school staff and families while preserving information density.

---

## 2) Color System

### Core palette
- **Primary Blue:** `#2563EB`
- **Dark Blue:** `#1E3A8A`
- **Primary Green:** `#22C55E`
- **Primary Purple:** `#7C3AED`
- **Soft Green:** `#4ADE80`
- **Soft Purple:** `#A78BFA`
- **Background:** `#F9FAFB`
- **White:** `#FFFFFF`
- **Main Text:** `#111827`
- **Secondary Text:** `#687280`
- **Border:** `#E5E7EB`

### Brand gradient
Use the identity gradient for primary emphasis areas (hero accents, primary CTAs, highlighted pills):

`#22C55E → #2563EB → #7C3AED`

### Usage guidance
- Prefer **Primary Blue** for links and standard actions.
- Use gradient and Purple selectively to avoid visual noise.
- Keep dense data surfaces mostly neutral (white backgrounds, subtle borders).
- Maintain text contrast at WCAG-friendly levels.

---

## 3) Typography

- **Primary font:** `Inter` (fallback: system sans-serif stack).
- **Body default:** 16px / 1rem.
- **Scale:**
  - XS: 12px
  - SM: 14px
  - Base: 16px
  - LG: 18px
  - XL: 20px
- **Heading behavior:** short, direct, role-oriented labels.
- **Text colors:**
  - Main content: `#111827`
  - Supportive/meta text: `#687280`

---

## 4) Spacing
Use a compact 4px-based scale:

- 4px, 8px, 12px, 16px, 20px, 24px, 32px

Guideline:
- Page padding: 24px
- Section spacing: 16–24px
- Form control internal padding: 8px–12px
- Dense table cell spacing: 8px–12px

---

## 5) Buttons

### Primary button
- Gradient background (`green → blue → purple`)
- White text
- Medium radius
- Visible focus ring

### Secondary button
- White/light background
- Blue text
- Border `#E5E7EB`

### Behavior
- Hover: mild brightness shift
- Focus: 2px visible outline
- Disabled: reduce opacity and remove hover effect

---

## 6) Cards
Cards are used for panels, forms, summaries, and dashboard blocks.

- Surface: `#FFFFFF`
- Border: `#E5E7EB`
- Radius: medium to large (10–14px)
- Shadow: subtle only
- Internal spacing: 16–24px

---

## 7) Forms

- Inputs/selects/textareas have:
  - white background
  - neutral border
  - medium radius
  - consistent horizontal and vertical padding
- Labels should appear close to controls, with clear hierarchy.
- Errors should use a distinct danger text color and be easy to scan.
- Keep forms simple in server-rendered flows; avoid decorative complexity.

---

## 8) Badges
Badges indicate role, state, or metadata.

- Rounded pill shape
- Compact text (12px)
- Light tinted background and high-contrast text
- Example usage: role, tenant, status

---

## 9) Tables

- Use full-width tables within content containers.
- Header row uses subtle tinted background.
- Clear border separators.
- Left-aligned text by default.
- Keep row density readable for administrative data entry.

---

## 10) Layout Principles

- Use a central content shell for most pages.
- Prioritize readable single-column flow for current server-rendered views.
- Keep top-level pages task-driven (What can this role do now?).
- Preserve existing navigation and route behavior.
- Apply foundational styling globally before component-level redesign.

---

## 11) Accessibility Notes

- Ensure keyboard focus visibility on links, controls, and buttons.
- Keep interactive targets comfortably clickable.
- Preserve semantic HTML and label-to-control association.
- Verify color contrast for text and key controls.
- Avoid using color alone to encode critical status meaning.

---

## 12) V3-01 Scope Guardrails

For this milestone:
- ✅ establish design tokens and baseline visual language
- ✅ style primitive HTML elements and a few reusable classes
- ❌ do not redesign every feature page
- ❌ do not introduce frontend framework changes
- ❌ do not modify backend behavior
