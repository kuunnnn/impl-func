const PENDING = 'PENDING';
const FULFILLED = 'FULFILLED';
const REJECTED = 'REJECTED';

// 浏览器中可以使用 asap.js 这个库
// const nextTick = setTimeout;
// const nextTick = process.nextTick;
const nextTick = setImmediate;

function getDefaultFulfilledCallback(onFulfilled) {
  return typeof onFulfilled === 'function' ? onFulfilled : value => value;
}

function getDefaultRejectedCallback(onRejected) {
  return typeof onRejected === 'function'
    ? onRejected
    : err => {
        throw err;
      };
}
function PromiseLike(exec) {
  if (!new.target) {
    throw new TypeError('Promises must be constructed via new');
  }
  if (typeof exec !== 'function') {
    throw TypeError('PromiseLike constructor argument is not a function');
  }
  const self = this;
  // 下面属性不应该暴露在外面
  this.status = PENDING;
  this.value = void 0;
  this.reason = void 0;
  this.onFulfilledCallback = [];
  this.onRejectedCallback = [];

  function resolve(result) {
    if (self.status === PENDING) {
      self.status = FULFILLED;
      self.value = result;
      self.onFulfilledCallback.forEach(e => e());
    }
  }
  function reject(reason) {
    if (self.status === PENDING) {
      self.status = REJECTED;
      self.reason = reason;
      self.onRejectedCallback.forEach(e => e());
    }
  }
  try {
    exec(resolve, reject);
  } catch (err) {
    reject(err);
  }
}
function resolvePromiseLike(p1, x, resolve, reject) {
  if (p1 === x) {
    // 2.3.1 如果promise和x引用相同的对象，promise则以拒绝TypeError为理由。
    // const p2 = new PromiseLike((resolve, reject) => resolve(2020)).then(
    //   (e) => p2
    // );
    // p2.then((e) => p2).then(
    //   function (value) {
    //     console.log("onFulfilled value: ", value);
    //   },
    //   function (reason) {
    //     console.log("onRejected reason: ", reason); // -1
    //   }
    // );
    return reject(
      new TypeError('Chaining cycle detected for promise #<Promise>')
    );
  }
  let called = false;
  // x instanceof PromiseLike
  // 如果返回的是 PromiseLike 的实例也是包含在下面判断中的
  // Promise A+ 2.3.2 如果x是一个承诺，则采用其状态[ 3.4 ]
  if (x !== null && (typeof x === 'object' || typeof x === 'function')) {
    try {
      const then = x.then;
      // 这里不是我们的 promise 所有需要注意 then 方法的 onFulfilled, onRejected 参数不能被多次调用
      if (typeof then === 'function') {
        // 如果 then 方法中的 resolve 或 reject 被反复执行,忽略掉后面的
        /*
        {
          then: function (onFulfilled, onRejected) {
            onFulfilled(Promise.resolve(10010));
            onFulfilled(Promise.resolve(10010));
            throw -1
            onRejected(Promise.resolve(10010));
          }
        }
        > 2.3.3.3.4 如果调用 then 引发异常
        > 2.3.3.3.4.1 如果resolvePromise或rejectPromise已经被调用，则忽略它。
        */
        then.call(
          x,
          y => {
            if (called) return;
            called = true;
            /*
            const obj = {
              then: function (onFulfilled, onRejected) {
                onFulfilled(obj);
                // or 
                onRejected(obj)
              }
            }
            如果 then 方法如果一直返回的是上面那种的 obj 便会在下面不断递归
            这个在 promise A+ 规范中并不是必须的实现
            */
            resolvePromiseLike(p1, y, resolve, reject);
          },
          r => {
            if (called) return;
            called = true;
            // Promise A+ 标准并没有说明这里的 r 也需要 resolve
            reject(r);
          }
        );
      } else {
        resolve(x);
      }
    } catch (error) {
      // 如果 then 方法执行过程中抛出了一个错误,在 resolve 或 reject 被调用过的情况下,忽略掉这个错误
      /*
      {
        then: function (resolve, reject) {
          resolve(Promise.resolve(10010));
          throw -1;
        }
      }
      */
      if (called) return;
      called = true;
      reject(error);
    }
  } else {
    resolve(x);
  }
}
PromiseLike.prototype.then = function then(onFulfilled, onRejected) {
  // 用了箭头函数其实可以直接用 this
  const self = this;
  onFulfilled = getDefaultFulfilledCallback(onFulfilled);
  onRejected = getDefaultRejectedCallback(onRejected);
  const promise2 = new PromiseLike((resolve, reject) => {
    if (self.status === PENDING) {
      self.onFulfilledCallback.push(() => {
        nextTick(() => {
          try {
            const x = onFulfilled(self.value);
            // 此处规范并没有要求 不过 node 14 会检测到错误 reject 时没有检查
            if (this === this.value) {
              return reject(
                new TypeError('Chaining cycle detected for promise #<Promise>')
              );
            }
            resolvePromiseLike(promise2, x, resolve, reject);
          } catch (error) {
            reject(error);
          }
        });
      });
      self.onRejectedCallback.push(() => {
        nextTick(() => {
          try {
            const x = onRejected(self.reason);
            resolvePromiseLike(promise2, x, resolve, reject);
          } catch (error) {
            reject(error);
          }
        });
      });
    }
    if (self.status === FULFILLED) {
      nextTick(() => {
        try {
          const x = onFulfilled(self.value);
          resolvePromiseLike(promise2, x, resolve, reject);
        } catch (error) {
          reject(error);
        }
      });
    }
    if (self.status === REJECTED) {
      nextTick(() => {
        try {
          const x = onRejected(self.reason);
          resolvePromiseLike(promise2, x, resolve, reject);
        } catch (error) {
          reject(error);
        }
      });
    }
  });
  return promise2;
};
PromiseLike.prototype.catch = function (onRejected) {
  return this.then(null, onRejected);
};
PromiseLike.reject = function reject(reason) {
  return new PromiseLike((_, reject) => reject(reason));
};
PromiseLike.resolve = function resolve(result) {
  return new PromiseLike((resolve, _) => resolve(result));
};
PromiseLike.all = function (promiseArray) {
  return new PromiseLike((resolve, reject) => {
    let count = promiseArray.length;
    const result = [];
    promiseArray.forEach((e, i) => {
      e.then(v => {
        result[i] = v;
        if (--count === 0) {
          resolve(result);
        }
      }, reject);
    });
  });
};
PromiseLike.race = function (promiseArray) {
  return new PromiseLike((resolve, reject) => {
    promiseArray.forEach(e => {
      e.then(resolve, reject);
    });
  });
};
PromiseLike.deferred = function () {
  const def = {};
  def.promise = new PromiseLike(function (resolve, reject) {
    def.resolve = resolve;
    def.reject = reject;
  });
  return def;
};

module.exports = PromiseLike;
