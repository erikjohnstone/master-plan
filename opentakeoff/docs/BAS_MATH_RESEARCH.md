# BAS takeoff mathematics and integration

## Scope and evidence boundary

This engine converts evidenced BAS point requirements into manufacturer-independent
integer I/O capacity, network segments, and software-license quantities. It is
not a product selector, a project-specifications parser, or a replacement for
VectorGrid. Existing blueprint extraction, table cells, bounding boxes, and
citations remain authoritative inputs. Hardware quantities are engineering
calculations with disclosed policy, not new observations on a drawing.

Research reviewed on 9 September 2026 uses the primary sources listed below.
The equations and proofs are derived here. Published examples of owner criteria
are not universal requirements and are not silently imposed on uploaded plans.
The 2021 Smithsonian criteria require spare I/O by type and explicitly prohibit
double-counting universal capacity; the 2021 NASA standard uses a different
spare percentage. This directly supports making the policy explicit. [1], [2]

The present application already has a shared schedule compiler, a sequence
compiler, and a Python-capable Node server environment. Its BAS compiler reports
printed points, a separately labeled template estimate, and incomplete SOO
coverage. The math engine must not consume the template estimate as evidence
or turn the existing incomplete status into a claim of a complete project.

## 1. Requirement space and universal inputs

Let the physical copper demand of one allocation group be

\[
d=(A,O,D,Q)\in\mathbb{Z}_{\ge0}^{4}
\]

in the fixed order **[AI, AO, DI, DO]**. BI and BO in existing source tables
are aliases for DI and DO, not extra dimensions. Network objects and variables
belong to a separate vector. A point being exposed as a BACnet Analog Input
does not establish that a new analog terminal is required at the integrating
controller: BACnet represents both physical points and software values.[3]

An abstract I/O block has rigid capacity \(c=(a,o,d,q)\) plus \(u\) universal
inputs. Here, and only here, a universal input can accept either one compatible
AI or one compatible DI. An ordinary AI terminal does **not** automatically
accept a DI. No output can be borrowed to satisfy an input. The UI pool is
additional capacity, not already included in the rigid AI/DI counts.

For \(n\) interchangeable blocks in one allowed allocation pool, introduce
integer assignments \(x_A,x_D\ge0\). Feasibility is:

\[
A\le na+x_A,\quad D\le nd+x_D,\quad x_A+x_D\le nu,
\quad O\le no,\quad Q\le nq.
\]

Eliminating the assignments gives the exact residual test:

\[
\max(0,A-na)+\max(0,D-nd)\le nu.
\]

**Necessity.** Rigid terminals can satisfy at most \(na\) AI and \(nd\) DI.
Every remaining input consumes a distinct UI terminal; their sum cannot
exceed \(nu\).

**Sufficiency.** Assign \(\min(A,na)\) AI to rigid AI terminals and
\(\min(D,nd)\) DI to rigid DI terminals. Assign the two residuals to UI.
The inequality ensures enough distinct UI terminals. All assignments are
integers, so no rounding of fractional assignments is required.

Equivalently, the following three input inequalities are jointly necessary
and sufficient:

\[
A\le n(a+u),\quad D\le n(d+u),\quad A+D\le n(a+d+u).
\]

To prove sufficiency, split into the four cases of whether \(A>na\) and
\(D>nd\). If both exceed rigid capacity, the third inequality bounds the
sum of residuals. If only one exceeds it, the corresponding individual
inequality suffices. If neither exceeds it, the residual is zero.

Therefore the minimum count of a **single repeated abstract block profile** is

\[
n_* = \max\left(
\left\lceil\frac{A}{a+u}\right\rceil,
\left\lceil\frac{D}{d+u}\right\rceil,
\left\lceil\frac{A+D}{a+d+u}\right\rceil,
\left\lceil\frac{O}{o}\right\rceil,
\left\lceil\frac{Q}{q}\right\rceil\right).
\]

A zero-demand/zero-capacity term contributes zero. Positive demand with zero
compatible capacity is infeasible, not zero blocks. Every term is a necessary
lower bound; at their maximum all inequalities hold, proving minimality.

Example: demand [6,2,5,1], profile rigid [2,2,2,1] plus 4 UI. Checking AI
and DI separately would incorrectly suggest one block. Their input sum is 11
and one block has only 8 total inputs; the exact answer is two blocks.
An allocation witness must accompany the answer so UI reuse can be audited.

Electrical compatibility is a precondition: voltage/current/resistance modes,
pulse rates, isolation, sourcing/sinking, and common-terminal restrictions
cannot be inferred from four counts. A profile declares compatible abstract
channels; unknown compatibility is disclosed. This abstraction does not
certify a real controller or select a manufacturer's device.

## 2. Spare capacity, integer ceilings, and equipment groups

Two common interpretations of “15% spare” are mathematically different.
For an integer demand \(x\) and exact rational \(s=p/r\):

**Add-on relative to demand:**

\[
t=\lceil x(1+s)\rceil=\left\lceil\frac{x(r+p)}{r}\right\rceil.
\]

**Unused fraction of installed capacity:**

\[
\frac{t-x}{t}\ge s\quad\Longleftrightarrow\quad
t\ge\frac{x}{1-s}\quad\Longrightarrow\quad
t=\left\lceil\frac{xr}{r-p}\right\rceil,
\quad 0\le s<1.
\]

For 40 points and 15%, the answers are 46 and 48 respectively. Forty live
points in 46 terminals leave only 13.04% of installed capacity unused. The
engine must label the denominator and must never present these policies as
equivalent. Zero live points require zero capacity under either rule unless
an explicit minimum is supplied. No implicit controller is fabricated for
an empty group.

The ceiling proof is immediate: \(t=\lceil z\rceil\) is an integer meeting
\(t\ge z\); \(t-1<z\) proves every smaller integer fails. Calculation uses
integer numerator/denominator arithmetic, not binary floating point.

Apply the policy per I/O dimension, then allocate the resulting integer
requirements. Universal capacity can cover either spare input class, but a
single UI terminal can never satisfy both reserved classes simultaneously.
Installed residuals are reported separately from required spare.

Equipment grouping is equally important. If group \(g\) has \(m_g\) identical
independent equipment instances, each needing vector \(d_g\), then:

\[
N=\sum_g m_g\,n_*(T(d_g)).
\]

This is different from pooling all equipment:

\[
N_{pool}=n_*\left(T\left(\sum_g m_gd_g\right)\right).
\]

For two independent machines requiring one AI each, a two-AI block with
15% add-on needs one block per machine (two blocks). Pooling first creates
three reserved AI and also two blocks here, but with three-AI blocks pooling
would need one while independent machines still need two. With 7 AI per
machine, an 8-AI block and 15% add-on require 9 AI per machine: four blocks
for two machines, versus three blocks for one shared pool of 14 live AI.

Pooling is permitted only when explicitly declared in the inputs; physical
and control-system boundaries cannot be erased for a smaller answer.
Different building, equipment identity, sequence, or controller-group scope
must survive reconciliation. Independent quantities are scaled arithmetically
without materializing a billion individual equipment instances.

These equations establish I/O block capacity only. CPU/program resources,
maximum expansion-chain length, power, enclosure space, safety interlocks,
and controller redundancy remain separate constraints. A configured maximum
blocks per pool is a hard feasibility check, not a reason to split one control
sequence silently across autonomous controllers.

## 3. Network topology and distance

RS-485 is an electrical layer; BACnet MS/TP is a token-passing data link.
MS/TP manager addresses occupy 0–127; 255 is broadcast, and subordinate
addressing has a different range. The number of addresses is not a guarantee
that the physical segment can support that many devices.[4]

RS-485 loading is measured in unit loads, not simply device count. Transceiver
loading, biasing, termination, and cable/data-rate characteristics affect
usable capacity and reach.[5] The UFGS BACnet guide gives a useful example of
a stricter owner policy: a 32-device segment, router address zero, a specified
Max_Master, and particular cable/routing constraints.[6] These are examples,
not universal default topology rules.

For segment \(t\), let \(z_{it}\in\{0,1\}\) assign node \(i\), with node
load \(w_i\), manager flag \(b_i\), total-device limit \(C\), manager limit
\(M\), electrical load budget \(U\), and reserved head-end resources
\((c_0,m_0,u_0)\). Require:

\[
\sum_tz_{it}=1,\quad
\sum_i z_{it}+c_0\le C,\quad
\sum_i b_i z_{it}+m_0\le M,\quad
\sum_iw_i z_{it}+u_0\le U.
\]

Reservations include the router and declared electrical overhead. A software
point count is not a node count. Multiple I/O expansion blocks also do not
automatically mean multiple network nodes: network endpoints are explicit.

For homogeneous nodes and no route constraints, usable device count is the
minimum of the device, manager (when all are managers), and electrical
constraints. Then \(\lceil N/C_{effective}\rceil\) is exact. With mixed loads,
\(\lceil\sum_iw_i/(U-u_0)\rceil\) is only a lower bound; bin packing can
require more segments. With route geometry, \(\max(\lceil N/C\rceil,
\lceil L/L_{max}\rceil)\) is generally **not** a feasible routing solution.
For example, three indivisible two-unit loads cannot fit in two three-unit
bins even though the aggregate load bound says two.

### Ordered linear routes

An implementable exact subproblem is an explicitly ordered, contiguous route.
Each new segment has a local head end at its first endpoint plus a declared
lead length \(h\). For segment endpoints at ordered positions \(p_i\):

\[
\ell_t=h+p_{last(t)}-p_{first(t)}\le L_{max}.
\]

Accumulate nodes until adding the next would exceed any resource or length
limit, then open the next segment. Return the actual partition and all
per-segment resource totals. A node that cannot fit alone is infeasible.
Omitted positions produce a **capacity-only lower bound**, never a verified
physical route. Mixing known and unknown positions is rejected.

**Optimality in this restricted model.** Every valid first segment is a
prefix no longer than the greedy feasible prefix. An optimal solution can
move nodes from its later segments into that prefix without worsening any
later segment: removing a prefix of a segment cannot increase its count,
load, manager usage, or span. Remove empty segments and repeat inductively.
Thus greedy minimizes segment count for these ordered contiguous constraints.
It does not optimize arbitrary floor-plan wiring or fixed gateway locations.
Upstream links and head-end placement must still be verified; they are not
invented by the partition calculation.

Serial Modbus is not MS/TP token passing. Its addressed servers occupy 1–247
and transactions are initiated by a client/master.[7] Reuse the electrical
and distance model only with the correct protocol/address constraints.

### BACnet/IP switch allocation

IP endpoints use explicitly assigned access-switch locations. For an abstract
switch with \(P\) ports and \(R\) reserved uplink/service ports, usable ports
are \(P-R\), requiring:

\[
S_k=\left\lceil\frac{N_k}{P-R}\right\rceil
\]

at closet \(k\). Each endpoint-to-switch cable must independently satisfy
\(\ell_{ik}\le L_{max}\). A sum of cable lengths cannot be divided by a
link-length limit to obtain a switch count. A 101 m endpoint link fails a
100 m medium policy even when every other link is short. Adding a switch in
the same closet does not repair its reach. Reach is media-specific: ordinary
BASE-T and long-reach single-pair Ethernet have different specifications. [8], [9]

The ceiling is minimal for fixed closets and homogeneous port resources:
fewer switches lack ports, and distributing endpoints across the computed
switch count constructs a feasible port assignment. Routing, uplink hierarchy,
bandwidth, PoE power, redundancy, BBMD/foreign-device configuration, and BACnet/SC
security are not established by port arithmetic. Omitted distances are
explicitly unverified. An overlength endpoint is a failed constraint.

## 4. Soft network points and licensing

Maintain physical requirements \(d\) and soft variables \(v\) independently:

\[
d_{new}=d+0\cdot|v|.
\]

Modbus registers are data-model entities, not proof of local copper I/O;
the protocol itself distinguishes register tables from application behavior.[10]
KNX group objects, group addresses, and datapoint types likewise describe
communication semantics rather than new input terminals.[11]

Normalize every software variable to a declared identity scoped by network,
device, and protocol object/register/group address. One 32-bit value occupying
two 16-bit registers can be one licensed variable, while one register may
contain several separately licensed bit variables. A BACnet object's trend
and alarm properties are not automatically additional licensed points.
Repeated views of the same identity deduplicate; distinct devices remain
distinct even when object numbers or labels match.

Licensing is a commercial policy input, not a BACnet/Modbus/KNX law. For
license pool \(j\), let \(V_j\) be the distinct configured variables and
\(w_v\) their explicit integer licensing weights. Then:

\[
L_j=\sum_{v\in V_j}w_v\,q_v.
\]

For base entitlement \(B_j\) and additive pack size \(K_j>0\):

\[
packs_j=\left\lceil\frac{\max(0,L_j-B_j)}{K_j}\right\rceil,
\quad entitlement_j=B_j+packs_jK_j.
\]

For nonadditive license tiers, choose the smallest provided threshold at
least \(L_j\); if none qualifies, report infeasibility. Do not extrapolate a
larger tier or pool licenses across separate servers. Both proofs follow
from the ceiling/minimum admissible threshold and provide the remaining
licensed headroom. Physical points count toward licenses only if a policy
explicitly identifies their exported software variables. Missing protocol,
identity, or licensing policy remains visible as incomplete.

## 5. SOO / drawing reconciliation

The matching key must include the explicit allocation scope, equipment group,
and point identity. Never join purely by row order or the text “temperature.”
Matrices represent the same identity domain, with columns [AI, AO, DI, DO]
and separate software requirements. Normalize BI/BO aliases first; do not
silently reinterpret analog as input when direction is absent.

Let \(S_{ik}\) be SOO demand and \(P_{ik}\) drawing-list demand. After
identity alignment, the conservative envelope is:

\[
R_{ik}=\max(S_{ik},P_{ik}).
\]

**Proof.** \(R\ge S\) and \(R\ge P\) component-wise. Any vector/matrix
\(X\) covering both must have \(X_{ik}\ge S_{ik}\) and
\(X_{ik}\ge P_{ik}\), hence \(X_{ik}\ge R_{ik}\). Therefore \(R\) is
the least upper bound. It is commutative, associative, idempotent, monotone,
and preserves nonnegative integers.

This proof establishes a capacity envelope, **not contractual truth**.
If one source calls the same signal AI and another DI, [1,0,1,0] is the
envelope but not proof of two actual sensors. Flag the type contradiction,
preserve both source citations, and label procurement readiness as needing
review. A physical-versus-network disagreement is also a contradiction, not
permission to buy copper and licenses silently.

Align before aggregating. If an SOO has a supply-air sensor and a point list
has a return-air sensor, each with one AI, the union needs two AI; max of the
two already-aggregated totals would incorrectly return one. Distinct device
identities and distinct allocation scopes cannot disappear in aggregation.

Missing and zero differ. An absent SOO means “not provided,” not an SOO
explicitly specifying zero points. SOO-only and point-list-only requests are
valid and return their one-source demand with a coverage notice. With both
sources present, missing rows, differing quantities, incompatible channel
types, protocol differences, and physical/soft contradictions generate
structured diagnostics. Repeated keys within one source are rejected until
explicitly normalized; addition or deduplication is not guessed.

Raw narrative is retained with citations but is not treated as typed points
merely because it mentions a fan, temperature, alarm, or BACnet. The math
input can accept explicitly typed SOO requirement arrays independently of a
point list. A dataframe adapter validates explicit mapped columns. Existing
blueprint-index omissions or untyped prose are reported for manual review;
VectorGrid is not changed to make a demonstration pass.

## 6. Implementation architecture

**Shared-path gate: YES.** The engine decides quantities, so the UI and MCP
must call one Python implementation. There must be no browser-side copy of
I/O relaxation, reconciliation, network splitting, or license arithmetic.

Integrated files:

| File | Responsibility |
| --- | --- |
| `bas_engine/models.py` | Strict Pydantic V2 requests, evidence, policies, typed outputs and diagnostics |
| `bas_engine/reconcile.py` | Identity alignment, per-point max envelopes and structural warnings |
| `bas_engine/hardware.py` | Exact rational ceilings, group boundaries, UI assignment witnesses |
| `bas_engine/network.py` | Explicit serial routes, address/load budgets and fixed-closet IP sizing |
| `bas_engine/licensing.py` | Independent software-variable pools, packs and tiers |
| `bas_engine/adapters.py` | Validated dataframe and existing compiled-blueprint inputs; conservative evidence normalization |
| `bas_engine/engine.py` | One deterministic orchestration and readiness calculation |
| `bas_engine/__main__.py` | Bounded JSON stdin/stdout process interface, no shell execution or credentials |
| `bas_engine/tests/` | Unit, property/exhaustive, adapter and integration regressions |
| `mcp/src/basMath.ts` | Bounded Python process transport; explicit unavailable/invalid-result failures |
| `mcp/src/productionTakeoff.ts` | Existing shared compile plus additive `bas_math` result for BAS only |
| `mcp/src/tools.ts` + `mcp/scripts/production-graph-cli.mjs` | Both use the same production compile orchestration |
| `web/src/components/BasMathSummary.jsx` + `TakeoffDataPanel.jsx` | Present additive math and diagnostics in Takeoff; separate BAS JSON export, no changes to the old row builder |
| `mcp/scripts/cliJson.mjs` | Drain large UTF-8 JSON replies before exiting; prevent pipe truncation without changing extraction |
| `web/src/lib/basBrowserResult.js` | Surface-specific translation of new BAS evidence from upload hashes to existing canvas sheet identities; no changes to quantities or coordinates |
| `web/src/lib/basAgentSummary.js` + `agentLoop.js` | Compact only the Agent's text representation; keep canonical Takeoff/export data, totals and legacy response metadata intact |
| `mcp/scripts/smoke-bas-dist.mjs` | Real packaged MCP/Python runtime verification with explicitly typed fixture requirements |
| `web/scripts/playwright-bas-math.mjs` | Real blueprint upload, actual Takeoff output, source navigation and export proof |
| `.github/workflows/bas-math.yml` (repository root) | Python, transport and packaged-runtime regression gate |

Existing table/citation/bbox fields are preserved; new output
is additive. A failed math calculation never masquerades as zero demand and
never discards the original schedule result. No changes are authorized to
VectorGrid, sheet graph extraction, symbol sweep, or legend learning.

**Integration refinement from direct index inspection:** Fort Sam Houston's
current graph contains four `BAS INPUT/OUTPUT POINT LIST` tables (79 rows),
but the legacy BAS compiler selects none of them because its title classifier
does not recognize that singular title. The new Python adapter consumes
already-indexed table cells directly, beside the unchanged legacy compile.
It does not alter VectorGrid, re-extract tables, or patch the old compiler's
totals. Its separately named `bas_math` result discloses source coverage.
The graph does not expose all 193 ground-truthed matrix rows or the known
written sequences in this excerpt; this is a real input completeness gap.

**Nested-header refinement:** The Center for Behavioral Medicine M701 graph
already contains its physical-versus-integration subheaders as the first table
row. The BAS adapter reads that explicit structure without changing the graph.
It retains header citations and does not count read/write, GUI or alarm flags
as additional copper or software variables. Rendered-page review and independent
per-row expected vectors are recorded in the proof report.

## 7. Verification and completion gates

Before claiming completion, verify zero inputs; missing versus empty sources;
SOO-only, dataframe-only and both; quantities beyond 32-bit and large safe-JSON
scaling; exact ceiling boundaries; no shared UI double use; infeasible
channels; isolated versus pooled groups; named-point union; mismatched types
and quantities; invalid/negative/fractional/bool/NaN counts; duplicate identities;
protocol/load/node/length splits; fixed-closet overlength links; software-only
requests; license boundaries; JSON round trips and process failure handling.

Compare hardware sizing against brute-force enumeration on small vectors.
Compare ordered-route splitting against an independent exhaustive partition
oracle. Assert conservation and capacity witnesses, not just example totals.
Run existing relevant web/MCP regressions and full shipping gates. Demonstrate
multiple real corpus blueprints through the actual Takeoff UI, retain citations
and screenshots, and record any index gaps without changing VectorGrid.

Deterministic math correctness is distinct from completeness of a project's
extracted requirements. Missing SOO typing, unresolved physical/soft signals,
unknown group replication, unavailable distances, or absent hardware/license
policies must remain visible in both machine output and the UI.

## Sources

1. Smithsonian Institution, *Smithsonian Design Standards, Volume 1*, October
   2021, §23.2.16.4, printed p.23-41 (PDF p.456).
   [Original document][1].
   Owner-specific example; not adopted as a project requirement.
2. NASA, *NASA-STD-10002 Facilities Design Standard*, 2021, §10.5.3, p.36.
   [Original document][2].
   Historical owner-specific example, not a claim of the latest NASA mandate.
3. BACnet Committee, *How to Specify BACnet-Based Systems*, objects and
   gateways discussion (publication date not stated in hosted copy).
   [Original document][3].
4. ASHRAE, *Addendum ce to Standard 135-2020*, approved 21 January 2022,
   §9.3 and Max_MasterManager changes, printed pp.4–6 and 12.
   [Original document][4].
   Terminology updates explain manager/subordinate versus legacy master/slave.
5. Texas Instruments, *The RS-485 Design Guide*, revision D, May 2021,
   §§3, 8–10. Electrical guidance only; no product catalog is used.
   [Original document][5].
6. USACE/NAVFAC/AFCEC, *UFGS 23 09 23.02 BACnet Direct Digital Control for HVAC
   and Other Building Control Systems*, hosted active guide, §3.1.2.
   [Original document][6].
   Guide's bracketed/tailored options must not become universal engine defaults.
7. Modbus Organization, *Modbus over Serial Line Specification and
   Implementation Guide V1.02*, December 2006, §§2.1–2.2.
   [Original document][7].
8. Ethernet Alliance, *Ethernet Technology Roadmap*, 2014 BASE-T speedmap.
   [Original document][8].
   Cited only for established 100BASE-TX/1000BASE-T reach, not its then-future forecasts.
9. IEEE 802.3, *100 Mb/s Long-Reach Single Pair Ethernet Task Force*, completion
   notice updated 1 July 2026 (802.3dg-2026 approved June 2026).
   [Original source][9].
   Shows why “all Ethernet is 100 m” is an unsafe universal assumption.
10. Modbus Organization, *Application Protocol Specification V1.1b3*,
    26 April 2012, §4.3, p.6.
    [Original document][10].
11. KNX Association, André Hänel, *Group Object*, updated 1 September 2026.
    [Original source][11].
12. Pydantic, *Strict Mode*, V2 documentation, accessed 9 September 2026.
    [Official documentation][12].
    Strict counts, forbidden unknown contract fields and model validators are
    implementation safeguards; runtime validation is not a mathematical proof.

[1]: https://www.wbdg.org/FFC/SI/si_sds_vol1.pdf
[2]: https://www.wbdg.org/FFC/NASA/NASACRIT/NASA_Std_10002_facdesign_2021.pdf
[3]: https://bacnet.org/wp-content/uploads/sites/4/2022/06/How-to-Specify-BACnet-Based-Systems-1.pdf
[4]: https://bacnet.org/wp-content/uploads/sites/4/2023/10/135_2020_ce_20220121.pdf
[5]: https://www.ti.com/lit/an/slla272d/slla272d.pdf
[6]: https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2023%2009%2023.02.pdf
[7]: https://www.modbus.org/file/secure/modbusoverserial.pdf
[8]: https://ethernetalliance.org/wp-content/uploads/2013/04/Ethernet-Alliance-Technology-Roadmap-FINAL.pdf
[9]: https://www.ieee802.org/3/dg/index.html
[10]: https://www.modbus.org/file/secure/modbusprotocolspecification.pdf
[11]: https://support.knx.org/hc/en-us/articles/360008521939-Group-Object
[12]: https://docs.pydantic.dev/latest/concepts/strict_mode/
