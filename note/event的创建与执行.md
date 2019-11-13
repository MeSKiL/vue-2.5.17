##event的创建与执行
事件的创建与更新是在patch中的hooks[create],和hooks[update]中。
hooks.create是在invokeCreateHooks中执行的。invokeCreateHooks是在节点创建的时候执行的。所以是先创建子的事件，后创建父的事件
hooks.update是在patchVnode的时候执行的。

event.create和event.update其实执行的都是同一个函数updateDOMListeners。

updateDOMListeners，如果新旧节点的on都不存在，直接return。然后将新旧的on都存下来，target也就是需要绑定事件的dom节点。
这里主要是执行了updateListeners方法
```javascript 1.6
function updateDOMListeners (oldVnode: VNodeWithData, vnode: VNodeWithData) {
  if (isUndef(oldVnode.data.on) && isUndef(vnode.data.on)) { // 如果都没有on属性直接就return
    return
  }
  const on = vnode.data.on || {}
  const oldOn = oldVnode.data.on || {}
  target = vnode.elm // 获取到vnode上的dom节点
  normalizeEvents(on) // 处理v-model
  updateListeners(on, oldOn, add, remove, vnode.context)
  target = undefined
}
```

updateListeners第一件事就是将def与cur指向了on[name]，old指向了oldOn[name]。
event为normalizeEvent(name)，normalizeEvent主要是将之前addHandler中处理once passive capture的符号转换为对象返回到event中。
接下来就是，如果没有新事件，就警告，如果没有老的事件，就说明是create，就在on[name]上调用createFnInvoker方法。
```javascript 1.6
export function updateListeners ( // 自定义事件也会用这个方法添加事件
  on: Object,
  oldOn: Object,
  add: Function,
  remove: Function,
  vm: Component
) {
  let name, def, cur, old, event
  for (name in on) {
    // 获取事件名
    def = cur = on[name]
    old = oldOn[name]
    event = normalizeEvent(name) // 事件对象
    /* istanbul ignore if */
    if (__WEEX__ && isPlainObject(def)) {
      cur = def.handler
      event.params = def.params
    }
    if (isUndef(cur)) { // 如果新添加的事件没有定义的话就警告
      process.env.NODE_ENV !== 'production' && warn(
        `Invalid handler for event "${event.name}": got ` + String(cur),
        vm
      )
    } else if (isUndef(old)) { // 如果old没有定义，就是create的情况
      if (isUndef(cur.fns)) {
        cur = on[name] = createFnInvoker(cur) // cur是匿名函数或者是方法名，或者是数组
      } // on[click] = invoker
      add(event.name, cur, event.once, event.capture, event.passive, event.params) // 添加dom事件
    } else if (cur !== old) {
      // 新旧的回调不一样的时候，就把old的fns指向新的就行了，因为invoker执行的时候是在invoker.fns上拿回调函数。随意改变fns的指向就行了
      old.fns = cur
      on[name] = old // 把on[name]修正为old
    }
  }
  for (name in oldOn) {
    if (isUndef(on[name])) {
      event = normalizeEvent(name)
      remove(event.name, oldOn[name], event.capture)
    }
  }
}
```
createFnInvoker其实是返回了一个函数invoker，这个函数也就是事件触发时，真正调用的函数。
调用createFnInvoker的时候，将invoker的fns指向了fns。以后执行invoker的时候就会直接去fns去执行。这个待会再说。
返回了invoker方法以后，就执行了add方法。这个方法其实就是将invoker绑定到了dom上。看看他具体干了什么
```javascript 1.6
export function createFnInvoker (fns: Function | Array<Function>): Function {
  function invoker () { // 事件最终执行的回调函数
    // 获取invoker上的的fns，循环执行
    const fns = invoker.fns
    if (Array.isArray(fns)) {
      const cloned = fns.slice()
      for (let i = 0; i < cloned.length; i++) {
        cloned[i].apply(null, arguments)
      }
    } else {
      // return handler return value for single handlers
      return fns.apply(null, arguments)
    }
  }
  invoker.fns = fns
  return invoker
}
```
add 方法，首先是invoker执行的时候成为宏任务。第二件事是如果是once的话，执行了后，就删除这个invoker。最后是在dom上绑定这个事件。
这样事件就绑定完了。
```javascript 1.6
function add (
  event: string,
  handler: Function,
  once: boolean,
  capture: boolean,
  passive: boolean
) {
  //add(event.name, cur, event.once, event.capture, event.passive, event.params)
  // cur是一个执行回调函数的函数
  handler = withMacroTask(handler) // 事件，强制走macroTask，宏任务
  if (once) handler = createOnceHandler(handler, event, capture) // 如果是once，再包装一次,执行一次后，remove掉
  target.addEventListener( // 给dom绑定事件
    event,
    handler,
    supportsPassive
      ? { capture, passive }
      : capture
  )
}
```
这里还有一个额外的点。这是正常dom节点的逻辑。如果是组件呢？组件的on是自定义事件，native on才是原生的dom事件。
那组件上的原生dom怎么执行呢？其实就是在createComponent中，listeners保存了data.on也就是自定义事件。data.on指向了data.nativeOn。
所以组件执行updateDOMListeners的时候，on同样也是原生事件。那组件的原生事件最后绑定在哪里呢？target是vnode.elm。也就是组件的真实dom节点上。
```javascript 1.6
  const listeners = data.on // 把listeners指向data.on
  data.on = data.nativeOn  // data.on指向data.nativeOn。这也就是为什么组件必须要用.native才能触发原生dom事件
```
这里事件的创建说完了，说说组件的更新，其实组件的更新很简单。组件的更新走的也是updateDOMListeners方法。那代码里哪条分支是更新的呢？

updateListeners，就是这里，新旧节点不同的时候，将旧节点的fns指向新的cur。把on[name]指向old。
因为执行invoker的时候，会去拿invoker的fns，所以这里直接改变fns的指向就行了，很简单。
那么看看触发了事件以后，执行invoker的时候干了啥呢？
```javascript 1.6
else if (cur !== old) {
  // 新旧的回调不一样的时候，就把old的fns指向新的就行了，因为invoker执行的时候是在invoker.fns上拿回调函数。随意改变fns的指向就行了
  old.fns = cur
  on[name] = old // 把on[name]修正为old
}
```

invoker获取invoker上的fns，然后依次执行回调方法。这里唯一要注意的点是，如果同一个dom上绑的事件，先执行子组件绑定的，后执行父组件.native绑定的。
因为子组件是先addEvent的。
```javascript 1.6
  function invoker () { // 事件最终执行的回调函数
    // 获取invoker上的的fns，循环执行
    const fns = invoker.fns
    if (Array.isArray(fns)) {
      const cloned = fns.slice()
      for (let i = 0; i < cloned.length; i++) {
        cloned[i].apply(null, arguments)
      }
    } else {
      // return handler return value for single handlers
      return fns.apply(null, arguments)
    }
  }
```
