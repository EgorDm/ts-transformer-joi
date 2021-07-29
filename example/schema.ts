import { joiSchema } from "../index";

interface A {
  foo: string;
  bar: boolean;
}

interface Test {
  a: number,
  b: {
    u: string;
    v?: string;
  },
  c: Pick<A, 'foo'>
}


const schema = joiSchema<Test>();
