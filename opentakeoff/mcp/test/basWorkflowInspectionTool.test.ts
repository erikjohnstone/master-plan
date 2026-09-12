/** Actual registered MCP transport over all five deterministic BAS workflow
 * inspectors. Controlled workflow decisions are not real-PDF truth. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../server.ts';
import { Session } from '../src/session.ts';
import { basWorkflowInspectionDomainSchema, basWorkflowInspectionSchema,
  inspectBasWorkflow } from '../../web/src/lib/basWorkflowInspection.ts';
import { engineeringFixture } from '../../web/test/helpers/basEngineeringFixture.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';

test('actual registered MCP tool exposes the same bounded shared inspection for all five BAS workflows', async () => {
  const fixture = await engineeringFixture({ withSequence: true });
  const session = new Session();
  session.basWorkflow = fixture.workflow;
  const before = canonicalBasJson(session.basWorkflow);
  const server = buildServer(session);
  const client = new Client({ name: 'bas-workflow-inspection-test', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    for (const domain of basWorkflowInspectionDomainSchema.options) {
      const response = await client.callTool({ name: 'inspect_bas_workflow', arguments: { domain } });
      assert.equal(response.isError, undefined, JSON.stringify(response));
      const body = JSON.parse((response.content as { type: string; text?: string }[])
        .find(item => item.type === 'text')!.text!);
      const actual = basWorkflowInspectionSchema.parse(body.result);
      const expected = await inspectBasWorkflow(session.basWorkflow, domain);
      assert.deepEqual(actual, expected);
      assert.equal(actual.domain, domain);
      assert.equal(actual.authority, 'validated_shared_workflow');
      assert.equal(actual.approval, 'not_evaluated');
      assert.equal(actual.project_complete, false);
      assert.equal(actual.installed_quantity, null);
    }
    assert.equal(canonicalBasJson(session.basWorkflow), before, 'inspection is read-only');
  } finally {
    await client.close();
    await server.close();
  }
});
