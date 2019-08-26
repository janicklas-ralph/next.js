export function encode (obj, sep = '&', eq = '=', pfx) {
  var k

  var i

  var tmp

  var str = ''

  for (k in obj) {
    if ((tmp = obj[k]) !== void 0) {
      if (Array.isArray(tmp)) {
        for (i = 0; i < tmp.length; i++) {
          str && (str += sep)
          str += encodeURIComponent(k) + eq + encodeURIComponent(tmp[i])
        }
      } else {
        str && (str += sep)
        str += encodeURIComponent(k) + eq + encodeURIComponent(tmp)
      }
    }
  }

  return (pfx || '') + str
}

export function decode (str, sep = '&', eq = '=') {
  var tmp

  var k

  var out = {}

  var arr = str.split(sep)

  while ((tmp = arr.shift())) {
    tmp = tmp.split(eq)
    k = decodeURIComponent(tmp.shift())
    if (out[k] !== void 0) {
      out[k] = [].concat(out[k], tmp.shift())
    } else {
      out[k] = decodeURIComponent(tmp.shift())
    }
  }

  return out
}

export const parse = decode
export const stringify = encode
