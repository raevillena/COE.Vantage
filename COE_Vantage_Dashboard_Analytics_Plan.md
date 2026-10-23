# COE.Vantage Dashboard Analytics and Projection Plan

## 1. Objective

Build a dashboard for **COE.Vantage** that provides useful scheduling analytics, utilization metrics, and projections while remaining **fast to load**. The dashboard should answer three questions at a glance:

1. **What is already scheduled?**
2. **Where are the gaps and bottlenecks?**
3. **What is likely to happen if the remaining requirements are scheduled?**

The dashboard should summarize data rather than load every schedule block, faculty record, or room record up front. Detailed data should load only when a user opens a specific analytics view.

---

## 2. Dashboard Overview

The initial dashboard should contain four compact KPI cards:

| KPI | What it shows | Suggested calculation |
|---|---|---|
| Curriculum scheduled | Percentage of required curriculum hours already scheduled | Scheduled required hours ÷ total required hours × 100 |
| Faculty utilization | Assigned teaching units compared with the applicable workload limit | Assigned units ÷ maximum units × 100 |
| Room utilization | Occupied room-hours compared with available room-hours | Occupied hours ÷ available hours × 100 |
| Scheduling gaps | Count of unresolved requirements or scheduling issues | Count of applicable unscheduled requirements and actionable issues |

Also show:

- **One compact projection chart** comparing current and projected scheduling completion or workload.
- **Three prioritized alerts**, such as subjects with remaining hours, faculty approaching or exceeding workload limits, and room capacity or laboratory suitability mismatches.
- A clear academic-year and semester context, with filters appropriate to the user's permissions.

Avoid loading detailed lists or all schedule blocks on the initial page.

---

## 3. Core Analytics

### 3.1 Curriculum Completion

Show whether the curriculum requirements for the selected academic year, semester, class, and year level are fully scheduled.

Useful measures:

- Total required lecture and laboratory hours per week.
- Hours already scheduled.
- Remaining hours.
- Percentage complete.
- Number of fully scheduled, partially scheduled, and unscheduled subjects.
- Breakdown by class, year level, semester, or department where authorized.

**Calculation approach**

- Reuse the application's existing curriculum status and required-minutes logic.
- Preserve the current rules: lecture units count as one hour per week, while laboratory units count as three hours per week.
- Compare scheduled meeting time against the required time using the same normalization rules as the scheduler.
- Do not count subjects outside the applicable curriculum and year level.

### 3.2 Faculty Workload and Utilization

Show how teaching assignments compare with faculty workload limits and identify likely workload problems before auto-assignment.

Useful measures:

- Assigned teaching units.
- Maximum workload units, and minimum units if that setting is implemented.
- Percentage of maximum workload used.
- Faculty below, near, at, or above the applicable limit.
- Projected workload after remaining eligible subjects are assigned.
- Subjects that cannot be assigned without exceeding limits or violating eligibility rules.

**Important counting rule:** Calculate teaching units from distinct subject–class assignments, not from the number of meeting blocks. Display scheduled contact hours separately from teaching units.

The projection must account for faculty eligibility, department scope, workload limits, and existing assignments. Do not count pending cross-department requests as confirmed scheduled workload unless the application's business rules explicitly change.

### 3.3 Room and Laboratory Utilization

Show how effectively available rooms are being used, while distinguishing actual occupancy from suitability.

Useful measures:

- Occupied room-hours and available room-hours.
- Utilization by room and by time period.
- Most-used and least-used rooms.
- Peak periods and periods with spare capacity.
- Capacity mismatches between a class and a room.
- Laboratory or equipment requirements that a room does not satisfy.
- Room availability restrictions, including term-specific availability.

**Counting rule:** Count each room booking once. Exclude unavailable time periods from the available-room denominator, and account for room capacity and required facilities when identifying suitable rooms. A room being empty does not mean it is a valid option for every class.

### 3.4 Scheduling Quality and Bottlenecks

Provide actionable issue counts instead of loading every conflict record on the dashboard.

Useful indicators:

- Faculty scheduling conflicts.
- Room scheduling conflicts.
- Subjects with remaining required hours.
- Classes with no eligible faculty candidate.
- Classes with no suitable room.
- Capacity or laboratory suitability mismatches.
- Auto-scheduling failures, grouped by reason.
- Schedule-copy or assignment success rate, if the application records reliable outcomes.

Reuse existing conflict checks and scheduler validation logic wherever possible. Avoid creating a second, inconsistent definition of a scheduling conflict.

---

## 4. Projection and Planning

The projection should be based on remaining curriculum requirements and actual assignment constraints, not on arbitrary completion percentages.

### 4.1 Curriculum Projection

For the selected scope:

1. Calculate total required lecture and laboratory hours.
2. Calculate the hours currently scheduled using the same rules as the curriculum status feature.
3. Calculate remaining hours as `max(0, required hours - scheduled hours)`.
4. Calculate completion percentage as `scheduled required hours / total required hours × 100`, handling a zero denominator safely.
5. Estimate how much remaining demand can be scheduled under current faculty, room, and conflict constraints.
6. Report unresolved demand separately when valid assignments cannot be found.

### 4.2 Faculty Workload Projection

Estimate faculty workload after proposed remaining assignments.

The projection should:

- Start with confirmed existing subject–class assignments.
- Consider only faculty eligible for the subject and applicable department.
- Respect maximum workload limits and any implemented minimum workload rules.
- Preserve existing assignments unless the user explicitly initiates a rescheduling operation.
- Distinguish confirmed workload from hypothetical or proposed assignments.
- Flag subjects that have no eligible faculty candidate.

A projected assignment is an estimate, not a saved schedule. Clearly label projected values and do not persist them as actual assignments unless the user confirms an action.

### 4.3 Room Demand Projection

Estimate the remaining demand for suitable rooms by distinguishing lecture and laboratory requirements.

Consider:

- Room capacity versus class size.
- Laboratory and equipment requirements.
- Room ownership and term-specific availability.
- Existing room bookings and time conflicts.
- Faculty availability and other scheduler constraints.

If no suitable room is available, show the unresolved demand and the reason where available. Do not assume all empty rooms are interchangeable.

### 4.4 Historical Trends

Add term-to-term comparisons only if reliable historical snapshots or archived schedules are available.

Possible trends:

- Curriculum completion by semester.
- Faculty workload distribution.
- Room utilization.
- Frequency and types of scheduling bottlenecks.
- Auto-scheduling success rate.

Do not manufacture historical values from the current schedule. If historical data is not retained, defer this feature until a reliable baseline can be collected.

---

## 5. Performance and Data-Loading Strategy

The dashboard must be designed around **small summary responses and on-demand detail**.

### 5.1 Initial Load

The first dashboard request should return only:

- Selected academic year and semester context.
- Four KPI values.
- A small set of projection totals.
- A few prioritized alerts.
- Any minimal chart data needed for the initial view.

Do not return every faculty member, room, subject, or schedule block in the summary response.

### 5.2 On-Demand Details

Load detailed data only when the user opens a metric or alert. For example:

- Selecting faculty utilization loads a paginated faculty workload breakdown.
- Selecting room utilization loads room-level utilization details.
- Selecting curriculum completion loads the relevant subject and class breakdown.
- Selecting an alert loads the specific issues behind it.

Use server-side pagination and filtering for long lists.

### 5.3 Server-Side Aggregation

Prefer database aggregation over sending raw records to the browser and calculating everything in React.

Recommended practices:

- Use Prisma `select` to fetch only fields required for a calculation.
- Use SQL aggregation or grouped queries for counts, sums, and utilization totals where appropriate.
- Avoid loading full related objects when IDs, counts, or numeric fields are sufficient.
- Reuse existing business rules for curriculum hours, workload units, room availability, and conflicts.
- Avoid duplicate queries for metrics that can be calculated together safely.
- Profile expensive queries before adding more complex infrastructure.

### 5.4 Caching and Invalidation

Cache summary results by the relevant scope, such as:

- Academic year.
- Semester.
- Department or authorized organizational scope.
- User role or other access constraints where necessary.

Invalidate or refresh affected summaries after changes to schedules, faculty assignments, room availability, curriculum data, auto-assignment, schedule copying, or schedule reset.

Ensure cached data cannot leak information across departments or roles. If reliable invalidation is not ready, use a short-lived cache or skip caching rather than serve stale or incorrectly scoped data.

### 5.5 Separate Summary and Export Workloads

The dashboard summary API should not generate Excel reports or return export-sized datasets. Keep downloadable reports and detailed analytics in separate, explicitly requested operations.

---

## 6. Suggested API Structure

Adapt route names to the application's existing routing conventions.

### `GET /dashboard/summary`

**Purpose:** Lightweight initial dashboard load.

**Possible query parameters:**

- `academicYearId`
- `semester`

**Possible response sections:**

- `context`: selected term and authorized scope.
- `kpis`: curriculum completion, faculty utilization, room utilization, and scheduling gaps.
- `projection`: current completion, remaining demand, and estimated schedulable demand.
- `alerts`: a small, prioritized list with counts and references to detail views.

Return aggregated numbers and concise labels rather than complete related records.

### `GET /dashboard/analytics`

**Purpose:** Detailed analytics for a selected metric.

**Possible query parameters:**

- `academicYearId`
- `semester`
- `metric` — for example, `faculty-workload`, `room-utilization`, `curriculum-completion`, or `scheduling-gaps`.
- `departmentId`, when permitted.
- `page` and `pageSize` for paginated results.
- Relevant search or status filters.

Validate all filters and enforce authorization on the server.

### `GET /dashboard/trends`

**Purpose:** Historical comparisons, loaded only when requested.

Use this endpoint only when the application has reliable historical data for the requested periods.

---

## 7. Role-Based Scope

The server must determine what data a user is allowed to see. Hiding a card or filter in the frontend is not sufficient authorization.

| Role | Suggested dashboard scope |
|---|---|
| Admin | College-wide or system-wide metrics, according to actual permissions |
| Dean | Authorized college/department summaries and comparisons |
| Chairman | Department-level curriculum, faculty, room, and scheduling metrics |
| Faculty | Personal workload and schedule information only |

These are suggested defaults. Match the final scope to the application's existing role and authorization rules.

---

## 8. Implementation Phases

### Phase 1 — Lightweight Overview

- Add the summary endpoint.
- Display the four KPI cards.
- Add a compact projection chart.
- Show a few prioritized alerts.
- Enforce academic-term and role scope.
- Confirm the initial page does not fetch all schedule blocks.

### Phase 2 — Detailed Utilization

- Add paginated faculty workload details.
- Add room utilization and suitability details.
- Add curriculum completion breakdowns.
- Link each alert to the relevant detail view.

### Phase 3 — Constraint-Aware Projection

- Estimate schedulable remaining curriculum demand.
- Project faculty workloads.
- Estimate suitable room demand.
- Report unresolved demand and reasons.
- Clearly separate hypothetical projections from saved assignments.

### Phase 4 — Historical Trends

- Establish reliable term snapshots or use retained historical schedules.
- Add term-to-term comparison charts.
- Track changes in completion, utilization, and scheduling bottlenecks.

---

## 9. Recommended Dashboard Layout

A simple layout is sufficient:

1. **Header:** academic year, semester, and authorized scope.
2. **KPI row:** curriculum completion, faculty utilization, room utilization, scheduling gaps.
3. **Projection panel:** current versus projected completion and remaining demand.
4. **Priority alerts:** a short list of the most actionable issues.
5. **Details on demand:** expandable or navigable analytics pages with filters and pagination.

Keep charts compact and purposeful. Avoid multiple large charts on the initial screen if they require heavy queries or do not lead to a clear action.

---

## 10. Design and Correctness Rules

- **Keep the first load small.** Summary first, details only on demand.
- **Reuse the source of truth.** Do not reimplement curriculum, workload, availability, or conflict rules differently in analytics.
- **Separate units from hours.** Teaching units and scheduled contact hours are different measures.
- **Label projections clearly.** Estimated assignments must not appear as confirmed schedule data.
- **Show unresolved demand.** Do not hide subjects that cannot be assigned.
- **Respect authorization everywhere.** Apply role and department scope in every query, including cached results.
- **Do not invent history.** Historical trends require retained, reliable data.
- **Optimize based on measurement.** Begin with database aggregation and modest caching; add materialized summaries or persisted analytics only if profiling shows they are needed.

---

## 11. Recommended Starting Point

Build the first version around three signature insights:

1. **Curriculum completion:** What required teaching time remains unscheduled?
2. **Projected faculty workload:** Which eligible faculty members have capacity, and who may exceed workload limits?
3. **Room utilization and suitability:** Where is there usable room capacity, and which remaining requirements lack an appropriate room?

Together, these provide practical planning value without turning the dashboard into a heavy reporting page.
