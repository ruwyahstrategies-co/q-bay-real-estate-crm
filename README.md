# Real Estate AI

Build the complete frontend UI for a premium Real Estate Buyer Intelligence platform.

This phase is FRONTEND UI ONLY.

Do not create a backend.

Do not connect Supabase yet.

Do not connect OpenRouter yet.

Do not create fake functionality.

Do not generate dummy leads, properties, conversations, charts, statistics or activity.

Do not seed any example data.

The application must display polished empty states until real data is added in a later phase.

TECH STACK

- React

- TypeScript

- Vite

- Tailwind CSS

- React Router

- Lucide React icons

- Recharts for chart containers

- Clean reusable component architecture

- Desktop-first, but fully responsive

- Use strict TypeScript

- Avoid oversized components

- Avoid unnecessary animations

- Avoid excessive gradients and shadows

VISUAL REFERENCE

Recreate the attached dashboard design as closely as possible.

The interface must feel almost identical to the reference:

- Narrow solid-black vertical sidebar

- Large white application canvas

- Rounded application corners

- Soft pastel dashboard cards

- Strong black typography

- Generous whitespace

- Minimal borders

- Extremely subtle shadows

- Compact icon buttons

- Clean financial-dashboard-style information hierarchy

- Rounded cards between 14px and 20px

- No glassmorphism

- No neon styling

- No excessive decoration

Use approximately these colors:

- Sidebar: #171717

- Main background: #FAFAF8

- Page background: #FFFFFF

- Pastel blue: #DDEFFA

- Pastel purple: #E8DDF4

- Pastel green: #DCEEDD

- Pastel cream: #F3EDCE

- Primary text: #121212

- Secondary text: #727272

- Border: #E9E9E5

Use Inter or a similarly clean modern sans-serif font.

APPLICATION FRAME

The desktop layout should closely match the attached image:

- 76px to 84px black sidebar

- Sidebar fixed on the left

- White main content area

- Main content should have a large rounded-left edge where it meets the sidebar

- Main content padding around 28px to 34px

- Maximum content width should remain controlled on very large screens

- Smooth responsive transformation for tablets and mobile

- Mobile navigation should become a compact bottom navigation or slide-out navigation

SIDEBAR

Create an icon-focused sidebar matching the reference.

Top:

- Small cream-colored rounded-square logo container

- Use a minimal abstract building or property icon

- Keep the product name inside a configuration constant so it can be changed later

Navigation:

1. Overview

2. Leads

3. Properties

4. Conversations

5. Uploads

6. AI Insights

7. Pipeline

8. Team

9. AI Receptionist

10. Settings

Use Lucide icons.

The selected navigation item should have:

- Cream or white icon background

- Dark icon

- Small active indicator

- No oversized labels

On desktop, labels can appear through tooltips or an expanded-sidebar state.

AI RECEPTIONIST REQUIREMENT

The AI Receptionist navigation item must exist from the beginning.

However:

- It must remain completely non-functional

- Do not connect it to OpenRouter

- Do not build calling, voice or receptionist features

- Do not create fake receptionist activity

- Clicking it should open a clean “Coming Soon” page

- Show that it is a separate future module

- Include a small “Separate Module” badge

- Keep this restriction throughout all future phases

TOP HEADER

Match the reference image.

Include:

- Current page title on the left

- Search icon button

- Notification icon button

- User account button

- Small circular avatar placeholder using initials only

- User dropdown shell

- No fake notifications

- No fake user profile information

OVERVIEW PAGE

Recreate the exact composition and visual hierarchy of the attached dashboard, adapted to real estate buyer intelligence.

Header:

- Page title: Overview

- Section heading: Buyer Intelligence

Top dashboard area:

Create one large pastel-blue card on the left.

Large card content:

- Label: Active Pipeline

- Main value connected to the real lead database later

- Value should display 0 while there is no data

- Secondary label: Qualified Buyer Value

- Empty Recharts line-chart container

- Time filters:

  - 7D

  - 30D

  - 3M

  - 6M

  - 1Y

  - All

- Do not draw fake chart points

- Show a refined “No pipeline activity yet” state inside the chart area

Beside the large card, create four narrow pastel metric cards:

1. Hot Leads

2. High Intent

3. At Risk

4. New Leads

Each card must contain:

- Metric title

- Real count placeholder of 0

- Small icon

- Percentage-change area hidden until enough real historical data exists

- Three-dot menu button

- Different pastel background matching the reference

Lower dashboard area:

Left side:

- Heading: Recent Buyer Activity

- Filter dropdown for timeframe

- Filter dropdown for pipeline stage

- Compact table matching the reference

Columns:

- Buyer

- Interested Property

- Intent Score

- Pipeline Stage

- Last Interaction

- Assigned Agent

- Action

Do not populate rows.

Show a polished empty state:

“No buyer activity has been recorded.”

Right side:

Create a black promotional or intelligence card matching the reference image.

Content:

- Heading: Turn buyer behaviour into decisions

- Supporting text:

  “Analyse conversations, preferences and objections before the next follow-up.”

- Button: Review AI Insights

- Minimal abstract property-line graphic

- Do not show fake AI results

LEADS PAGE

Create the complete leads-management interface shell.

Include:

- Page title

- Search

- Filters

- Add Lead button

- Import Leads button

- Table and card view toggle

- Empty table

- Empty-state call to action

Lead table columns:

- Buyer

- Contact

- Budget

- Preferred Area

- Property Type

- Intent Score

- Pipeline Stage

- Assigned Agent

- Last Contact

- Actions

Add Lead drawer or modal fields:

- Full name

- Phone number

- Email

- Nationality as optional free text

- Preferred language

- Budget minimum

- Budget maximum

- Currency

- Preferred locations

- Property type

- Bedrooms

- Purchase purpose

- Buying timeline

- Financing status

- Lead source

- Assigned agent

- Notes

This is UI only. Submitting should not pretend the lead was saved.

LEAD PROFILE PAGE

Create a detailed lead profile layout with these tabs:

- Overview

- Conversations

- Property Interests

- Buyer Intelligence

- Files

- Tasks

- Activity

Profile header:

- Buyer initials

- Name

- Pipeline stage

- Intent score area

- Assigned agent

- Contact buttons

- Edit button

- Analyse Lead button, disabled until OpenRouter is connected

Buyer Intelligence sections:

- AI Summary

- Motivations

- Objections

- Urgency

- Budget Signals

- Decision Factors

- Risks

- Recommended Next Action

- Suggested Follow-Up

- Evidence

All sections must show an empty or “Not analysed yet” state.

PROPERTIES PAGE

Create a complete property-inventory interface.

Include:

- List and grid views

- Search

- Filters

- Add Property button

- Upload Properties button

- Property type filter

- Location filter

- Price filter

- Availability filter

Property fields:

- Property title

- Internal reference

- Property type

- Location

- Developer

- Price

- Currency

- Bedrooms

- Bathrooms

- Size

- Completion status

- Availability

- Description

- Amenities

- Images

- Brochure

- Floor plan

- Assigned sales team

Do not display sample property cards.

CONVERSATIONS PAGE

Create an interface for storing and reviewing buyer interactions.

Interaction types:

- WhatsApp

- Phone call

- Email

- Meeting

- Website enquiry

- Walk-in

- Manual note

Layout:

- Conversation list on the left

- Conversation detail in the centre

- Buyer context panel on the right

- Filters by source, agent, lead and date

- Upload conversation button

- Add interaction button

- Empty states only

Do not create a fake messaging application.

Do not make WhatsApp sending functional in this phase.

UPLOADS PAGE

This page is essential.

Create a professional upload centre with drag-and-drop areas.

Supported upload categories in the UI:

1. Lead databases

   - CSV

   - XLSX

2. WhatsApp exports

   - TXT

   - ZIP shell only

3. Property documents

   - PDF

   - DOCX

   - TXT

4. Property media

   - JPG

   - PNG

   - WEBP

5. Call recordings

   - MP3

   - WAV

   - M4A

6. Property brochures and floor plans

   - PDF

   - JPG

   - PNG

7. General sales documents

   - PDF

   - DOCX

   - CSV

   - TXT

Include:

- Drag-and-drop area

- Browse files button

- Upload category selector

- Lead association selector

- Property association selector

- Assigned agent selector

- File progress UI

- Processing status

- Uploaded by

- Uploaded date

- File size

- File actions

Do not simulate completed uploads.

Do not generate fake file records.

Actual uploads will be connected later.

AI INSIGHTS PAGE

Create the complete UI shell for AI-generated buyer intelligence.

Sections:

- Leads requiring attention

- High-intent buyers

- Leads losing interest

- Common objections

- Buyer motivation trends

- Preferred locations

- Budget distribution

- Property demand trends

- Recommended follow-ups

- Lost-deal patterns

Every section must use a refined empty state rather than fake charts.

PIPELINE PAGE

Create a real estate sales pipeline board with stages:

- New Lead

- Contacted

- Qualified

- Property Matching

- Viewing Scheduled

- Negotiation

- Documentation

- Won

- Lost

Do not create fake cards.

Include:

- Kanban layout

- List layout

- Filters

- Agent filter

- Value totals

- Empty-stage messages

- Add lead action

TEAM PAGE

Create a team-management and agent-performance UI shell.

Sections:

- Team members

- Assigned leads

- Follow-ups due

- Pipeline value

- Conversion rate

- Response time

- Closed deals

Do not show fake agent metrics.

SETTINGS PAGE

Create settings sections for:

- Organisation

- Team

- Lead fields

- Pipeline stages

- Property fields

- Upload settings

- AI settings

- Notifications

- Security

- Data retention

Do not expose API keys in the frontend.

COMPONENT REQUIREMENTS

Create reusable components for:

- AppSidebar

- AppHeader

- MetricCard

- EmptyState

- DataTable

- FilterBar

- UploadDropzone

- PageHeader

- StatusBadge

- IntentScore

- PipelineStageBadge

- EmptyChart

- ConfirmationDialog

- Drawer

- Modal

- LoadingSkeleton

ROUTING

Create real routes for every page.

Use nested routes for lead and property details.

Suggested structure:

/overview

/leads

/leads/:leadId

/properties

/properties/:propertyId

/conversations

/uploads

/ai-insights

/pipeline

/team

/ai-receptionist

/settings

QUALITY REQUIREMENTS

- No lorem ipsum

- No fake statistics

- No sample buyers

- No sample properties

- No sample conversations

- No fake notifications

- No generated chart activity

- No non-functional buttons pretending to work

- Buttons that require a backend should be visibly disabled or open an explanatory UI state

- Make empty states look intentional and premium

- Ensure the TypeScript build is clean

- Ensure the application has no console errors

- Ensure the layout closely matches the attached reference

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a8f19748-ac89-4347-8522-fbad8109b608).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
