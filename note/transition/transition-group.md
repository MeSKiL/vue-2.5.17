##transition-group
transition-group也是web平台下的组件。他有transition的props，以及新增了moveClass和tag。先来说render。

render中先获取到tag，然后创建map，prevChildren是上次的children。rawChildren是这次的children。children设置为空。
然后提取transition是属性和事件。赋值给transitionData。
之后就是遍历现在的节点。如果没有key就警告，没问题就往map和children里塞。

如果原先节点有值(更新的流程)，就会记录旧节点的位置，然后如果在map里有，就说明是先后两次都要渲染的节点。就塞到kept里去。
增加节点的情况的话，kept和prevChildren是一样的。
如果不在map里就说明要删除，就塞到removed里去。
然后把kept生成vnode节点。

最后生成tag的vnode返回。
```javascript 1.6
  render (h: Function) {
    const tag: string = this.tag || this.$vnode.data.tag || 'span' // 生成一个具体节点。没有tag就去span
    const map: Object = Object.create(null)
    const prevChildren: Array<VNode> = this.prevChildren = this.children // 用prevChildren保留children
    const rawChildren: Array<VNode> = this.$slots.default || []
    const children: Array<VNode> = this.children = []
    const transitionData: Object = extractTransitionData(this) // 提取transition的属性和事件，给transitionData

    for (let i = 0; i < rawChildren.length; i++) {
      const c: VNode = rawChildren[i]
      if (c.tag) {
        if (c.key != null && String(c.key).indexOf('__vlist') !== 0) { // 遍历children，没key就警告。在renderList的过程中，会给节点赋值isVList，然后再normalize-children中，如果有isVList但是没key，就给上__vlistxxxxx的key
          // 也就是说用transition-group必须手动写key
          children.push(c) // 如果有key就节点保留
          map[c.key] = c // 并且放到map里去
          ;(c.data || (c.data = {})).transition = transitionData // 在每个元素的transition上赋值transitionData。在enter的时候resolve用的
        } else if (process.env.NODE_ENV !== 'production') {
          const opts: ?VNodeComponentOptions = c.componentOptions
          const name: string = opts ? (opts.Ctor.options.name || opts.tag || '') : c.tag
          warn(`<transition-group> children must be keyed: <${name}>`)
        }
      }
    }

    if (prevChildren) { // 保留先前节点的位置信息，把两次都会渲染的节点放入kept中。
      const kept: Array<VNode> = []
      const removed: Array<VNode> = []
      for (let i = 0; i < prevChildren.length; i++) {
        const c: VNode = prevChildren[i]
        c.data.transition = transitionData // 给原先的节点赋值transitionData
        c.data.pos = c.elm.getBoundingClientRect() // 获取dom的位置信息
        if (map[c.key]) { // 如果上次渲染的节点也在这次的map中，就保留在kept里。如果不在，就丢到removed里。
          kept.push(c)
        } else {
          removed.push(c)
        }
      }
      this.kept = h(tag, null, kept) // 把kept的数据通过createElement方法，把生成的vnode保留到kept中，children是kept
      this.removed = removed // removed的数据放到removed中。
    }

    return h(tag, null, children) // 返回createElement函数的调用。
  }
```
会在beforeMount重写update方法。初始化用不到，就不说了。

然后看更新流程。
同样会走到render，塞children和map的流程还是一样的，在prevChildren的时候就不一样了，就会有刚刚说的kept和removed了。
然后走到this._update。这个方法会先走一遍patch，在执行原本的update。因为子节点的更新算法不稳定，不能保证节点的相对位置。
先把节点的位置确定了，再去修改位置就不会有问题了。

```javascript 1.6
    this._update = (vnode, hydrating) => { // 重写了_update，作为参数传入。
      // force removing pass
      this.__patch__( // 重写了update方法，其实就是会有两次patch过程
        this._vnode,
        this.kept,
        false, // hydrating
        true // removeOnly (!important, avoids unnecessary moves)
      )
      this._vnode = this.kept
      // 子节点的更新算法是不稳定的，不能保证移除节点的相对位置
      // 会先删除需要删除的节点，然后插入或者移动节点的位置。这样就会在合理的位置了。
      // 如果6个删成4个，位置就崩了，先删成4个，再去调位置就对了
      update.call(this, vnode, hydrating)
    }
```

这之后会执行updated钩子。这就是关键过程了。
这个方法就是用来给prevChildren换位置的。
先看有没有moveClass并且class是否与动画相关。是通过创建节点，看有没有动画，删除节点实现的。
如果不满足hasMove就return。

之后是三个遍历。
第一个是因为过渡是异步的，如果第一个还没执行完，就调用下一个的话，就会把上一个的callback给执行了。
第二个是记录节点的新位置。
第三个是获取节点的就位置和新位置，并且把节点放回旧位置。这个时候获取offsetHeight，触发浏览器重绘（新版chrome好像以及不需要了）。
然后把要偏移的元素加上moveClass，然后去掉他的transform，就触发了偏移更新，然后在更新完成后删除moveClass。
```javascript 1.6
  updated () { // 更新数据的时候触发updated
    const children: Array<VNode> = this.prevChildren
    const moveClass: string = this.moveClass || ((this.name || 'v') + '-move') // 传了moveClass就用moveClass。没传就默认的
    if (!children.length || !this.hasMove(children[0].elm, moveClass)) { // 如果没有定义moveClass。或者class的属性是否与动画相关。没有moveClass或者没有都return
      return
    }
    // 如果确实与缓动相关，就执行下面的逻辑
    // we divide the work into three loops to avoid mixing DOM reads and writes
    // in each iteration - which helps prevent layout thrashing.
    children.forEach(callPendingCbs) // 过渡是异步的，如果前一个还没执行完，就调用了下一个，就把前一个的callback立即执行了
    children.forEach(recordPosition) // 记录节点的新位置
    children.forEach(applyTranslation) // 获取节点的旧位置和新位置，然后把节点返回旧的位置，设置偏移

    // force reflow to put everything in position
    // assign to this to avoid being removed in tree-shaking
    // $flow-disable-line
    this._reflow = document.body.offsetHeight // 通过获取offsetHeight使浏览器重绘。

    children.forEach((c: VNode) => {
      if (c.data.moved) {
        var el: any = c.elm
        var s: any = el.style
        addTransitionClass(el, moveClass) // 要偏移的元素，加上moveClass
        s.transform = s.WebkitTransform = s.transitionDuration = '' // 去掉transform
        el.addEventListener(transitionEndEvent, el._moveCb = function cb (e) { // 结束事件后，删除moveClass。
          if (!e || /transform$/.test(e.propertyName)) {
            el.removeEventListener(transitionEndEvent, cb)
            el._moveCb = null
            removeTransitionClass(el, moveClass)
          }
        })
      }
    })
  }
```
transition-group的实现主要是通过计算需要偏移的节点的偏移位置，并且通过moveClass去偏移。
