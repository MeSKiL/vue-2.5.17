##transition
transition组件是定义在web平台下的。和keep-alive一样，也是抽象组件，并实现了自己的render方法。并且接收了很多的props。

其实主要也就是来到transition的render方法。render方法先找到rawChild。也就是第一个可用的子节点。
然后判断如果transition有parent，就说明transition是组件的根节点，就直接返回rawChild。
然后获取child是rawChild下的第一个真实节点，就非抽象节点。
其实这里都是对一些不符合标准的情况做处理等。然后给child赋一个key。并且赋上transition属性。
这也就render主要做的事，其实重点就是给上了transition属性。
```javascript 1.6
export default {
  name: 'transition',
  props: transitionProps,
  abstract: true,

  render (h: Function) { // 返回子节点。主要是给子节点的data上添加了transition属性
    let children: any = this.$slots.default // 获取children
    if (!children) {
      return
    }

    // filter out text nodes (possible whitespaces)
    children = children.filter((c: VNode) => c.tag || isAsyncPlaceholder(c)) // 文本节点过滤
    /* istanbul ignore if */
    if (!children.length) {
      return
    }

    // warn multiple elements
    if (process.env.NODE_ENV !== 'production' && children.length > 1) {
      warn( // transition应该只有一个子节点，如果有多个，用transition-group去实现
        '<transition> can only be used on a single element. Use ' +
        '<transition-group> for lists.',
        this.$parent
      )
    }

    const mode: string = this.mode

    // warn invalid mode
    if (process.env.NODE_ENV !== 'production' &&
      mode && mode !== 'in-out' && mode !== 'out-in'
    ) { // mode 只有in-out 和 out-in 两种
      warn(
        'invalid <transition> mode: ' + mode,
        this.$parent
      )
    }

    const rawChild: VNode = children[0]

    // if this is a component root node and the component's
    // parent container node also has transition, skip.
    if (hasParentTransition(this.$vnode)) { // 如果transition是组件的根节点，并且组件父节点也是transition，就return第一个子节点
      return rawChild
    }

    // apply transition data to child
    // use getRealChild() to ignore abstract components e.g. keep-alive
    const child: ?VNode = getRealChild(rawChild) // 获取真实的vnode，而不是抽象的，比如keep-alive就是抽象的
    /* istanbul ignore if */
    if (!child) { // 找不到就直接返回当前节点
      return rawChild
    }

    if (this._leaving) {
      return placeholder(h, rawChild)
    }

    // ensure a key that is unique to the vnode type and to this transition
    // component instance. This key will be used to remove pending leaving nodes
    // during entering.
    const id: string = `__transition-${this._uid}-` // 构造一个id
    child.key = child.key == null // 构造key
      ? child.isComment
        ? id + 'comment'
        : id + child.tag
      : isPrimitive(child.key)
        ? (String(child.key).indexOf(id) === 0 ? child.key : id + child.key)
        : child.key

    const data: Object = (child.data || (child.data = {})).transition = extractTransitionData(this) // 给子节点的data创建transition属性，是一个对象，有transition上定义的属性和事件
    const oldRawChild: VNode = this._vnode
    const oldChild: VNode = getRealChild(oldRawChild)

    // mark v-show
    // so that the transition module can hand over the control to the directive
    if (child.data.directives && child.data.directives.some(d => d.name === 'show')) {
      child.data.show = true
    }

    if (
      oldChild &&
      oldChild.data &&
      !isSameChild(child, oldChild) &&
      !isAsyncPlaceholder(oldChild) &&
      // #6687 component root is a comment node
      !(oldChild.componentInstance && oldChild.componentInstance._vnode.isComment)
    ) {
      // replace old child transition data with fresh one
      // important for dynamic transitions!
      const oldData: Object = oldChild.data.transition = extend({}, data)
      // handle transition mode
      if (mode === 'out-in') {
        // return placeholder node and queue update when leave finishes
        this._leaving = true
        mergeVNodeHook(oldData, 'afterLeave', () => {
          this._leaving = false
          this.$forceUpdate()
        })
        return placeholder(h, rawChild)
      } else if (mode === 'in-out') {
        if (isAsyncPlaceholder(child)) {
          return oldRawChild
        }
        let delayedLeave
        const performLeave = () => { delayedLeave() }
        mergeVNodeHook(data, 'afterEnter', performLeave)
        mergeVNodeHook(data, 'enterCancelled', performLeave)
        mergeVNodeHook(oldData, 'delayLeave', leave => { delayedLeave = leave })
      }
    }

    return rawChild
  }
}
```

那动画到底是在哪里走的呢？其实是在patch过程中，执行create hook的时候，来到了module的transition的enter方法。
这个方法非常长，分块看。

首先就是通过resolveTransition给data上扩展默认的类名。如果data上本来就有定义类名，就取定义的类名。并且只处理nodeType为1的节点。
然后获取data上的所有属性，并进行判断，如果transitionNode是组件的根节点，就会把transitionNode指向父占位符节点。
因为下面要判断是否mounted了，如果transition是根节点，那是否mounted就要根据父的占位符节点是否mounted来决定。

如果是首次渲染isAppear就是true。如果是首次渲染但是没有设置appear就不操作了。
之后就是取过渡类名和过渡的事件。比如如果isAppear就取appearClass，appearClass不存在就取enterClass。其实大多数情况都是取enterClass。
继续看。
然后就是指定过渡时间并看符不符合规则。
然后判断userWantsControl，如果enter的回调函数有两个参数。那就说明用户调用了done(),就说明是用户控制的。

然后定义一个callBack。稍后会用到。
然后再insert中merge了enterHook，如果定义了enterHook，就会在insert hook执行的时候执行。之后再说。
然后执行beforeEnterHook。

之后就是主要的css流程了。先给dom上加上startClass和activeClass。然后在nextFrame执行一些逻辑，异步的就放到执行的时候再说。

这样基本就执行完了，主要就是增加了两个class，然后再insert执行 enterHook，然后在nextFrame执行一些逻辑了。下面看insert的逻辑和nextFrame的逻辑。
```javascript 1.6
export function enter (vnode: VNodeWithData, toggleDisplay: ?() => void) { // 刚进enter的时候页面上是没有dom的，insert的时候才会有
  const el: any = vnode.elm

  // call leave callback now
  if (isDef(el._leaveCb)) {
    el._leaveCb.cancelled = true
    el._leaveCb()
  }

  const data = resolveTransition(vnode.data.transition) // 给data上扩展默认类名
  if (isUndef(data)) {
    return
  }

  /* istanbul ignore if */
  if (isDef(el._enterCb) || el.nodeType !== 1) { // 如果enter过程没有结束，又enter就return
    // 只处理nodeType为1的节点。
    return
  }

  const {
    css,
    type,
    enterClass,
    enterToClass,
    enterActiveClass,
    appearClass,
    appearToClass,
    appearActiveClass,
    beforeEnter,
    enter,
    afterEnter,
    enterCancelled,
    beforeAppear,
    appear,
    afterAppear,
    appearCancelled,
    duration
  } = data

  // activeInstance will always be the <transition> component managing this
  // transition. One edge case to check is when the <transition> is placed
  // as the root node of a child component. In that case we need to check
  // <transition>'s parent for appear check.
  let context = activeInstance
  let transitionNode = activeInstance.$vnode
  while (transitionNode && transitionNode.parent) { // 如果transitionNode是组件的根节点，就会把transitionNode指向父占位符节点。
    // 因为下面要判断是否mounted了，如果transition是根节点，那是否mounted就要根据父的占位符节点是否mounted来决定
    transitionNode = transitionNode.parent
    context = transitionNode.context
  }

  const isAppear = !context._isMounted || !vnode.isRootInsert // 是不是第一次渲染

  if (isAppear && !appear && appear !== '') { // 是第一次渲染，并且没有配置appear，就return
    return
  }

    ...取过渡类名和钩子函数

  const explicitEnterDuration: any = toNumber( // 指定过渡时间
    isObject(duration)
      ? duration.enter
      : duration
  )

  if (process.env.NODE_ENV !== 'production' && explicitEnterDuration != null) {
    checkDuration(explicitEnterDuration, 'enter', vnode)
  }

  const expectsCSS = css !== false && !isIE9
  const userWantsControl = getHookArgumentsLength(enterHook) // enter有两个参数，el 和done，如果有写done，就说明用户要控制enter

  const cb = el._enterCb = once(() => { // 定义enter callBack，在enter后执行，用once确保只执行一次。
    if (expectsCSS) {
      removeTransitionClass(el, toClass)
      removeTransitionClass(el, activeClass)
    } // 移除to和activeClass
    if (cb.cancelled) {
      if (expectsCSS) {
        removeTransitionClass(el, startClass)
      } // cancel就走cancel hook
      enterCancelledHook && enterCancelledHook(el)
    } else { // 否则就走afterEnterHook
      afterEnterHook && afterEnterHook(el)
    }
    el._enterCb = null
  })

  if (!vnode.data.show) { // 如果不是show，就在insert的时候执行enterHook
    // remove pending leave element on enter by injecting an insert hook
    mergeVNodeHook(vnode, 'insert', () => { // 同步的方法，在create后的insert里执行
      const parent = el.parentNode
      const pendingNode = parent && parent._pending && parent._pending[vnode.key]
      if (pendingNode &&
        pendingNode.tag === vnode.tag &&
        pendingNode.elm._leaveCb
      ) {
        pendingNode.elm._leaveCb()
      }
      enterHook && enterHook(el, cb) // 当动画完成就执行enterHook，传入cb。执行cb就相当于执行el._enterCb。不是同步执行的，在insert的时候执行。
    })
  }

  // start enter transition
  beforeEnterHook && beforeEnterHook(el) // 首先执行这个钩子函数
  if (expectsCSS) {
    addTransitionClass(el, startClass) // 添加enterClass或者appearClass
    addTransitionClass(el, activeClass) // 添加enterActiveClass或者appearClass
    nextFrame(() => { // 下次浏览器渲染回调的时候执行。异步方法
      removeTransitionClass(el, startClass) // 去掉startClass
      if (!cb.cancelled) { // 如果没有cancel就增加enterToClass
        addTransitionClass(el, toClass)
        if (!userWantsControl) { // 如果不是用户控制的情况的话，如果定义了duration，就在duration执行cb。否则就等transition结束了执行cb
          // 如果用户操作done，那就会在insert中的enterHook中手动调用cb
          if (isValidDuration(explicitEnterDuration)) {
            setTimeout(cb, explicitEnterDuration)
          } else {
            whenTransitionEnds(el, type, cb)
          }
        }
      }
    })
  }

  if (vnode.data.show) {
    toggleDisplay && toggleDisplay()
    enterHook && enterHook(el, cb)
  }

  if (!expectsCSS && !userWantsControl) {
    cb()
  }
}
```

取过渡类名和钩子函数
```javascript 1.6
  const startClass = isAppear && appearClass
    ? appearClass
    : enterClass
  const activeClass = isAppear && appearActiveClass
    ? appearActiveClass
    : enterActiveClass
  const toClass = isAppear && appearToClass
    ? appearToClass
    : enterToClass
  // 取过渡类名

  const beforeEnterHook = isAppear
    ? (beforeAppear || beforeEnter)
    : beforeEnter
  const enterHook = isAppear
    ? (typeof appear === 'function' ? appear : enter)
    : enter
  const afterEnterHook = isAppear
    ? (afterAppear || afterEnter)
    : afterEnter
  const enterCancelledHook = isAppear
    ? (appearCancelled || enterCancelled)
    : enterCancelled
  // 取钩子函数
```
insert逻辑,enter是在create里执行的，patch结束后就会执行到insert。也就会来到enterHook的逻辑。
这里就是如果定义了enterHook，就执行enterHook。如果enterHook里执行了cb，也就意味着userWantsControl是true。就会走到cb的逻辑。
```javascript 1.6
    mergeVNodeHook(vnode, 'insert', () => { // 同步的方法，在create后的insert里执行
      const parent = el.parentNode
      const pendingNode = parent && parent._pending && parent._pending[vnode.key]
      if (pendingNode &&
        pendingNode.tag === vnode.tag &&
        pendingNode.elm._leaveCb
      ) {
        pendingNode.elm._leaveCb()
      }
      enterHook && enterHook(el, cb) // 当动画完成就执行enterHook，传入cb。执行cb就相当于执行el._enterCb。不是同步执行的，在insert的时候执行。
    })
```
如果执行完了enterHook以后，会在nextFrame执行nextFrame的逻辑。这个方法主要是去掉了startClass，如果没有cancel就加上toClass。
如果用户没有调用过cb，就调用cb，在规定的duration后，或者没定义duration的话就在transition完成后调用cb。
那最后来说cb干了啥。很简单，删除了toClass和activeClass。最后走afterEnterHook。或者enterCancelledHook。

这里就会有一个现象就是，如果在enterHook里执行了done，那就会在nextFrame加上toClass这个类。并没有删除，最后的dom结构中也就会有toClass类的。

transition其实是管理class。去发现目标元素是不是应用了过渡或动画，在合适的时机增加删除css类名，以及调用钩子函数。
