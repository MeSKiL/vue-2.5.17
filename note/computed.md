##computed
computed有自己的watcher
###
```javascript 1.6
class Watcher{
    ...
    if (this.computed) { // 如果是computed属性，创建过程中不会求值 this.value为空值，并且初始化一个dep
      this.value = undefined // 不对value求值
      this.dep = new Dep() // computed也有自己的dep
    }
    ...
}

```

defineComputed
主要就是给computed的get上加了个```createComputedGetter```方法的返回值

当有人访问他的时候。会先添加渲染watcher的依赖收集。
computed的dep里也是有渲染watcher的。
```javascript 1.6
if (watcher) {
  watcher.depend() // 添加渲染watcher 的依赖收集，收集依赖后，如果触发notify，并符合一些条件就会执行渲染watcher
  return watcher.evaluate() // 返回computed的值
}
depend () { // 给computed的dep里添加依赖watcher
    if (this.dep && Dep.target) {
      this.dep.depend()
    }
}
```

当render的时候。computed被调用，就会触发getter，就会触发evaluate这个方法。这个方法就是对computed的真实求值。

```javascript 1.6
  evaluate () { // 对computed求职，如果dirty是true，就返回结果并把dirty设为false。也就是只求一次值
    if (this.dirty) { // 只有依赖的属性发生变化了，dirty才会变成true，才会重新求值，不然就直接返回this.value。也就是computed watcher监听的属性变化了，并且computed的结果也变化了 执行computed watcher的update，之后会给computed重新求值.
      // 如果依赖的属性变化但是计算的结果没有变化，是不会设置dirty为true的
      this.value = this.get()
      this.dirty = false
    }
    return this.value
  }
```
由于初始化computed watcher的时候 dirty是true，所以会返回get求得的值，并且把dirty设置为false。
这里通过get求值的时候，会依赖于一些别的响应式数据，比如data和props，那这个时候这个computed watcher就会添加到那些属性的dep离去。
如果依赖的属性变化了，那么就会触发computed watcher的update。

```javascript 1.6
      if (this.dep.subs.length === 0) { // 这里面应该有一个渲染watcher
        this.dirty = true
      } else {
        // In activated mode, we want to proactively perform the computation
        // but only notify our subscribers when the value has indeed changed.
        this.getAndInvoke(() => { // 重新对computed求值，如果值不一样，就会触发回调，就是更新渲染watcher，这里会把dirty变成true。也就说只有依赖发生变化了，才会把dirty变成true
          this.dep.notify() // 如果computed的值变了，就触发notify。render watcher就下个tick重新渲染，重新渲染了就会渲染computed的新值了
          //user watcher就nexttick执行回调，除非sync的user watcher
        })
      }
    }
```

如果没有渲染watcher在监听这个computed，反正也没人管我,把dirty设为true，以后可能要重新计算的，就直接就过了。
如果有渲染watcher在监听我。
就会走getAndInvoke 并且传入更新渲染watcher的回调函数。在getAndInvoke中。计算新的computed值，如果没变就不执行回调，反正也没变，没必要重新渲染。
变化了就会调用监听这个computed的watcher的update，重新渲染的话也是在下个tick了。就会得到新的computed的值了。也可能是user watcher
这里如果computed的依赖和computed都执行了同一个watcher的update，那通过queueWatch的优化，就只重新渲染一次了。

所以computed的依赖必须是响应式数据，否则computed watcher监听不到别人变化，自己也就不会变化了


###简而言之一句话，看懂computed的难点是，有渲染watcher或者user watcher在监听computed，computed也有watcher 在监听 自己依赖的数据。依赖的数据触发computed watcher，computed watcher判断如果值的确变了就触发监听自己的watcher
####注释新版本中，只要computed坚听的数据变化就会触发渲染更新。这样可以减少计算是否相同的过程，但是增加了页面渲染的次数。应该是权衡利弊后的结果。
