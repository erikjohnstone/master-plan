# Control intent: binding eval (heldout2)

packets found: 32; keyed pairs: 147; key packets not found: 16; unmatched instances: 3
pair recall 23.1% (34/147; without semantic 23.6%; with proposals 23.1%; hits inside 0, containing 2)
precision 76.6% over 47 confirmed bindings (with proposals 76.6% over 47); proposals 0; ambiguous 0; units keyed "none" but bound 0
unit recall 43.1% (72 instances with a governing packet)

| key kind | pairs | hit | recall |
|---|---:|---:|---:|
| semantic | 7 | 1 | 14.3% |
| tag | 59 | 12 | 20.3% |
| family_detail | 62 | 21 | 33.9% |
| list_range | 19 | 0 | 0.0% |

| binding kind | bindings | correct | proposals |
|---|---:|---:|---:|
| family_detail | 10 | 10 | 0 |
| tag_body | 37 | 26 | 0 |

| missed pairs, why | pairs |
|---|---:|
| key packet not found by the finder | 102 |
| no binding at all (tag read) | 8 |
| instance not matched to a schedule row | 2 |
| bound to packets of other kinds only | 1 |

GATE B1 (heldout2): recall 23.1% ≥ 85.0% ✗; precision 76.6% ≥ 95.0% ✗
