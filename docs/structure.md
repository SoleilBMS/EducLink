educlink/
├─ README.md
├─ PRD.md
├─ ARCHITECTURE.md
├─ TASKS.md
├─ .env.example
├─ .gitignore
├─ package.json
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
├─ docs/
│  ├─ product/
│  │  ├─ personas.md
│  │  ├─ user-journeys.md
│  │  ├─ business-rules.md
│  │  ├─ roadmap.md
│  │  └─ pricing-notes.md
│  ├─ ux/
│  │  ├─ information-architecture.md
│  │  ├─ navigation.md
│  │  ├─ dashboard-principles.md
│  │  └─ ui-guidelines.md
│  ├─ data/
│  │  ├─ domain-model.md
│  │  ├─ entities.md
│  │  ├─ permissions-matrix.md
│  │  └─ audit-events.md
│  ├─ api/
│  │  ├─ conventions.md
│  │  ├─ auth.md
│  │  ├─ students.md
│  │  ├─ attendance.md
│  │  ├─ grading.md
│  │  ├─ messaging.md
│  │  └─ finance.md
│  └─ ai/
│     ├─ ai-principles.md
│     ├─ prompts.md
│     ├─ guardrails.md
│     └─ use-cases.md
├─ apps/
│  ├─ web/
│  │  ├─ app/
│  │  │  ├─ (public)/
│  │  │  │  ├─ login/
│  │  │  │  └─ forgot-password/
│  │  │  ├─ (dashboard)/
│  │  │  │  ├─ admin/
│  │  │  │  │  ├─ dashboard/
│  │  │  │  │  ├─ schools/
│  │  │  │  │  ├─ classes/
│  │  │  │  │  ├─ subjects/
│  │  │  │  │  ├─ students/
│  │  │  │  │  ├─ parents/
│  │  │  │  │  ├─ teachers/
│  │  │  │  │  ├─ attendance/
│  │  │  │  │  ├─ homework/
│  │  │  │  │  ├─ grades/
│  │  │  │  │  ├─ messages/
│  │  │  │  │  ├─ documents/
│  │  │  │  │  └─ finance/
│  │  │  │  ├─ director/
│  │  │  │  │  ├─ dashboard/
│  │  │  │  │  ├─ analytics/
│  │  │  │  │  └─ students/
│  │  │  │  ├─ teacher/
│  │  │  │  │  ├─ dashboard/
│  │  │  │  │  ├─ classes/
│  │  │  │  │  ├─ attendance/
│  │  │  │  │  ├─ homework/
│  │  │  │  │  ├─ grades/
│  │  │  │  │  └─ messages/
│  │  │  │  ├─ parent/
│  │  │  │  │  ├─ dashboard/
│  │  │  │  │  ├─ children/
│  │  │  │  │  ├─ homework/
│  │  │  │  │  ├─ grades/
│  │  │  │  │  ├─ messages/
│  │  │  │  │  ├─ documents/
│  │  │  │  │  └─ finance/
│  │  │  │  ├─ student/
│  │  │  │  │  ├─ dashboard/
│  │  │  │  │  ├─ homework/
│  │  │  │  │  ├─ grades/
│  │  │  │  │  └─ messages/
│  │  │  │  └─ accountant/
│  │  │  │     ├─ dashboard/
│  │  │  │     ├─ invoices/
│  │  │  │     └─ payments/
│  │  │  ├─ api/
│  │  │  │  ├─ auth/
│  │  │  │  ├─ schools/
│  │  │  │  ├─ academics/
│  │  │  │  ├─ students/
│  │  │  │  ├─ parents/
│  │  │  │  ├─ teachers/
│  │  │  │  ├─ attendance/
│  │  │  │  ├─ homework/
│  │  │  │  ├─ grading/
│  │  │  │  ├─ messaging/
│  │  │  │  ├─ documents/
│  │  │  │  ├─ finance/
│  │  │  │  ├─ analytics/
│  │  │  │  └─ ai/
│  │  │  ├─ layout.tsx
│  │  │  ├─ page.tsx
│  │  │  └─ globals.css
│  │  ├─ components/
│  │  │  ├─ ui/
│  │  │  ├─ layout/
│  │  │  ├─ dashboard/
│  │  │  ├─ forms/
│  │  │  ├─ tables/
│  │  │  └─ domain/
│  │  ├─ features/
│  │  │  ├─ auth/
│  │  │  ├─ schools/
│  │  │  ├─ academics/
│  │  │  ├─ students/
│  │  │  ├─ parents/
│  │  │  ├─ teachers/
│  │  │  ├─ attendance/
│  │  │  ├─ homework/
│  │  │  ├─ grading/
│  │  │  ├─ messaging/
│  │  │  ├─ documents/
│  │  │  ├─ finance/
│  │  │  ├─ analytics/
│  │  │  └─ ai/
│  │  ├─ lib/
│  │  │  ├─ auth/
│  │  │  ├─ permissions/
│  │  │  ├─ tenant/
│  │  │  ├─ api/
│  │  │  ├─ validations/
│  │  │  └─ utils/
│  │  └─ tests/
│  │     ├─ unit/
│  │     ├─ integration/
│  │     └─ e2e/
│  └─ worker/
│     ├─ src/
│     │  ├─ jobs/
│     │  ├─ notifications/
│     │  ├─ ai/
│     │  └─ shared/
│     └─ package.json
├─ packages/
│  ├─ ui/
│  │  ├─ src/
│  │  │  ├─ components/
│  │  │  ├─ tokens/
│  │  │  └─ styles/
│  │  └─ package.json
│  ├─ config/
│  │  ├─ eslint/
│  │  ├─ typescript/
│  │  └─ tailwind/
│  ├─ types/
│  │  ├─ src/
│  │  │  ├─ auth.ts
│  │  │  ├─ school.ts
│  │  │  ├─ student.ts
│  │  │  ├─ attendance.ts
│  │  │  ├─ grading.ts
│  │  │  ├─ finance.ts
│  │  │  └─ index.ts
│  │  └─ package.json
│  ├─ database/
│  │  ├─ schema/
│  │  ├─ migrations/
│  │  ├─ seeds/
│  │  ├─ src/
│  │  │  ├─ client.ts
│  │  │  ├─ models/
│  │  │  ├─ repositories/
│  │  │  └─ queries/
│  │  └─ package.json
│  ├─ auth/
│  │  ├─ src/
│  │  │  ├─ guards/
│  │  │  ├─ session/
│  │  │  ├─ roles/
│  │  │  └─ permissions/
│  │  └─ package.json
│  ├─ domain/
│  │  ├─ src/
│  │  │  ├─ schools/
│  │  │  ├─ academics/
│  │  │  ├─ students/
│  │  │  ├─ parents/
│  │  │  ├─ teachers/
│  │  │  ├─ attendance/
│  │  │  ├─ homework/
│  │  │  ├─ grading/
│  │  │  ├─ messaging/
│  │  │  ├─ documents/
│  │  │  ├─ finance/
│  │  │  ├─ analytics/
│  │  │  └─ ai/
│  │  └─ package.json
│  ├─ validations/
│  │  ├─ src/
│  │  │  ├─ auth/
│  │  │  ├─ schools/
│  │  │  ├─ students/
│  │  │  ├─ attendance/
│  │  │  ├─ grading/
│  │  │  └─ finance/
│  │  └─ package.json
│  └─ ai/
│     ├─ src/
│     │  ├─ providers/
│     │  ├─ prompts/
│     │  ├─ services/
│     │  └─ guardrails/
│     └─ package.json
├─ infra/
│  ├─ docker/
│  ├─ ci/
│  ├─ hosting/
│  ├─ monitoring/
│  └─ scripts/
└─ .github/
   ├─ ISSUE_TEMPLATE/
   │  ├─ feature.md
   │  ├─ bug.md
   │  └─ chore.md
   ├─ workflows/
   │  ├─ ci.yml
   │  ├─ lint.yml
   │  └─ test.yml
   └─ pull_request_template.md
