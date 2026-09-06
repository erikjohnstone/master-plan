"""Offline authored-annotation checker regression tests, not production logic."""
import copy
import json
from pathlib import Path
import tempfile
import unittest

from verify_tables import AUDIT, canon, verify


class TableVerificationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.points_path=AUDIT/'work'/'02__vol2__015'/'points.json'
        cls.schedules_path=AUDIT/'work'/'02__vol2__015'/'schedules.json'
        cls.points=json.loads(cls.points_path.read_text())

    def mutated(self,mutator,module=None):
        data=(json.loads(self.points_path.with_name(module+'.json').read_text())
              if module else copy.deepcopy(self.points))
        mutator(data)
        with tempfile.TemporaryDirectory(prefix='bas-annotation-test-') as tmp:
            path=Path(tmp)/'fixture.json'
            path.write_text(json.dumps(data))
            return verify(path,write=False,quiet=True)

    def test_existing_schedule_grid(self):
        r=verify(self.schedules_path,write=False,quiet=True)
        self.assertTrue(r['pass'],r['errors'])
        self.assertEqual(r['cell_assertions'],1194)

    def test_noncontiguous_points_grid(self):
        r=verify(self.points_path,write=False,quiet=True)
        self.assertTrue(r['pass'],r['errors'])
        self.assertEqual((r['rows'],r['cell_assertions']),(117,468))

    def test_numeric_operators_preserved(self):
        self.assertNotEqual(canon('< 1/2'),canon('> 1/2'))
        self.assertNotEqual(canon('1.2'),canon('12'))
        self.assertNotEqual(canon('-10'),canon('10'))
        self.assertNotEqual(canon(''),canon('0'))

    def test_supplemental_schedule(self):
        r=verify(self.points_path.with_name('supplemental_schedules.json'),write=False,quiet=True)
        self.assertTrue(r['pass'],r['errors'])
        self.assertEqual(r['cell_assertions'],28)

    def test_context_and_operating_table(self):
        r=verify(self.points_path.with_name('controls_context.json'),write=False,quiet=True)
        self.assertTrue(r['pass'],r['errors'])
        self.assertEqual((r['cell_assertions'],r['text_assertions']),(27,46))

    def test_text_assertion_wrong_sign(self):
        def change(d):
            d['assertions']=[{'id':'wrong-sign','page':24,'bbox':[1500,875,1990,951],
                              'expected':'HIGH CWR TEMPERATURE (SETPOINT - 3°F FOR 15 MIN)'}]
        self.assertFalse(self.mutated(change)['pass'])

    def test_unknown_assertion_reference(self):
        def change(d):
            d['assertion_ids']=['missing-reference']
        self.assertFalse(self.mutated(change)['pass'])

    def test_wrong_actual_cell(self):
        def change(d):
            d['tables'][0]['rows'][0]='AI-1|MAIN CWR TEMPERATURE|NO|YES'
        r=self.mutated(change)
        self.assertFalse(r['pass'])
        self.assertTrue(any('/alarm/mupdf:' in e for e in r['errors']))
        self.assertTrue(any('/alarm/poppler:' in e for e in r['errors']))

    def test_wrong_bounds(self):
        def change(d):
            d['tables'][0]['y_ranges'][0]=[190,194]
        self.assertFalse(self.mutated(change)['pass'])

    def test_overlap_rejected(self):
        def change(d):
            d['tables'][0]['y_ranges'][0]=[169,205]
        self.assertFalse(self.mutated(change)['pass'])

    def test_ambiguous_bounds_rejected(self):
        def change(d):
            d['tables'][0]['y_edges']=[169,187]
        self.assertFalse(self.mutated(change)['pass'])

    def test_false_counts_rejected(self):
        def change(d):
            d['tables'][0]['listed_point_counts']['AI']=20
        self.assertFalse(self.mutated(change)['pass'])

    def test_duplicate_ownership_rejected(self):
        def change(d):
            d['tables'][0]['owner_groups'][0]['marks'].append('AI-1')
        self.assertFalse(self.mutated(change)['pass'])

    def test_false_header_rejected(self):
        def change(d):
            d['tables'][0]['header_evidence'][0]['expected']='BOGUS POINTS LIST'
        self.assertFalse(self.mutated(change)['pass'])

    def test_metadata_rotated_text_and_blank_revisions(self):
        r=verify(self.points_path.with_name('metadata.json'),write=False,quiet=True)
        self.assertTrue(r['pass'],r['errors'])
        self.assertEqual(r['text_assertions'],414)
        self.assertEqual(len(r['inventory_checks']),5)

    def test_sensors_and_all_page_co2_search(self):
        r=verify(self.points_path.with_name('sensors.json'),write=False,quiet=True)
        self.assertTrue(r['pass'],r['errors'])
        self.assertEqual(r['text_assertions'],56)
        self.assertEqual(len(r['inventory_checks']),4)
        self.assertEqual(len(r['text_absence_checks']),1)

    def test_reference_tables(self):
        r=verify(self.points_path.with_name('reference_tables.json'),write=False,quiet=True)
        self.assertTrue(r['pass'],r['errors'])
        self.assertEqual(r['cell_assertions'],35)

    def test_missing_page_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['assertion_groups'][0]['records'].pop(),'metadata')['pass'])

    def test_wrong_rotated_direction_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['assertion_groups'][0]['templates'][1].update(reading_direction='right'),'metadata')['pass'])

    def test_nonblank_revision_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['assertion_groups'][0]['templates'][-1].update(bbox=[2278,1502,2365,1532]),'metadata')['pass'])

    def test_wrong_sensor_total_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['counts'].update(drawn_space_control_marks=24),'sensors')['pass'])

    def test_wrong_sensor_zone_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['assertion_groups'][0]['records'][0].update(zone='USB7'),'sensors')['pass'])

    def test_false_text_absence_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['text_absence_assertions'][0].update(patterns=['THERMOSTAT']),'sensors')['pass'])

    def test_incomplete_text_absence_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['text_absence_assertions'][0]['pages'].pop(),'sensors')['pass'])

    def test_equipment_registry_and_anchors(self):
        r=verify(self.points_path.with_name('equipment_reconciliation.json'),write=False,quiet=True)
        self.assertTrue(r['pass'],r['errors'])
        self.assertEqual(r['text_assertions'],144)
        self.assertEqual(r['inventory_checks'][0]['identities'],109)

    def test_points_applications(self):
        r=verify(self.points_path.with_name('point_applications.json'),write=False,quiet=True)
        self.assertTrue(r['pass'],r['errors'])
        self.assertEqual(r['inventory_checks'][0]['applications'],26)
        self.assertEqual(r['inventory_checks'][0]['expanded_logical_rows'],192)

    def test_wrong_linked_schedule_count_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['scheduled_families'][0].update(rows=5),'equipment_reconciliation')['pass'])

    def test_wrong_linked_schedule_identity_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['scheduled_families'][0]['tags'].__setitem__(0,'FC-99'),'equipment_reconciliation')['pass'])

    def test_wrong_anchor_identity_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['assertion_groups'][0]['records'][0].update(id='GH-CCC-1'),'equipment_reconciliation')['pass'])

    def test_wrong_application_counts_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['applications'][0]['counts'].update(AI=22),'point_applications')['pass'])

    def test_missing_application_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['applications'].pop(),'point_applications')['pass'])

    def test_duplicate_leaf_point_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['leaf_ownership_rules'][0]['groups'][0]['marks'].append('BI-3'),'point_applications')['pass'])

    def test_unknown_shared_point_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['applications'][15].update(shared_input='USB-FC3/USB-FC/AI-99'),'point_applications')['pass'])

    def test_missing_leaf_role_binding_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['leaf_role_bindings'][0]['owners_by_group'][0].pop(),'point_applications')['pass'])

    def test_false_control_mounting_height_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['assertions'][-1].update(expected='LOCATE ALL THERMOSTAT AND TEMPERATURE SENSORS 4\'-0" AFF.'),'sensors')['pass'])

    def test_schedule_notes_and_valve_state_witnesses(self):
        r=verify(self.points_path.with_name('supporting_evidence.json'),write=False,quiet=True)
        self.assertTrue(r['pass'],r['errors'])
        self.assertEqual(r['text_assertions'],50)

    def test_wrong_source_valve_state_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['assertion_groups'][1]['records'][0].update(state='NC'),'supporting_evidence')['pass'])

    def test_wrong_schedule_note_quantity_rejected(self):
        self.assertFalse(self.mutated(lambda d:d['assertions'][9].update(expected=d['assertions'][9]['expected'].replace('301.2','602.4')),'supporting_evidence')['pass'])


if __name__=='__main__':
    unittest.main(verbosity=2)
