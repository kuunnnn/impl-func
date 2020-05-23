/*
JSON文本应以Unicode编码。默认编码为 UTF-8。
   由于JSON文本的前两个字符始终为ASCII 字符[RFC0020]，
   因此可以确定八位字节流是UTF-8，UTF-16（BE或LE）还是UTF-32（BE或LE）
   通过查看前四个八位位组中的空值模式。
00 00 00 xx UTF-32BE
00 xx 00 xx UTF-16BE
xx 00 00 00 UTF-32LE
xx 00 xx 00 UTF-16LE
xx xx xx xx UTF-8
*/
// JSON包含4种基础类型（字符串，数字，布尔和null）和两种结构类型（对象和数组）
const token_begin_array = 0x5b; //  [
const token_begin_object = 0x7b; //  {
const token_end_array = 0x5d; //  ]
const token_end_object = 0x7d; //  }
const token_name_separator = 0x3a; //  :
const token_value_separator = 0x2c; //  ,

const token_string_separator = 0x22; // "
const token_string_escape = 0x5c; // \

const num_plus = 0x2b;
const num_minus = 0x2d;
const num_E = 0x45;
const num_e = 0x65;
const num_dot = 0x2e;

// 6 种结构字符前后可有任意的空白字符
// ws = *(
//    %x20 / ;    空格
//    %x09 / ; \t 水平制表符
//    %x0A / ; \n 换行符
//    %x0D   ; \r 回车符
// )
function isEmpty(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
}

type byte = number[];

// TODO: 有些粗糙 以后在改
function parseNumber(
  buf: number[],
  startIndex: number,
  isOk: (i: number) => boolean
) {
  let i = startIndex;
  let length = buf.length;
  // 整数
  let intByte: number[] = [];
  // 小数点后
  let floatByte: number[] = [];
  // e 后面的数字
  let e: number[] = [];
  // e + 还是 -
  let efrac = true;
  // 是否是负数
  let minus = false;
  let val = buf[i];

  function readNext() {
    i += 1;
    if (i === length) {
      throw new SyntaxError('0');
    }
    return buf[i];
  }

  function back() {
    function calc(nums: number[]): number {
      let r = 0;
      // 先反转然后计算
      for (let [k, v] of nums.reverse().entries()) {
        r += (v - 0x30) * 10 ** k;
      }
      return r;
    }

    if (isOk(i)) {
      let result = 0;
      if (floatByte.length > 0) {
        // 然后变成 0.形式
        result = calc(floatByte) / 10 ** floatByte.length;
      }
      result = calc(intByte) + result;
      if (e.length > 0) {
        let eNum = 10 ** calc(e);
        if (efrac) {
          result = result * eNum;
        } else {
          result = result / eNum;
        }
      }
      if (minus) {
        result = -result;
      }
      return result;
    } else {
      throw new SyntaxError('0');
    }
  }

  // 读取小数点后
  function readFloatNumber() {
    val = readNext();
    // 小数点后必须是数字
    if (val < 0x30 || val > 0x39) {
      throw 0;
    }
    // 读取小数点后的数字
    while (val >= 0x30 && val <= 0x39) {
      floatByte.push(val);
      val = readNext();
    }
    // 数字后可以是 e
    if (val === num_E || val === num_e) {
      return readE();
    }
    return back();
  }

  // 读取 e 后面
  function readE() {
    // 后面可以是 + 或者 -
    val = readNext();
    if (val === num_plus || val === num_minus) {
      efrac = val === num_plus;
      val = readNext();
      // 如果有符号 后面必须是数字 0~9
      if (val >= 0x30 && val <= 0x39) {
        while (val >= 0x30 && val <= 0x39) {
          e.push(val);
          val = readNext();
        }
      } else {
        throw new SyntaxError('2');
      }
      // 如果没有符号 就看下是否是 数字
    } else if (val >= 0x30 && val <= 0x39) {
      while (val >= 0x30 && val <= 0x39) {
        e.push(val);
        val = readNext();
      }
      // 不是符号也不是数字就不是就报错
    } else {
      throw new SyntaxError('2');
    }
    // 后面没有标准需要的东西了 判断结束
    return back();
  }

  // 判断是否是 负号
  if (val === num_minus) {
    minus = true;
    val = readNext();
  }
  // 不能以非 数字 开头
  if (val < 0x30 || val > 0x39) {
    throw new SyntaxError('0');
  }
  // 如果是 0 开头  0 后面不能是数字  但是可能是只有一个 0
  if (val === 0x30) {
    val = readNext();
    // 可以是.
    if (val === num_dot) {
      intByte.push(0);
      return readFloatNumber();
      // 也可以是 e
    } else if (val === num_E || val === num_e) {
      return readE();
    }
  } else {
    // 数字的话就读取整数部分
    while (val >= 0x30 && val <= 0x39) {
      intByte.push(val);
      val = readNext();
    }
    // 可以是 .
    if (val === num_dot) {
      return readFloatNumber();
      // 或者是 e
    } else if (val === num_E || val === num_e) {
      return readE();
    }
  }
  // 这里可能是结束也可能后面有违法字符 需判断 结束条件是否为真
  return back();
}

class Cursor {
  index = 0;
  size: number;
  buf: byte;

  constructor(buf: byte) {
    this.buf = buf;
    this.size = buf.length;
  }

  readCurrentChar(): number {
    return this.buf[this.index];
  }

  readNextChar(): number {
    return this.buf[++this.index];
  }

  seekIndex(num: number) {
    this.index = num;
  }

  readFalseByte(): boolean {
    const isFalse =
      0x66 === this.buf[this.index] &&
      0x61 === this.buf[this.index + 1] &&
      0x6c === this.buf[this.index + 2] &&
      0x73 === this.buf[this.index + 3] &&
      0x65 === this.buf[this.index + 4];
    this.seekIndex(this.index + 5);
    if (!isFalse) {
      this.throwSyntaxError('bool');
    }
    return false;
  }

  readNullByte() {
    const isNull =
      0x6e === this.buf[this.index] &&
      0x75 === this.buf[this.index + 1] &&
      0x6c === this.buf[this.index + 2] &&
      0x6c === this.buf[this.index + 3];
    this.seekIndex(this.index + 4);
    if (!isNull) {
      this.throwSyntaxError('null');
    }
    return null;
  }

  readTrueByte(): boolean {
    const isTrue =
      0x74 === this.buf[this.index] &&
      0x72 === this.buf[this.index + 1] &&
      0x75 === this.buf[this.index + 2] &&
      0x65 === this.buf[this.index + 3];
    this.seekIndex(this.index + 4);
    if (!isTrue) {
      this.throwSyntaxError('bool');
    }
    return true;
  }

  // 6种结构字符前后都可以添加无意义的空白字符。
  skipEmptyByte() {
    if (!isEmpty(this.readCurrentChar())) {
      return;
    }
    while (this.index < this.size && isEmpty(this.buf[this.index])) {
      this.index++;
    }
  }

  // 字符串用引号作为开头和结尾。
  //    除了以下一些必须被转义的字符以外所有的Unicode字符都可以直接被放在字符串中：
  //        引号（"或'），反斜杠(\)和控制字符（U+0000 到 U+001F）。
  // 任何字符都可以被转义。
  //      如果是在基本多语言平面（Basic Multilingual Plane (U+0000 到 U+FFFF)）内，则应该表示为6字符序列：
  //      反斜杠后面跟一个小写字母u，再跟4位表示字符所在位置的16进制数字。16进制数字中的字母A-F可以是大写的，也可以是小写的。
  //      例如：一个只有一个反斜杠组成的字符串可以表示为"\u005C"。
  // 另外，有一些流行的字符可以用两字符序列来转义，例如：一个只有一个反斜杠组成的字符串可以表示为"\\"。
  // 要转义不在基本多语言平面（Basic Multilingual Plane）内的字符，
  //    则使用表示为UTF-16编码代理对（encoding the UTF-16 surrogate pair）的12字符序列。
  //    例如：一个只包含G谱字符（U+1D11E）的字符串可以被表示为"\uD834\uDD1E"
  /*  string        = quotation-mark *char quotation-mark
      char          = unescaped / escape （
          0x22 /                                             ; " 引号 U+0022
          0x5C /                                             ; \ 反斜杠 U+005c
          0x2F /                                             ; / 斜杠 U+002F
          0x62 /                                             ; b 退格符 U+0062
          0x66 /                                             ; f 分页符 U+0066
          0x6E /                                             ; n 换行符 U+006E
          0x72 /                                             ; r 回车符 U+0072
          0x74 /                                             ; t 水平制表符 U+0074
          0x75 4个16进制大小写不限制                            ; uXXXX U+XXXX
      )
      escape         = %x5C                                  ; \
      quotation-mark = %x22                                  ; "
      unescaped      = %x20-21 / %x23-5B / %x5D-10FFFF
   */
  readStringByte(): string {
    if (this.readCurrentChar() !== token_string_separator) {
      this.throwSyntaxError('string');
    }
    const start_index = this.index;
    // 跳过第一个 "
    this.readNextChar();
    let prev = 0;
    let cur = 0;
    for (; this.index < this.size; this.index++) {
      prev = this.buf[this.index - 1];
      cur = this.buf[this.index];
      if (cur === token_string_separator && prev !== token_string_escape) {
        break;
      }
    }
    // 需要+1 返回第二个 "
    this.index++;
    // TODO:需要处理转义, 如 16进制 "\uD834\uDD1E" ==>  "𝄞"
    return this.buf.slice(start_index + 1, this.index - 1).toString();
  }

  // 数字包含一个以可选的减号为前缀的整数部分，其 后面可以跟有小数部分和/或指数部分。
  // 八进制或者十六进制的形式是不允许的。以0开头也是不允许的。
  // 小数部分是一个小数点后跟随一位或多位数字。
  // 指数部分以不限大小写的字母E开头，之后可跟一个加号或减号。E和可选的符号后可 跟一位或多位数字。
  // 不能被表示为数字的序列（例如，无穷大和NaN）的数字值是不允许的。
  // number        = [ minus ] int [ frac ] [ exp ]
  // decimal-point = %x2E                             ; .
  // digit1-9      = %x31-39                          ; 1-9
  // e             = %x65 / %x45                      ; e E
  // exp           = e [ minus / plus ] 1*DIGIT
  // frac          = decimal-point 1*DIGIT
  // int           = zero / ( digit1-9 *DIGIT )
  // minus         = %x2D                             ; -
  // plus          = %x2B                             ; +
  // zero          = %x30                             ; 0
  readNumberByte(): number {
    const start_index = this.index;
    return parseNumber(this.buf, start_index, i => {
      this.seekIndex(i);
      const value = this.buf[this.index];
      return (
        value === token_end_array ||
        value === token_end_object ||
        value === token_value_separator ||
        isEmpty(value)
      );
    });
  }

  // value = false / null / true / object / array / number / string
  readValueByte() {
    const char = this.readCurrentChar();
    // 数子可以是 - or 0 ~ 9 开头
    if (char === 0x2d || (char >= 0x30 && char <= 0x39)) {
      return this.readNumberByte();
    }
    switch (char) {
      case token_string_separator:
        return this.readStringByte();
      case token_begin_array:
        return this.readArrayByte();
      case token_begin_object:
        return this.readObjectByte();
      case 0x74: // true
        return this.readTrueByte();
      case 0x66: // false
        return this.readFalseByte();
      case 0x6e: // null
        return this.readNullByte();
      default:
        this.throwSyntaxError();
    }
  }

  // 对象结构表示为一对大括号包裹着0到多个名/值对（或者叫成员）。
  // 名/值对中名称是一个字符串，后面是一个冒号，用来分隔名称和值。
  // 值后面是一个逗号用来分隔值和下一个名/值对的名称。一个对象内的名称SHOULD是唯一的。
  // object = begin-object [ member *( value-separator member ) ] end-object
  // member = string name-separator value
  readObjectByte() {
    // 是否是 { 符号
    if (this.readCurrentChar() !== token_begin_object) {
      this.throwSyntaxError();
    }
    const result: { [key: string]: any } = {};
    this.readNextChar();
    // { 符号前后都可以有任意空白字符
    this.skipEmptyByte();
    // 判断是否是空的对象
    if (this.readCurrentChar() === token_end_object) {
      this.readNextChar();
      return result;
    }
    while (true) {
      // 读取 key
      const key = this.readStringByte();
      // 字符串结束是判断另一个 "
      this.skipEmptyByte();
      // 是否是 : skip 返回的直接是下一个有效字符
      if (this.readCurrentChar() !== token_name_separator) {
        this.throwSyntaxError();
      }
      // : 后面可能也会有空白
      this.skipEmptyByte();
      this.readNextChar();
      this.skipEmptyByte();
      result[key] = this.readValueByte();
      this.skipEmptyByte();
      // , 表示后面还有字段
      if (this.readCurrentChar() === token_value_separator) {
        this.readNextChar();
        this.skipEmptyByte();
        continue;
      }
      // 结束
      if (this.readCurrentChar() === token_end_object) {
        this.readNextChar();
        break;
      }
      this.throwSyntaxError();
    }
    return result;
  }

  // 数组结构表示为一对中括号包裹着0到多个值（或者叫元素）。值之间用逗号分隔。
  // array = begin-array [ value *( value-separator value ) ] end-array
  readArrayByte() {
    // 是否是 { 符号
    if (this.readCurrentChar() !== token_begin_array) {
      this.throwSyntaxError();
    }
    const result: any[] = [];
    this.readNextChar();
    // [ 符号前后都可以有任意空白字符
    this.skipEmptyByte();
    // 判断是否是空的数组
    if (this.readCurrentChar() === token_end_array) {
      this.readNextChar();
      return result;
    }
    while (true) {
      result.push(this.readValueByte());
      this.skipEmptyByte();
      // , 表示后面还有字段
      if (this.readCurrentChar() === token_value_separator) {
        this.readNextChar();
        this.skipEmptyByte();
        continue;
      }
      // 结束
      if (this.readCurrentChar() === token_end_array) {
        this.readNextChar();
        break;
      }
      this.throwSyntaxError();
    }
    return result;
  }

  parse(): any[] | { [key: string]: any } | void {
    this.skipEmptyByte();
    if (this.readCurrentChar() === token_begin_array) {
      return this.readArrayByte();
    } else if (this.readCurrentChar() === token_begin_object) {
      return this.readObjectByte();
    } else {
      this.throwSyntaxError();
    }
  }

  throwSyntaxError(char?: number | string, idx?: number) {
    char = char || this.readCurrentChar();
    idx = idx || this.index;
    throw new SyntaxError(
      `Unexpected token ${char} in JSON at position ${idx}`
    );
  }
}

function parse(buf: byte): any[] | { [key: string]: any } | void {
  return new Cursor(buf).parse();
}

export default parse;
