# ts-transformer-joi
A TypeScript custom transformer generating Joi schemas from interface info

[![NPM version][npm-image]][npm-url]
[![Downloads](https://img.shields.io/npm/dm/ts-transformer-joi.svg)](https://www.npmjs.com/package/ts-transformer-joi)


# Requirement
TypeScript >= 2.4.1

# How to use this package
This package exports function `joiSchema` which is responsible for generating a 
valid Joi schema given an interface.

## How to use `joiSchema`
```ts
import { joiSchema } from "ts-transformer-joi";
import * as Joi from 'joi';

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

console.log(Joi.object(schema).describe())
```

## How to use the custom transformer
Unfortunately, TypeScript itself does not currently provide any easy way to use custom transformers (See https://github.com/Microsoft/TypeScript/issues/14419).
The followings are the example usage of the custom transformer

### webpack (with ts-loader or awesome-typescript-loader)

```js
// webpack.config.js
const joiTransformer = require('ts-transformer-joi/lib/transformer').default;

module.exports = {
  // ...
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader', // or 'awesome-typescript-loader'
        options: {
          // make sure not to set `transpileOnly: true` here, otherwise it will not work
          getCustomTransformers: program => ({
              before: [
                  joiTransformer(program)
              ]
          })
        }
      }
    ]
  }
};

```

### Rollup (with rollup-plugin-typescript2)

See [examples/rollup](examples/rollup) for detail.

```js
// rollup.config.js
import resolve from 'rollup-plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';
import joiTransformer from 'ts-transformer-joi/lib/transformer';

export default {
  // ...
  plugins: [
    resolve(),
    typescript({ transformers: [service => ({
      before: [ joiTransformer(service.getProgram()) ],
      after: []
    })] })
  ]
};
```

### ttypescript

See [examples/ttypescript](examples/ttypescript) for detail.
See [ttypescript's README](https://github.com/cevek/ttypescript/blob/master/README.md) for how to use this with module bundlers such as webpack or Rollup.

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    // ...
    "plugins": [
      { "transform": "ts-transformer-joi/lib/transformer" }
    ]
  },
  // ...
}
```

### ts-jest

See [examples/ts-jest](examples/ts-jest) for details.
In order to use this transformer with ts-jest, you need to add a wrapper around it like this:

```javascript
// ts-jest-joi-transformer.js
const joiTransformer = require('ts-transformer-joi/lib/transformer').default;
const name = 'my-joi-transformer';
const version = 1;
const factory = (cs) => (ctx) => joiTransformer(cs.tsCompiler.program)(ctx);
module.exports = { name, version, factory };
```

And add it in `jest.config.js` like this:

```javascript
  globals: {
    'ts-jest': {
      // relative path to the ts-jest-joi-transformer.js file
      astTransformers: { before: ['src/react/ts-jest-joi-transformer.js'] }
    }
  }
```

Note: ts-jest 26.4.2 does not work with this transformer (fixed in ts-jest 26.4.3). Also, for versions smaller than 26.2, you need to provide the transformer in an array instead, like this: `astTransformers: { before: ['src/react/ts-jest-keys-transformer.js'] }`

### TypeScript API

See [test](test) for detail.
You can try it with `$ npm test`.

```js
const ts = require('typescript');
const keysTransformer = require('ts-transformer-joi/lib/transformer').default;

const program = ts.createProgram([/* your files to compile */], {
  strict: true,
  noEmitOnError: true,
  target: ts.ScriptTarget.ES5
});
```

# Acknowledgements
* [ts-transformer-keys](https://github.com/kimamula/ts-transformer-keys) For main transformer usage
* [ts-transformer-interface](https://github.com/robturtle/ts-transformer-interface) For interface info extraction
