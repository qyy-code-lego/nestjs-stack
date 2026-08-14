import { Transform, TransformOptions } from 'class-transformer';

function trimOne(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function Trim(options?: TransformOptions) {
  return Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.map(trimOne);
    }
    return trimOne(value);
  }, options);
}
