##keep-alive
示例代码
```javascript 1.6
let A = {
  template: '<div class="a">' +
    '<p>A Comp</p>' +
    '</div>',
  name: 'A',
  mounted () {
    console.log('Comp A mounted')
  },
  activated () {
    console.log('Comp A activated')
  },
  deactivated () {
    console.log('Comp A deactivated')
  }
}

let B = {
  template: '<div class="b">' +
    '<p>B Comp</p>' +
    '</div>',
  name: 'B',
  mounted () {
    console.log('Comp B mounted')
  },
  activated () {
    console.log('Comp B activated')
  },
  deactivated () {
    console.log('Comp B deactivated')
  }
}

new Vue({
  el: '#app',
  template: '<div>' +
    '<keep-alive>' +
    '<component :is="currentComp">' +
    '</component>' +
    '</keep-alive>' +
    '<button @click="change">switch</button>' +
    '</div>',
  data: {
    currentComp: 'A'
  },
  methods: {
    change () {
      this.currentComp = this.currentComp === 'A' ? 'B' : 'A'
    }
  },
  components: {
    A,
    B
  }
})
```

在keep-alive组件的init阶段执行created钩子函数创建了cache和keys两个变量。
然后在$mount的render阶段，会执行keep-alive组件的内置render方法。
render方法首先会获取默认插槽中的内容。然后获取第一个子组件。然后判断第一个子组件是不是在include，或者被exclude排除在外。
如果符合以上的条件就直接return。不给该节点做缓存。
对于需要缓存的节点会先根据节点的key，如果没有key就按规范生成一个key，然后去cache里找。
找到了直接把当前节点的实例指向缓存中的节点，并且把该缓存放到数组最后，变为最新的缓存。
如果没找到，就将其增加到缓存中，如果缓存超过最大限制了，就把数组第一项删了。(LRU)。
然后返回当前节点。其实也就是keep-alive的第一个子节点。render完了以后就是走update了。update的时候就是patch的时候。
那么patch的vnode其实就不是keep-alive的节点了，因为keep-alive render后返回的是第一个子组件。
```javascript 1.6
export default { // 在initGlobalApi的时候，初始化到了全局
  name: 'keep-alive',
  abstract: true,

  // 走到keep-alive就会init。走keep-alive的$mount，也就走到keep-alive的render。然后获取第一个子组件，设置他的keepAlive为true，然后返回子组件。走到update，也就是patch。这时候isReactivated就是true。所以是不会patch keepAlive的
  // keep-alive更新的时候会走到patchVnode，然后走keep-alive的prepatch，然后因为有children，就更新slot后，强制更新。强制更新可能会命中缓存，就取缓存的。然后再一次走到patch，然后走到createComponent

  props: {
    include: patternTypes,
    exclude: patternTypes,
    max: [String, Number]
  },

  created () {
    this.cache = Object.create(null) // 缓存keep-alive的vnode
    this.keys = []
  },

  destroyed () {
    for (const key in this.cache) { // 销毁缓存中所有节点
      pruneCacheEntry(this.cache, key, this.keys)
    }
  },

  mounted () {
    this.$watch('include', val => { // watch到include变化时，执行回调函数。
      pruneCache(this, name => matches(val, name))
    })
    this.$watch('exclude', val => {
      pruneCache(this, name => !matches(val, name))
    })
  },

  render () {
    // render的时候，会拿到第一个组件节点，然后符合要求就放入缓存中，然后设置组件的keepAlive为true
    const slot = this.$slots.default // 获取默认插槽的内容
    const vnode: VNode = getFirstComponentChild(slot) // 获取第一个组件节点,keep-alive缓存组件节点
    const componentOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions
    if (componentOptions) {
      // check pattern
      const name: ?string = getComponentName(componentOptions) // 获取组件名称
      const { include, exclude } = this
      if (
        // not included
        (include && (!name || !matches(include, name))) ||
        // excluded
        (exclude && name && matches(exclude, name))
      ) { // 如果include存在，但是组件不在里面，或者exclude存在，并且组件在里面，都return。不缓存了。
        return vnode
      }

      // 下面的vnode都是第一个子组件节点

      const { cache, keys } = this
      const key: ?string = vnode.key == null // 如果有key，就用key，没有就用cid拼接tag。也就是用来缓存的key。
        // same constructor may get registered as different local components
        // so cid alone is not enough (#3269)
        ? componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '')
        : vnode.key
      if (cache[key]) { // 如果命中了缓存，直接把vnode的instance指向缓存的instance
        vnode.componentInstance = cache[key].componentInstance
        // make current key freshest
        remove(keys, key)
        keys.push(key) // 把key去除，然后添加到最后一个
      } else {
        cache[key] = vnode // 没有命中就增加缓存，然后把key push到keys中
        keys.push(key)
        // prune oldest entry
        if (this.max && keys.length > parseInt(this.max)) {
          // 如果设置了max，就把最后一个 vnode从缓存中移除。也就是近期最不常用的就移除缓存。LRU
          pruneCacheEntry(cache, keys[0], keys, this._vnode)
        }
      }

      vnode.data.keepAlive = true
    }
    return vnode || (slot && slot[0])
  }
}
```
然后就到了第一个子组件，也就是例子中的component-A，进行patch。也就是会走到createComponent中。然后走组件的init。

由于没有命中内存vnode.componentInstance为undefined，这时候就会走到$mount。就是普通的组件挂载了。
直到patch的组件的最后(keepAlive的patch的最后,也就是keepAlive的init执行完了后，子组件挂载好了，子组件没有parentElm，所以没挂载上)，
initComponent和insert。最后到div的invokeInsertHook，也就是执行子组件的insert hook，也就是keep-alive和component-A的insert。
在component-A的insert的时候，执行他的mounted和activated。由于满足vnode.parent，所以没在component-A的invokeInsertHook的时候执行insert。
```javascript 1.6
  init (vnode: VNodeWithData, hydrating: boolean): ?boolean { // 在patch的createComponent方法中执行
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) { // keepAlive的话就走prepatch，就不会重新创建了。
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
      ) // 返回子组件的vue实例
      child.$mount(hydrating ? vnode.elm : undefined, hydrating) // 走了mountComponent方法 el为空,然后执行render，并设置子组件了updateComponent的watch
    }
  }
```
这时候是第一次走，就先执行mounted是生命周期方法。然后由于是keepAlive节点，走activateChildComponent方法。
这个方法也就是遍历keepAlive的子组件，递归activateChildComponent。如果子组件也是keepAlive的组件，也会执行activated hook。
并且设置一个值，让这个hook只执行一次，不会因为子组件下次更新就再执行一次。这个方法说白了就是执行activated生命周期。
```javascript 1.6
  insert (vnode: MountedComponentVNode) { // patch中的createElm时插入insertedVnodeQueue，调用patch的invokeInsertHook时执行 。component组件会在initComponent中插入insertedVnodeQueue
    // 子组件的insert先执行
    const { context, componentInstance } = vnode
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true // 设置_isMounted为true
      callHook(componentInstance, 'mounted')
    }
    if (vnode.data.keepAlive) {
      // 组件的首次渲染你直接执行生命周期。如果的更新，就在flushSchedulerQueue中执行
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance) // 如果是keepAlive，并且已经挂载了，就会走queueActivatedComponent
      } else {
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
```

然后我们切换了组件，切到了component-B，触发了页面的重新渲染，就走到了div的children的patchVnode。
这时候会执行vue-component-2-keep-alive组件的prePatch。
然后会执行updateChildComponent方法，keepAlive的hasChildren为true，就会重写resolveSlots，然后强制更新。就会在nextTick里重新渲染。
nextTick的时候就会重新render，keepAlive render出来就是component-B了，由于首次渲染，所以和component-A的流程基本是一样的。
在patch的时候，来到了createComponent中，调用了组件的init。
patch的最后就会执行组件A的destroy，也就是deactivateChildComponent方法，触发了deactivated生命周期。和activated类似，就不说了。
然后执行component-B的insert。也就是mount生命周期，但是activated放在了nextTick执行


直到再一次切换组件，换回component-A，触发了页面的重新渲染，就走到了div的children的patchVnode。
这时候会执行vue-component-2-keep-alive组件的prePatch。然后会执行updateChildComponent方法。
keepAlive的hasChildren为true，就会重写resolveSlots，然后强制更新。就会在nextTick里重新渲染。
同样的在nextTick会走到重新render，render的时候命中了，给vnode赋值componentInstance。
然后走到component-A的patch。
来到了createComponent中，调用了组件的init。但是这次走到init的时候就发生了变化，因为它满足了if的条件，componentInstance是有值的。
他就会执行component-A的prepatch方法。component-A不满足hasChildren就不会走forceUpdate。所以就不会走到$mount了。
然后就来到createComponent的后续，initComponent和insert。initComponent其实就是设置vnode的elm。
keep-alive的子组件没有parentElm，就不挂载。keep-alive的elm也是子组件的elm。然后挂载上去。之后执行deactivated，也就是nextTick执行component-B的deactivated生命周期。
然后nextTick执行component-A的activated生命周期。

##简单总结
keep-alive的流程很复杂，其实是复杂在组件的创建挂载，keep-alive本身的实现其实很简单。
在render的时候会执行keep-alive的render，如果没有第一个子组件不符合缓存规则，返回第一个子组件，并当成普通节点去处理。
如果符合规则但是没有命中cache，就添加到cache中，然后返回第一个子组件，并当成普通的节点去处理。
那也就是对第一个子组件进行patch，patch的过程中就会走到子组件的createComponent，然后init。就正常的挂载，走child.$mount。
生命周期会在div的patch的invokeInsertHook中执行,mounted和activated。

对于第一次更新也是同理，走到了外层div的patchVnode，然后走到keep-alive组件的prepatch。由于有slot，会强制更新slot并重新渲染。
nextTick中重新渲染keep-alive，也就是重新走render。这时候没有命中cache，那就是同样的在cache中push一个组件，然后返回第一个子组件。
子组件patch的时候会走到createComponent，然后init，也是正常挂载，走child.$mount。
生命周期的执行并不一样，在component-b的patch中，先把旧节点删了，并且执行deactivated。
在component-B的patch的invokeInsertHook中执行，mounted和activated，但是这时候activated是在nextTick里走的。

再一次更新就不一样了，走到了外层的patchVnode，然后走到keep-alive组件的prepatch。由于有slot，会强制更新slot并重新渲染。
nextTick中重新渲染keep-alive，也就是重新走render。这时候命中cache，也就是会给vnode赋值componentInstance。然后返回。
子组件patch的时候会走到createComponent，然后init，这时候就不正常挂载了。满足了条件，走子组件的prepatch。而不是挂载了。
然后同样的在component-A的patch中，先把旧节点删了，并且执行deactivated。
在component-A的patch的invokeInsertHook中执行，mounted和activated，但是这时候activated是在nextTick里走的。

##超简单总结
命中cache就用cache，然后排序。没命中就往cache里加。
