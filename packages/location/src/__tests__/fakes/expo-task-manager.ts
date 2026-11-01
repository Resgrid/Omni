// expo-task-manager fake: defined executors and registered tasks (with their stored options) in memory.
type Executor = (body: { data: unknown; error: { code: string | number; message: string } | null; executionInfo: { eventId: string; taskName: string } }) => Promise<unknown>;

const tasks = new Map<string, Executor>();
const registered = new Map<string, unknown>();
const resets: (() => void)[] = [];

const fakeFn = <A extends unknown[], R>(impl: (...args: A) => R): jest.Mock<R, A> => {
  const fn = jest.fn(impl);
  resets.push(() => {
    fn.mockReset();
    fn.mockImplementation(impl);
  });
  return fn;
};

export const defineTask = fakeFn((taskName: string, executor: Executor): void => {
  tasks.set(taskName, executor);
});
export const isTaskDefined = fakeFn((taskName: string): boolean => tasks.has(taskName));
export const isTaskRegisteredAsync = fakeFn(async (taskName: string): Promise<boolean> => registered.has(taskName));
export const getTaskOptionsAsync = fakeFn(async (taskName: string): Promise<unknown> => registered.get(taskName) ?? null);

export function __registerTask(taskName: string, options: unknown): void {
  registered.set(taskName, options);
}

export function __unregisterTask(taskName: string): void {
  registered.delete(taskName);
}

export function __isRegistered(taskName: string): boolean {
  return registered.has(taskName);
}

export function __getDefinedExecutor(taskName: string): Executor | undefined {
  return tasks.get(taskName);
}

/** Runs the defined executor as the OS would. */
export async function __runTask(taskName: string, data: unknown, error: { code: string | number; message: string } | null = null): Promise<void> {
  const executor = tasks.get(taskName);
  if (!executor) throw new Error(`Task ${taskName} is not defined`);
  await executor({ data, error, executionInfo: { eventId: 'evt', taskName } });
}

export function __resetTaskManager(): void {
  tasks.clear();
  registered.clear();
  resets.forEach((reset) => reset());
}
