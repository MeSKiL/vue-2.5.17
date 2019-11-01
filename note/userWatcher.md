## userWatcher
userWatcher是在initWatch里面初始化的，并且userWatcher可以是一个数组，如果是数组就遍历，然后每一项都走createWatcher。不是数组直接走createWatcher。
createWatcher的作用是让handler变成函数。因为user watcher可以是对象，但是对象中的handler方法必须是函数。
所以当碰到watch中的属性值是对象的时候，就去对象中的handler方法赋值给handler。
```
if (isPlainObject(handler)) { // handler如果是对象就去handler里的handler属性,必须是个方法
    options = handler
    handler = handler.handler
  }
```
这样就可以确保handler是函数，并且options是handler对象。
然后走vm.$watch。
所以其实vm.$watch和watch里面定义watcher是差不多的。vm.$watch里页面走createWatcher。所以基本是一样的。唯一的区别是wm.$watch其实是有返回值的。
当使用vm.$watch的时候，可以拿到返回值，返回值是一个函数，这个函数调用以后，可以删除这个watcher，就不监听了。所以在我看来。vm.$watch和watch两种写法的差异就是
vm.$watch定义的watcher是可以删掉的。
```
  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    if (isPlainObject(cb)) { // 如果cb是对象，就规范成函数
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    options.user = true // 如果是$watch创建的watcher，那就是一个user watcher
    const watcher = new Watcher(vm, expOrFn, cb, options)
    if (options.immediate) { // 如果options里配置了immediate，就触发一次callback
      cb.call(vm, watcher.value)
    }
    return function unwatchFn () { // 返回一个函数，这个函数执行的话可以销毁这个watcher
      watcher.teardown()
    }
  }
```
  
vm.$watch也很简单，除了上面说的调用createWatcher以外，就是设几个属性，一个是存下options，并且user为true，就是说明他是user watcher，后面会用到的。
而后新建了一个watcher。之后如果options里定义了immediate的话，就会立即执行handler。并且返回一个删除watcher的方法，上面也有提到。
那新建watcher干了啥呢。
```javascript 1.6
    if (options) {
      // options存在就赋值
      this.deep = !!options.deep
      this.user = !!options.user
      this.computed = !!options.computed // computed的时候computed是true
      this.sync = !!options.sync
      this.before = options.before // 保存before
    } else {
      this.deep = this.user = this.computed = this.sync = false // 否则给默认值
    }
```
很字面的意思。有就赋值。
```javascript 1.6
if (typeof expOrFn === 'function') { // 如果是函数，那实例上的getter就是这个函数,渲染watcher的updateComponent是一个函数，compute的watcher一般也是一个函数，也可能是compute(对象形式) 的get结果
      // computed watcher就是计算函数 render watcher就是updateComponent
      this.getter = expOrFn
    } else { // 否则会调用parsePath(expOrFn) user watcher的expOrFn基本是字符串
      // watch 一个字符串
      this.getter = parsePath(expOrFn) // 其实是用来访问数据的，帮数据做依赖收集，收集这个user watcher
      if (!this.getter) { // this.getter其实是parsePath返回的函数
        this.getter = function () {}
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
```
之后会走到这段逻辑。user watcher这里的expOrFn都是字符串。值就是监听的属性名。所以会走parsePath。parsePath其实就是返回一个方法，这个方法会去访问expOrFn的属性。
也就会调用属性的getter。也就把这个user watcher 添加到那个属性的dep里去了。当那个属性被set的时候，就会走user watcher的update。下面来看update。

```javascript 1.6
else if (this.sync) { // 如果user watcher里配置了sync，直接就run，不会在nextTick执行
      this.run()
    } else {
      queueWatcher(this) // watch队列, nextTick执行了flushSchedulerQueue，执行了run，也就是getAndInvoke，就又走了updateComponent。
    }
```
就看有用的部分。如果是sync的，前面的options里面有赋这个值。就直接run，不然就去queueWatcher里面排队。下个tick执行了。

执行说到底还是走了getAndInvoke。
这个方法判断了值是否改变。没改变就啥也不干。也就是你watcher的属性没变就不触发回调了。
```javascript 1.6
if (this.user) {
        try {
          cb.call(this.vm, value, oldValue) // watch:{xxx(val,oldValue)}
        } catch (e) {
          handleError(e, this.vm, `callback for watcher "${this.expression}"`)
        }
      } else {
        cb.call(this.vm, value, oldValue)
      }
```
前面说的如果是user watcher 就会给this.user赋值为true。这里就用到了。如果this.user是true，就触发回调并捕捉错误。
