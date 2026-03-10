class ZodType {
  min() { return this; }
  max() { return this; }
  nonnegative() { return this; }
  int() { return this; }
  date() { return this; }
  datetime() { return this; }
  optional() { return this; }
}

const createType = () => new ZodType();

const z = {
  string: createType,
  number: createType,
  boolean: createType,
  object: () => createType(),
  enum: () => createType(),
  array: () => createType(),
  literal: () => createType(),
  discriminatedUnion: () => createType(),
};

module.exports = { z };
