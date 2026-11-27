import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkflowGraph } from '../../apps/api/dist/modules/automation/workflow.validator.js';
import { AUTOMATION_TEMPLATES } from '../../apps/api/dist/modules/automation/workflow.registry.js';
import { createWorkflow, listWorkflows, runWorkflowNow, setWorkflowStatus } from '../../apps/api/dist/modules/automation/automation.service.js';

test('Workflow validator rejects cycles and dangerous configs, accepts valid DAGs', () => {
  const badCycle = validateWorkflowGraph({
    name: 'Cyclic',
    nodes: [
      { id: 'n1', type: 'trigger.manual', label: 'Start', config: {} },
      { id: 'n2', type: 'action.send_notification', label: 'Notify', config: {} },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n1' },
    ],
  });
  assert.equal(badCycle.valid, false);
  assert.ok(badCycle.errors.some((e) => e.includes('Circular')));

  const badConfig = validateWorkflowGraph({
    name: 'Dangerous',
    nodes: [
      { id: 'n1', type: 'trigger.manual', label: 'Start', config: { cmd: 'eval("bad")' } },
    ],
    edges: [],
  });
  assert.equal(badConfig.valid, false);

  assert.equal(AUTOMATION_TEMPLATES.length, 12);
  for (const tpl of AUTOMATION_TEMPLATES) {
    const res = validateWorkflowGraph({ name: tpl.name, nodes: tpl.nodes, edges: tpl.edges });
    assert.equal(res.valid, true, `Template ${tpl.id} should be valid`);
  }
});

test('Automation service enforces user isolation and executes workflow steps', async () => {
  const created = await createWorkflow('user-1', {
    name: 'Test Notification Flow',
    description: 'Unit test flow',
    status: 'paused',
    timezone: 'Asia/Kolkata',
    nodes: [
      { id: 'n1', type: 'trigger.manual', label: 'Manual', config: {} },
      { id: 'n2', type: 'reliability.human_approval', label: 'Approval Gate', config: {} },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
  });
  assert.equal(created.ok, true);
  assert.equal(listWorkflows('user-2').length, 0);
  assert.equal(listWorkflows('user-1').length, 1);

  const toggled = setWorkflowStatus(created.workflow.id, 'user-1', 'active');
  assert.equal(toggled?.status, 'active');

  const exec = await runWorkflowNow(created.workflow.id, 'user-1', 'manual');
  assert.equal(exec?.status, 'succeeded');
  assert.equal(exec?.steps.length, 2);
});
