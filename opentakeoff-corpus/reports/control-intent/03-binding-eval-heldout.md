# Control intent: binding eval (heldout)

packets found: 52; keyed pairs: 191; key packets not found: 15; unmatched instances: 0
pair recall 11.0% (21/191; without semantic 11.2%; with proposals 42.4%; hits inside 0, containing 0)
precision 100.0% over 18 confirmed bindings (with proposals 67.1% over 76); proposals 58; ambiguous 12; units keyed "none" but bound 0
unit recall 20.0% (85 instances with a governing packet)

| key kind | pairs | hit | recall |
|---|---:|---:|---:|
| tag | 59 | 6 | 10.2% |
| family_detail | 112 | 8 | 7.1% |
| semantic | 4 | 0 | 0.0% |
| list_range | 16 | 7 | 43.8% |

| binding kind | bindings | correct | proposals |
|---|---:|---:|---:|
| tag_body | 3 | 3 | 0 |
| family_detail | 68 | 43 | 58 |
| system | 1 | 1 | 0 |
| list_range | 1 | 1 | 0 |
| label_list | 3 | 3 | 0 |

| missed pairs, why | pairs |
|---|---:|
| bound as a proposal only | 60 |
| key packet not found by the finder | 45 |
| no binding at all (tag read) | 43 |
| bound to packets of other kinds only | 21 |
| no binding at all (tag not read) | 1 |

GATE B1 (heldout): recall 11.0% ≥ 85.0% ✗; precision 100.0% ≥ 95.0% ✓
