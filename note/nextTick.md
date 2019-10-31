##nextTick
nextTick其实就是把所有要执行的任务丢到下一个tick中的callback里（通过promise或者setTimeout等方式）。下一个tick同步执行任务。
具体怎么执行就是宏任务微任务的概念了。

JS 执行是单线程的，它是基于事件循环的。事件循环大致分为以下几个步骤：

（1）所有同步任务都在主线程上执行，形成一个执行栈（execution context stack）。

（2）主线程之外，还存在一个"任务队列"（task queue）。只要异步任务有了运行结果，就在"任务队列"之中放置一个事件。

（3）一旦"执行栈"中的所有同步任务执行完毕，系统就会读取"任务队列"，看看里面有哪些事件。那些对应的异步任务，于是结束等待状态，进入执行栈，开始执行。

（4）主线程不断重复上面的第三步。

主线程的执行过程就是一个 tick，而所有的异步结果都是通过 “任务队列” 来调度。 消息队列中存放的是一个个的任务（task）。 规范中规定 task 分为两大类，分别是 macro task 和 micro task，并且每个 macro task 结束后，都要清空所有的 micro task。

关于 macro task 和 micro task 的概念，这里不会细讲，简单通过一段代码演示他们的执行顺序：

在浏览器环境中，常见的 macro task 有 setTimeout、MessageChannel、postMessage、setImmediate；常见的 micro task 有 MutationObsever 和 Promise.then。

主线程执行同步任务执行完了以后，看看自己身上有没有微任务，有就执行微任务其实就是宏任务走完，看看有没有微任务，有就执行微任务，没有就走下一个宏任务。


```
console.log('同步任务1',1);
setTimeout(() => {
    console.log('宏任务来了',7);
    let a = new Promise((resolve) => {
        console.log('定义微任务，同步任务',8)
        resolve()
    });
    a.then(()=>{
        console.log('倒数第二个宏任务里的微任务',9)
    })
});

let a = new Promise((resolve) => {
    console.log('定义微任务，同步任务',2)
    resolve()
});

a.then(()=>{
    console.log('微任务来了,宏任务排队',4)
    let b = new Promise((resolve) => {
        console.log('微任务里面执行的同步任务',5)
        resolve()
    });
    b.then(()=>{
        console.log('微任务里面的微任务来了，宏任务继续排队',6)
    })
    setTimeout(()=>{
        console.log('最后执行的宏任务',10)
    })
});
console.log('同步任务2，无敌',3)
```

说白了一句话。把所有调用的nextTick的callback丢到下一个tick里去，下一个tick就会按宏任务微任务顺序执行这些任务
