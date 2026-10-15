import { ToolRegistry } from './tool-registry';

describe('ToolRegistry', () => {
  // Executors aren't called here; only definitions and validation.
  const registry = new ToolRegistry(
    ...([null, null, null, null, null, null] as unknown as ConstructorParameters<typeof ToolRegistry>),
  );

  it('exposes every tool as a JSON-schema object, marking approval tools', () => {
    const defs = registry.definitions();
    expect(defs.map((d) => d.name).sort()).toEqual(
      [
        'comment_on_task',
        'create_task',
        'get_board',
        'get_memory',
        'get_recent_activity',
        'get_task',
        'get_team',
        'post_message',
        'remember',
        'update_task',
      ].sort(),
    );
    for (const d of defs) expect(d.inputSchema.type).toBe('object');
    expect(defs.find((d) => d.name === 'create_task')!.description).toContain('Needs human approval');
    expect(defs.find((d) => d.name === 'get_board')!.description).not.toContain('approval');
  });

  it('has the right risk levels', () => {
    expect(registry.get('get_board')!.risk).toBe('READ');
    expect(registry.get('remember')!.risk).toBe('WRITE_LOW');
    expect(registry.get('create_task')!.risk).toBe('NEEDS_APPROVAL');
    expect(registry.get('update_task')!.risk).toBe('NEEDS_APPROVAL');
  });

  it('rejects malformed input with a readable message', () => {
    expect(registry.parse('nope', {})).toEqual({ ok: false, error: 'Unknown tool "nope".' });
    const bad = registry.parse('create_task', { title: 'Fine title', priority: 'URGENT', estimate: 4 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toContain('priority');
      expect(bad.error).toContain('estimate');
    }
    expect(registry.parse('get_task', { key: 'DROP TABLE' }).ok).toBe(false);
    expect(registry.parse('update_task', { key: 'TASK-1', reason: 'nothing changes here' }).ok).toBe(false);
  });

  it('labels valid proposals for humans', () => {
    const r = registry.parse('update_task', {
      key: 'TASK-7',
      assignee_username: 'sarah',
      priority: 'HIGH',
      reason: 'Sarah has capacity',
    });
    expect(r).toMatchObject({ ok: true, label: 'TASK-7: assign to @sarah, priority high' });
  });
});
