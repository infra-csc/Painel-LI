# Event Production Management System - Design Guidelines

## Design Approach
**Design System Foundation:** Linear-inspired productivity interface with Carbon Design data table patterns  
**Rationale:** Administrative productivity tools require clarity, efficiency, and familiar patterns for data-heavy workflows. Drawing from Linear's refined aesthetics and Carbon's robust data display conventions.

## Core Design Elements

### Typography
- **Primary Font:** Inter (Google Fonts)
- **Headings:** 
  - H1: text-2xl font-semibold (Dashboard titles)
  - H2: text-xl font-semibold (Section headers)
  - H3: text-base font-medium (Card headers, table headers)
- **Body:** text-sm font-normal (Table content, form labels, descriptions)
- **Meta:** text-xs (Timestamps, status badges, helper text)

### Layout System
**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16 only
- Micro spacing (p-2, gap-2): Between related elements
- Standard spacing (p-4, gap-4): Card padding, form field spacing
- Section spacing (p-6, gap-6): Component separation
- Page spacing (p-8): Main content padding
- Large gaps (gap-12, gap-16): Between major sections

**Grid Structure:**
- Sidebar: 256px fixed width (w-64)
- Main content: Remaining flex space with max-w-7xl container
- Table layouts: w-full with responsive scroll
- Form layouts: max-w-2xl for optimal readability

### Component Library

**Navigation & Layout:**
- **Sidebar Navigation:** Fixed left sidebar with logo at top, grouped navigation items with icons, user profile at bottom
- **Top Bar:** Search bar (w-96), action buttons, notifications, user avatar in right corner
- **Breadcrumbs:** Below top bar showing current location hierarchy

**Data Display:**
- **Tables:** 
  - Row height: h-12
  - Hover states on rows
  - Sticky headers
  - Column sorting indicators
  - Pagination at bottom (showing "1-10 of 234 results")
  - Bulk action checkboxes in first column
  - Action menu (3-dot) in last column
  
- **Cards:** 
  - Border treatment with rounded-lg
  - Padding p-6
  - Shadow: shadow-sm
  - Stats cards: Grid of 4 (grid-cols-4) showing KPIs with large numbers and trend indicators

**Forms & Inputs:**
- **Input Fields:** 
  - Height: h-10
  - Padding: px-3
  - Border: border with rounded-md
  - Labels: text-sm font-medium mb-1.5
  - Helper text: text-xs below field
  
- **Search Bar:**
  - Icon on left (magnifying glass)
  - Placeholder text
  - Rounded-full design
  - Backdrop blur effect

**Filters & Controls:**
- **Filter Panel:** 
  - Collapsible sidebar (w-72) or top horizontal bar
  - Group filters by category with dividers
  - Checkbox groups, date pickers, select dropdowns
  - "Clear all" and "Apply filters" actions at bottom
  
- **Quick Filters:** 
  - Pill-style buttons above tables
  - Active state with filled background
  - Count badges showing filtered results

**Buttons:**
- **Primary:** h-10 px-4 rounded-md font-medium
- **Secondary:** h-10 px-4 rounded-md with border
- **Ghost:** h-10 px-4 text button
- **Icon Buttons:** w-10 h-10 rounded-md centered icon

**Status Badges:**
- Pill-shaped with rounded-full
- Small text (text-xs)
- Padding: px-2.5 py-0.5
- Variants for: Active, Pending, Completed, Cancelled

**Modals & Overlays:**
- **Modal:** max-w-2xl centered with backdrop blur
- **Dropdown Menus:** Elevation shadow-lg, rounded-lg, min-w-48
- **Toast Notifications:** Fixed top-right, stacked vertically with gap-2

### Page Layouts

**Dashboard View:**
- Stats cards grid at top (4 columns)
- Recent activity table below
- Quick actions panel on right (w-80)

**List/Table View:**
- Filter panel collapsible on left
- Search + bulk actions bar
- Data table with sorting/pagination
- Empty states with illustrations and CTAs when no data

**Detail/Edit View:**
- Two-column layout on large screens
- Form fields on left (max-w-2xl)
- Related information panel on right (w-80)
- Action buttons fixed at bottom or top-right

**Create/New View:**
- Single column centered form (max-w-2xl)
- Multi-step wizard with progress indicator for complex forms
- Action buttons at bottom (Cancel + Save/Create)

### Images
**No hero images** - Administrative interface focuses on efficiency over marketing visuals.

**Supporting Images:**
- **Empty States:** Illustration-style graphics (300x200px) when tables/lists are empty
- **User Avatars:** 32px circular in navigation, 40px in profiles, 24px in table rows
- **Event Thumbnails:** 120x80px in table rows, 240x160px in detail views
- **Team Logos:** Square 48x48px in lists, 96x96px in detail headers

### Animations
**Minimal Motion:**
- Hover transitions: transition-colors duration-150
- Modal/dropdown appearance: Fade + scale (200ms)
- Loading states: Subtle pulse animation
- No scroll-driven or complex animations

### Accessibility
- All interactive elements minimum 44px touch target
- Focus rings on all focusable elements (ring-2 ring-offset-2)
- ARIA labels on icon-only buttons
- Semantic HTML structure (nav, main, aside, section)
- Skip to main content link
- Form validation with clear error messages below fields