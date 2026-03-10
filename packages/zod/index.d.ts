export interface ZodTypeAny {
  min(value: number): this;
  max(value: number): this;
  nonnegative(): this;
  int(): this;
  date(): this;
  datetime(): this;
  optional(): this;
}

export declare const z: {
  string(): ZodTypeAny;
  number(): ZodTypeAny;
  boolean(): ZodTypeAny;
  object(shape: Record<string, ZodTypeAny>): ZodTypeAny;
  enum(values: string[]): ZodTypeAny;
  array(item: ZodTypeAny): ZodTypeAny;
  literal(value: string): ZodTypeAny;
  discriminatedUnion(key: string, options: ZodTypeAny[]): ZodTypeAny;
};

export declare namespace z {
  type infer<T extends ZodTypeAny> = unknown;
}
