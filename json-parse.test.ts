import parse from './json-parse';

function XFactory(str: string, data: string, result: any) {
  test(`parse ${str}`, () => {
    const jsonObj = parse(Buffer.from(`{ "data": ${data} }`) as any) as any;
    expect(jsonObj.data).toEqual(result);
  });
}

function XThrowErrorFactory(str: string, data: any) {
  test(`parse ${str}`, () => {
    function t() {
      parse(Buffer.from(data) as any);
    }

    expect(t).toThrow();
  });
}

describe('parse json number', () => {
  // 正确
  XFactory('number: 0', '0', 0);
  XFactory('number: -0', '-0', -0);
  XFactory('number: 123', '123', 123);
  XFactory('number: 负数 -213', '-213', -213);
  XFactory('number: 23.9', `23.9`, 23.9);
  XFactory('number: 科学计数法 23.9e3', `23.9e3`, 23.9e3);
  XFactory('number: 科学计数法 23.9E3', `23.9e3`, 23.9e3);
  XFactory('number: -23.9e+3', `-23.9e+3`, -23.9e3);
  XFactory('number: -23.9E+3', `-23.9e+3`, -23.9e3);

  // TODO 精度问题
  // XParseNumberFactory( "23.9e-3", `23.9e-3 ` , 23.9e-3 );

  // 错误
  XThrowErrorFactory('number error: 01', '01');
  XThrowErrorFactory('number error: 0.', `0.`);
  XThrowErrorFactory('number error: --', `--`);
  XThrowErrorFactory('number error: 1..2', `1..2`);
  XThrowErrorFactory('number error: 0.2e', `0.2e`);
  XThrowErrorFactory('number error: 0.2e+', `0.2e+`);
  XThrowErrorFactory('number error: 0.2e-', `0.2e-`);
  XThrowErrorFactory('number error: 0.2eE', `0.2eE`);
  XThrowErrorFactory('number error: 0.2ee', `0.2ee`);
});

describe('parse json array', () => {
  // 正确
  XFactory(`array:[ 1, 2, 3, 4 ]`, '[1,2,3,4]', [1, 2, 3, 4]);
  XFactory(`array:["1","2","3"]`, `[ "1", "2", "3" ]`, ['1', '2', '3']);
  XFactory(`array:[true,false,null]`, `[true,false,null]`, [true, false, null]);
  XFactory(`array:[{"a":1},[1]]`, `[{"a":1},[1]]`, [{ a: 1 }, [1]]);
});

describe('parse array json', () => {
  test('array', () => {
    const json = `[1,"2",true,false,null,{"name":3},[1]]`;
    const result = parse(Buffer.from(json) as any) as any;
    expect(result[0]).toBe(1);
    expect(result[1]).toBe('2');
    expect(result[2]).toBe(true);
    expect(result[3]).toBe(false);
    expect(result[4]).toBe(null);
    expect(result[5]).toEqual({ name: 3 });
    expect(result[6]).toEqual([1]);
  });
});

describe('parse object json', () => {
  test('object', () => {
    const json = `{"number":1,"string":"2","true":true,"false":false,"null":null, "array":[],"object":{}}`;
    const result = parse(Buffer.from(json) as any) as any;
    expect(result['number']).toBe(1);
    expect(result['string']).toBe('2');
    expect(result['true']).toBe(true);
    expect(result['false']).toBe(false);
    expect(result['null']).toBe(null);
    expect(result['object']).toEqual({});
    expect(result['array']).toEqual([]);
  });
});
