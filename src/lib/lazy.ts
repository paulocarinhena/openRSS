/**
 * Objeto criado na primeira leitura de uma propriedade. Se a factory lançar
 * (ex.: banco ainda não configurado), nada é cacheado e a próxima leitura tenta de novo.
 * Necessário porque `next start` pré-carrega todos os módulos de rota no boot.
 */
export function lazyObject<T extends object>(factory: () => T): T {
  let instance: T | undefined;
  const resolve = () => (instance ??= factory());

  return new Proxy({} as T, {
    get: (_, prop) => {
      const target = resolve();
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    has: (_, prop) => Reflect.has(resolve(), prop),
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_, prop) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(resolve(), prop);
      return descriptor && { ...descriptor, configurable: true };
    },
  });
}
