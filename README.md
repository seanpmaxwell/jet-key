# ✈️🔑 jet-key

[![npm version](https://img.shields.io/npm/v/jet-key?logo=npm&label=npm)](https://www.npmjs.com/package/jet-key)
[![npm downloads](https://img.shields.io/npm/dm/jet-key?color=orange)](https://www.npmjs.com/package/jet-key)
[![License](https://img.shields.io/npm/l/jet-key)](https://github.com/seanpmaxwell/jet-key/blob/main/LICENSE)

Generate secure random secret keys in the Crockford base32 alphabet.
By default, each key has 52 characters, no separators or timestamp, and
260 random bits from the platform's cryptographically secure random source.

Oh yeah, and this thing is fast, see [benchmarks](#-benchmarks)

<p align="center">· · ·</p>


## 🛠️ Installation / Basic usage

```sh
npm install jet-key
```

```ts
import jetKey from 'jet-key';

console.log(jetKey()); // 'YFC75GX2KY5W183FRZA4XDVZ6PYDJPQT7JMNH3N7ZXPQ8FCW3M4G'
```

`jetKey(entropy?: number): string` is the default export:

```ts
import jetKey from 'jet-key';

jetKey(128); // 26 characters, 130 random bits
jetKey(256); // 52 characters, 260 random bits
jetKey(512); // 103 characters, 515 random bits
```

<details>
<summary><strong>Entropy explained</strong></summary>
  The alphabet is `0123456789ABCDEFGHJKMNPQRSTVWXYZ`. Keys are random and
  collision-resistant; uniqueness is probabilistic, not guaranteed.
  Node.js 20.19+ and modern browsers with Web Crypto are supported.

  The optional entropy argument specifies the minimum number of random bits
  (default: 256). It must be an integer from 1 to 1,048,576; invalid values throw a
  `RangeError`. The upper limit bounds memory use to at most 209,716 characters
  per key. Each character encodes five random bits, so key length is
  `Math.ceil(entropy / 5)` and actual entropy rounds up to a multiple of five.
</details>

<p align="center">· · ·</p>


## 📟 CLI

```sh
npx jet-key               # One 52-character secret key
npx jet-key -c 10         # Ten keys, one per line
npx jet-key --count=10    # Equivalent long option
npx jet-key --entropy 256 # One 52-character key
npx jet-key -e 128 -c 10  # Ten 26-character keys
npx jet-key --help
npx jet-key --version
```

| Flag         | Alias | Description                                            |
| ------------ | ----- | -------------------------------------------------------- |
| `--entropy`  | `-e`  | Accepts the same bit count as the API and defaults to 256. |
| `--count`    | `-c`  | Must be a positive safe integer and defaults to 1.        |
| `--help`     | `-h`  | Must be used alone.                                       |
| `--version`  | `-v`  | Must be used alone.                                       |

<p align="center">· · ·</p>


## ⚡ Benchmarks

Node v24.13.0; V8 13.6.233.17-node.37; darwin/arm64; Apple M4 Pro

Median of 7 samples, at least 500 ms each, after 500 ms warmup per generator.

| Generator                          | Characters | Random bits | Median ops/sec | ns/key | Relative throughput |
| ----------------------------------- | ---------: | -----------: | -------------: | -----: | -------------------: |
| jetKey()                            |         52 |          260 |      56,269,564 |   17.8 |                 1.00x |
| Nano ID: Crockford, 52 chars        |         52 |          260 |      26,456,547 |   37.8 |                 0.47x |
| crypto.randomBytes(33): base64url   |         44 |          264 |       1,675,458 |  596.9 |                 0.03x |

<p align="center">· · ·</p>


## 🪪 License

MIT © [seanpmaxwell](LICENSE)
