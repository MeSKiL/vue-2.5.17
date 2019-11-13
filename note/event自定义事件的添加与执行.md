##event自定义事件的添加与执行
event的自定义事件其实很简单。他是从createComponent中的```const listeners = data.on```开始的。
在createComponent的时候将data.on自定义事件赋值到listeners上去。
然后listeners作为new Vnode的参数传了进去。在Vue初始化的时候的时候，eventsMixin首先在原型上挂载了$on方法，和$emit方法。
这两个方法调用他们的时候再去看。啥时候调用呢？

组件在init的时候走到initEvents。如果有listeners存在，就执行updateComponentListeners。
```javascript 1.6
export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm // 设置target
  updateListeners(listeners, oldListeners || {}, add, remove, vm)
  target = undefined
}
```
也就走到了我们熟悉的updateListeners，其实和原生事件基本是一样的，唯一的区别就是，add这个方法的区别。
那么组件的自定义方法的add方法是什么呢？
```javascript 1.6
function add (event, fn, once) {
  if (once) {
    target.$once(event, fn)
  } else {
    target.$on(event, fn)
  }
}
```
这里就是说最后添加事件的时候，就是调用了target.$on或者target.$once方法。下面就可以看$on方法是什么了。

这个方法接收event，如果event是数组，就递归调用$on方法。
$on其实就是在vm._event[event]上push invoker方法。如果没有vm._event[event],就新建一个数组。

$once的区别就是调用一次以后，就把invoker给去了。
```javascript 1.6
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component { // 在初始化vue的时候会执行,给组件绑定自定义事件的时候会作为add传入
    const vm: Component = this
    if (Array.isArray(event)) { // event是数组就是遍历数组，递归调用$on
      for (let i = 0, l = event.length; i < l; i++) {
        this.$on(event[i], fn)
      }
    } else { // vm._events[事件名] 有就直接push，没有就初始化了以后再push
      // 每个自定义事件都有一个数组
      (vm._events[event] || (vm._events[event] = [])).push(fn)
      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      if (hookRE.test(event)) {
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    function on () {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    on.fn = fn
    vm.$on(event, on)
    return vm
  }
```

然后就是触发执行事件了。其实就是调用的$emit方法。
$emit就是获取了vm._events[event]，也就是应该是之前在$on上绑定的。如果没绑过，就直接return了。
绑过的话，如果是单个方法不是数组就转为数组，然后遍历数组挨个执行。
```javascript 1.6
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }
    let cbs = vm._events[event] // 获取on的时候添加的_event[event],执行回调函数
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      const args = toArray(arguments, 1)
      for (let i = 0, l = cbs.length; i < l; i++) {
        try {
          cbs[i].apply(vm, args)
        } catch (e) {
          handleError(e, vm, `event handler for "${event}"`)
        }
      }
    }
    return vm
  }
```

###其实一般看起来$on是在父组件绑的，$emit是在子组件触发的。看起来是子组件向父组件传递信息。其实通过源码看出来不是这样的。
###$on是给自己绑了自定义事件，$emit是执行了自己之前绑过的自定义事件。其实他们this的指向是一样的。只不过一个事件是在父占位符节点上定义的。一个事件是在子组件上派发的。
###但是他们的this都是指向同一个vm。
###自定义方法是在init的时候挂的。原生方法是在patch的时候挂的。
