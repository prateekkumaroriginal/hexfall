export function required<T>(value: T, message = 'Required value is missing'): NonNullable<T> {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

// ArrayLike covers ordinary arrays and numeric geometry/animation buffers.
export function at<T>(values: ArrayLike<T>, index: number): T {
  const value = values[index];
  if (value === undefined) throw new RangeError(`Missing element at index ${index}`);
  return value;
}
