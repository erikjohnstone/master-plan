# Control intent: binding eval (heldout)

packets found: 52; keyed pairs: 191; key packets not found: 15; unmatched instances: 0
pair recall 26.7% (51/191; without semantic 27.3%; with proposals 55.5%; hits inside 0, containing 0)
precision 93.5% over 46 confirmed bindings (with proposals 71.7% over 99); proposals 53; ambiguous 8; units keyed "none" but bound 0
unit recall 44.7% (85 instances with a governing packet)

| key kind | pairs | hit | recall |
|---|---:|---:|---:|
| tag | 59 | 23 | 39.0% |
| family_detail | 112 | 15 | 13.4% |
| semantic | 4 | 0 | 0.0% |
| list_range | 16 | 13 | 81.3% |

| binding kind | bindings | correct | proposals |
|---|---:|---:|---:|
| tag_body | 34 | 31 | 0 |
| family_detail | 60 | 35 | 53 |
| system | 1 | 1 | 0 |
| list_range | 1 | 1 | 0 |
| label_list | 3 | 3 | 0 |

| missed pairs, why | pairs |
|---|---:|
| bound as a proposal only | 55 |
| key packet not found by the finder | 45 |
| bound to packets of other kinds only | 19 |
| no binding at all (tag read) | 18 |
| bound to another packet of that kind | 2 |
| no binding at all (tag not read) | 1 |

GATE B1 (heldout): recall 26.7% ≥ 85.0% ✗; precision 93.5% ≥ 95.0% ✗
