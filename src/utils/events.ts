type EventValue = unknown;
type EventMap = Record<string, EventValue>;

export interface Listener<T extends EventMap> {
  on<K extends keyof T>(eventName: K, fn: (value: T[K]) => void): void;
  off<K extends keyof T>(eventName: K, fn: (value: T[K]) => void): void;
}

export interface Emitter<T extends EventMap> extends Listener<T> {
  emit<K extends keyof T>(eventName: K, value: T[K]): void;
}

export function makeEmitter<T extends EventMap>(): Emitter<T> {
  const target = new EventTarget();
  const handlers = new WeakMap<
    (value: never) => void,
    { eventName: string; listener: EventListener }
  >();

  return {
    on(eventName, fn) {
      const listener: EventListener = (event: Event) => {
        fn((event as CustomEvent<typeof fn extends (v: infer V) => void ? V : never>).detail);
      };
      handlers.set(fn as (value: never) => void, {
        eventName: eventName as string,
        listener,
      });
      target.addEventListener(eventName as string, listener);
    },
    off(eventName, fn) {
      const entry = handlers.get(fn as (value: never) => void);
      if (entry && entry.eventName === (eventName as string)) {
        target.removeEventListener(entry.eventName, entry.listener);
        handlers.delete(fn as (value: never) => void);
      }
    },
    emit(eventName, value) {
      target.dispatchEvent(
        new CustomEvent(eventName as string, { detail: value }),
      );
    },
  };
}
