"""Final authored-record packaging controls; does not test a production parser."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from bundle_record import AUDIT, render, validate


class BundleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.path = AUDIT / "records" / "02__vol2__015.json"
        cls.record = json.loads(cls.path.read_text())

    def rejected(self, mutation, readable=True):
        record = copy.deepcopy(self.record)
        mutation(record)
        with tempfile.TemporaryDirectory(prefix="hvac-bundle-negative-") as directory:
            path = Path(directory) / "fixture.json"
            path.write_text(json.dumps(record))
            if readable:
                # A matching presentation must not hide corruption in data.
                try:
                    path.with_suffix(".md").write_text(render(record))
                except (KeyError, ValueError, IndexError):
                    path.with_suffix(".md").write_text("Invalid mutated fixture")
            self.assertFalse(validate(path, write_report=False, verbose=False))

    def test_real_complete_bundle(self):
        self.assertTrue(validate(self.path, write_report=False, verbose=False))
        self.assertEqual(len(self.record["equipment_inventory"]), 109)
        self.assertEqual(len(self.record["point_application_ledger"]), 192)

    def test_missing_visual_page(self):
        self.rejected(lambda r: r["page_review"].pop())

    def test_missing_objective_category(self):
        self.rejected(lambda r: r["requirement_audit"].pop())

    def test_stale_module(self):
        self.rejected(lambda r: r["module_sha256"].update(points="0" * 64))

    def test_changed_source_cell(self):
        self.rejected(lambda r: r["modules"]["schedules"]["tables"][0]["rows"].__setitem__(0, "WRONG"))

    def test_missing_render(self):
        self.rejected(lambda r: r["page_review"][0].update(render="reviews/nonexistent.png"))

    def test_changed_render_hash(self):
        self.rejected(lambda r: r["review_render_sha256"].update({r["page_review"][0]["render"]: "0" * 64}))

    def test_wrong_application_owner(self):
        self.rejected(lambda r: r["point_application_ledger"][0]["ownership"].update(owners=["FC-99"]))

    def test_wrong_equipment_spec(self):
        self.rejected(lambda r: r["equipment_inventory"][0]["literal_schedule_row"].update(airflow_CFM="9999"))

    def test_not_reviewed_gate(self):
        self.rejected(lambda r: r["completion_checks"].update(final_assembly_audit_complete=False))

    def test_missing_readable_record(self):
        self.rejected(lambda r: None, readable=False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
