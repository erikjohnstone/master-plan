# Control intent: binding eval (heldout)

packets found: 52; keyed pairs: 191; key packets not found: 15; unmatched instances: 0
pair recall 10.5% (20/191; without semantic 10.7%; with proposals 41.9%; hits inside 0, containing 0)
precision 100.0% over 17 confirmed bindings (with proposals 66.7% over 75); proposals 58; ambiguous 12; units keyed "none" but bound 0
unit recall 18.8% (85 instances with a governing packet)

| key kind | pairs | hit | recall |
|---|---:|---:|---:|
| tag | 59 | 5 | 8.5% |
| family_detail | 112 | 8 | 7.1% |
| semantic | 4 | 0 | 0.0% |
| list_range | 16 | 7 | 43.8% |

| binding kind | bindings | correct | proposals |
|---|---:|---:|---:|
| tag_body | 3 | 3 | 0 |
| family_detail | 68 | 43 | 58 |
| list_range | 1 | 1 | 0 |
| label_list | 3 | 3 | 0 |

| missed pairs, why | pairs |
|---|---:|
| bound as a proposal only | 60 |
| key packet not found by the finder | 45 |
| no binding at all (tag read) | 45 |
| bound to packets of other kinds only | 20 |
| no binding at all (tag not read) | 1 |

GATE B1 (heldout): recall 10.5% ≥ 85.0% ✗; precision 100.0% ≥ 95.0% ✓
