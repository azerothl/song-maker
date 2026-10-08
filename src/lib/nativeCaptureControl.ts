export async function runNativeCaptureControl<T>(
  action: () => Promise<T>,
  handlers: {
    onBusyChange: (busy: boolean) => void;
    onSuccess: (value: T) => void;
    onFailure: (error: unknown) => void;
  },
): Promise<void> {
  handlers.onBusyChange(true);
  try {
    handlers.onSuccess(await action());
  } catch (error) {
    handlers.onFailure(error);
  } finally {
    handlers.onBusyChange(false);
  }
}
