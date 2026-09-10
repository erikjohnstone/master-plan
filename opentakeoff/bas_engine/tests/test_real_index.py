"""Independent source-reading keys, not expectations derived from extraction.

Reviewed rendered sheets 2026-09-09: Fort Sam Houston M510, M511, M512;
Center for Behavioral Medicine M701. See docs/BAS_MATH_PROOF.md for scope.
The fixture is an unmodified table projection from the production index.
"""
import json
from pathlib import Path

from bas_engine import calculate
from bas_engine.adapters import BlueprintInput, indexed_request
from bas_engine.models import IOVector


FIXTURE = json.loads((Path(__file__).parent / "fixtures/indexed-bas-tables.json").read_text())


def test_fort_sam_every_printed_io_cell_on_four_indexed_tables():
    # Four matrices, each listed ONCE. These are not installed template counts.
    # Unusual designer assignments (setpoint DO, pressure DI) are intentional:
    # source truth must not be overwritten by semantic guesses.
    keys = [
        {"AI": [2, 3, 9, 10, 11], "AO": [4, 5, 7], "DI": [], "DO": [6]},
        {"AI": [2, 3, 4, 6, 22], "AO": [24, 25, 26, 27], "DI": [10, 17, 19], "DO": [5, 7, 9, 13, 14, 16, 20, 23, 28, 29]},
        {"AI": [], "AO": [], "DI": [3, 4], "DO": [1]},
        {"AI": [2, 3, 4, 6, 22], "AO": [24, 25, 26, 27], "DI": [10, 17], "DO": [5, 7, 9, 13, 14, 16, 19, 20, 23]},
    ]
    assert [len(t["rows"]) for t in FIXTURE["fort-sam"]] == [19, 29, 4, 27]
    for table, key in zip(FIXTURE["fort-sam"], keys, strict=True):
        result = calculate(indexed_request(BlueprintInput.model_validate({"tables": [table]})))
        actual = {int(p.point_id): p.physical for p in result.points}
        for row in table["rows"]:
            number = int(row["key"])
            assert actual.get(number, IOVector()) == IOVector(**{c: int(number in ids) for c, ids in key.items()})
        assert result.licenses == []
    result = calculate(indexed_request(BlueprintInput.model_validate({"tables": FIXTURE["fort-sam"]})))
    assert result.physical_total == IOVector(AI=15, AO=11, DI=7, DO=21)


def test_m701_all_101_rows_and_integration_does_not_add_copper():
    table = FIXTURE["behavioral"][0]
    # Read independently from the rendered M701 matrix. Row 1 has GUI flags
    # only. Each chiller has 8 AI, 2 AO, 1 DO, and 3 network variables.
    by_number = {n: IOVector() for n in range(1, 102)}
    software_rows = set()
    for start in (2, 16, 30):
        for offset in (5, 7, 8, 9, 10, 11, 12, 13):
            by_number[start+offset] = IOVector(AI=1)
        for offset in (4, 6):
            by_number[start+offset] = IOVector(AO=1)
        by_number[start] = IOVector(DO=1)
        software_rows.update((start+1, start+2, start+3))
    for start in (44, 48, 52, 56, 60, 85, 89, 93):
        for offset, vector in enumerate((IOVector(DO=1), IOVector(DI=1), IOVector(AO=1), IOVector(DI=1))):
            by_number[start+offset] = vector
    for start in (64, 71, 78):
        for offset, vector in enumerate((IOVector(AO=1), IOVector(AI=1), IOVector(AI=1), IOVector(DO=1), IOVector(DI=1), IOVector(AO=1), IOVector(DI=1))):
            by_number[start+offset] = vector
    by_number[97] = IOVector(AO=1)
    for n in (98, 99, 100):
        by_number[n] = IOVector(AI=1)
    by_number[101] = IOVector(DI=1)
    result = calculate(indexed_request(BlueprintInput.model_validate({"tables": [table]})))
    actual = {p.point_id: p for p in result.points}
    assert len(table["rows"]) == 102  # retained subheader + 101 requirements
    for row in table["rows"][1:]:
        number = int(row["cells"]["COL1"]["text"])
        point = actual.get(row["key"])
        assert (point.physical if point else IOVector()) == by_number[number], number
        assert (sum(s.quantity for s in point.soft) if point else 0) == int(number in software_rows)
        if point:
            assert point.evidence[0].bbox_px == tuple(row["cells"]["COL2"]["bbox"])
    assert len(result.points) == 100
    assert result.physical_total == IOVector(AI=33, AO=21, DI=23, DO=14)
    assert result.licenses[0].variables == 9
