"""Negative controls for audit corroboration; never modifies source or final records."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from validate_record import AUDIT, validate


class ValidationTests(unittest.TestCase):
    def setUp(self):
        # This is test-fixture data, not a branch in PDF/production parsing logic.
        self.path=AUDIT/"records"/"21__vol2__095.json"
        self.record=json.loads(self.path.read_text())

    def rejected(self, mutation):
        r=copy.deepcopy(self.record)
        mutation(r)
        with tempfile.TemporaryDirectory(prefix="hvac-gt-negative-") as directory:
            p=Path(directory)/"fixture.json"
            p.write_text(json.dumps(r))
            self.assertFalse(validate(p,write_report=False,verbose=False))

    def test_real_record_passes(self):
        self.assertTrue(validate(self.path,write_report=False,verbose=False))

    def test_wrong_schedule_cell_rejected(self):
        self.rejected(lambda r:r["tables"][0]["rows"][0]["cells"].__setitem__(1,"57"))

    def test_wrong_point_tag_rejected(self):
        self.rejected(lambda r:r["controls"]["points"][0].__setitem__("tag","RT-AI-99"))

    def test_wrong_normalized_value_rejected(self):
        self.rejected(lambda r:r["equipment"][0]["performance"]["gross_total_cooling"].__setitem__("value",57))

    def test_wrong_column_region_rejected(self):
        self.rejected(lambda r:r["tables"][0]["columns"][1].__setitem__("x",[742,829]))

    def test_inflated_point_count_rejected(self):
        self.rejected(lambda r:r["controls"]["point_counts"].__setitem__("total",15))

    def test_missing_page_rejected(self):
        self.rejected(lambda r:r["sheets"].pop())


if __name__=="__main__":
    unittest.main()
