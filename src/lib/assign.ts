// Infer the shape from the target, so updates cannot widen it with invalid fields.
export function assign<T extends object>(target: T, update: Partial<NoInfer<T>>): T {
  return Object.assign(target, update);
}
