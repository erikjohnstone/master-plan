# Control intent: binding eval (heldout)

packets found: 64; keyed pairs: 191; key packets not found: 12; unmatched instances: 0
pair recall 68.1% (130/191; without semantic 69.5%; with proposals 68.6%; hits inside 5, containing 34)
precision 94.7% over 114 confirmed bindings (with proposals 83.2% over 131); proposals 17; ambiguous 8; units keyed "none" but bound 0
unit recall 88.2% (85 instances with a governing packet)

| key kind | pairs | hit | recall |
|---|---:|---:|---:|
| tag | 59 | 42 | 71.2% |
| family_detail | 112 | 74 | 66.1% |
| semantic | 4 | 0 | 0.0% |
| list_range | 16 | 14 | 87.5% |

| binding kind | bindings | correct | proposals |
|---|---:|---:|---:|
| tag_body | 57 | 55 | 0 |
| family_detail | 60 | 40 | 17 |
| system | 1 | 1 | 0 |
| list_range | 1 | 1 | 0 |
| label_list | 3 | 3 | 0 |
| sibling | 9 | 9 | 0 |

| missed pairs, why | pairs |
|---|---:|
| key packet not found by the finder | 28 |
| bound to packets of other kinds only | 17 |
| bound to another packet of that kind | 8 |
| no binding at all (tag read) | 6 |
| bound as a proposal only | 1 |
| no binding at all (tag not read) | 1 |

GATE B1 (heldout): recall 68.1% ≥ 85.0% ✗; precision 94.7% ≥ 95.0% ✗

Sheet graphs read from a warm cache built at 0ed8b41 (its plan-sweep lookups older than 0ed8b41's; the sheet graph code has changed since, in the reconcile's plan work); compile, finder and binder at this commit (CI-62).
