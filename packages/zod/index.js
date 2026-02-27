class ZodType {
  min() { return this; }
  max() { return this; }
  nonnegative() { return this; }
  int() { return this; }
  date() { return this; }
  datetime() { return this; }
}

const createType = () => new ZodType();

const z = {
  string: createType,
  number: createType,
  object: () => createType(),
  enum: () => createType(),
  array: () => createType(),
};

module.exports = { z };
