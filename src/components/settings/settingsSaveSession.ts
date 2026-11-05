export interface SettingsSaveTask { id: string; dirty: boolean; save: () => Promise<void> }
/** One settings window owns this registry. Failed tasks remain dirty and retryable. */
export class SettingsSaveSession {
  private tasks = new Map<string, SettingsSaveTask>();
  update(task: SettingsSaveTask) { this.tasks.set(task.id, task); }
  remove(id: string) { this.tasks.delete(id); }
  get dirty() { return [...this.tasks.values()].some(task => task.dirty); }
  async save() {
    for (const task of [...this.tasks.values()]) {
      if (task.dirty) await task.save();
    }
  }
}
