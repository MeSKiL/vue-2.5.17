#vm.__patch__

在vm._update中会执行vm.__patch__将VNode节点转化为真正的dom节点。
```
Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    ...
    if (!prevVnode) {
      // initial render
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
      // 将vnode转换为真正的dom
    } else {
      // updates
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    ...
  }
```
vm.__patch__中createElm为挂载dom的实际方法，这个方法当遇到普通节点与组件时，流程是截然不同的。

###createElm
```
function createElm(
        vnode,
        insertedVnodeQueue,
        parentElm,
        refElm,
        nested,
        ownerArray,
        index
    ) {
        ...
        // 当patch遇到组件，就要把组件拆开，把里面的dom元素挂载到dom上，因为组件没法直接挂载到dom上。组件里的dom还有组件就还要拆开
        if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) { // 判断vnode是不是组件,如果是组件就创建组件
            return
        }
        const data = vnode.data
        const children = vnode.children
        const tag = vnode.tag
        if (isDef(tag)) {
            // 如果tag存在
            vnode.elm = vnode.ns // 如果有namespace就创建带有namespace的元素
                ? nodeOps.createElementNS(vnode.ns, tag)
                : nodeOps.createElement(tag, vnode)
            // 调用原生的api,创建element，elm上是真实的dom
            setScope(vnode)
        // tag 不存在就是文本节点或注释节点
        } else if (isTrue(vnode.isComment)) { // 如果是注释节点就创建注释
            vnode.elm = nodeOps.createComment(vnode.text)
            insert(parentElm, vnode.elm, refElm)
        } else { // 否则直接创建文本节点
            vnode.elm = nodeOps.createTextNode(vnode.text)
            // insert插入 三个参数 父的挂载节点节点，当前vnode节点的elm(真实dom)，参考节点
            insert(parentElm, vnode.elm, refElm)
        }
    }
```


如果遇到的是普通节点，就会先遍历他的子节点，然后子节点也会调用createElm，一直递归，直到没有子节点为止,调用dom原生的insert插入节点
createElm 调用 createChildren(有children还会调用createElm) 之后 insert节点 也就是会从下到上insert整颗dom树

###createChildren
```
function createChildren(vnode, children, insertedVnodeQueue) {
        if (Array.isArray(children)) { // 如果是数组就递归调用createElm,并把当前的vnode.elm当做父节点
            if (process.env.NODE_ENV !== 'production') {
                checkDuplicateKeys(children)
            }
            for (let i = 0; i < children.length; ++i) {
                createElm(children[i], insertedVnodeQueue, vnode.elm, null, true, children, i)
            }
        } else if (isPrimitive(vnode.text)) { // 如果就是一个普通的对象，就直接appendChild
            nodeOps.appendChild(vnode.elm, nodeOps.createTextNode(String(vnode.text)))
        }
    }
```

当vm.__patch__中createElm遇到组件的时候(可能一开始就遇见，也可能在递归createChildren的时候遇见)。
这个时候就要把组件转换成dom，然后插入正确的位置。便是调用了createComponent方法。

###createComponent
```
function createComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
        let i = vnode.data
        if (isDef(i)) { // 如果vnode的data存在
            const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
            if (isDef(i = i.hook) && isDef(i = i.init)) {
                // 如果data.hook存在，并且有hook中有init方法，就调用init方法,执行了组件上的init(createElement中createComponent merge hook时 merge的init方法)方法
                i(vnode, false /* hydrating */)
            }
            // after calling the init hook, if the vnode is a child component
            // it should've created a child instance and mounted it. the child
            // component also has set the placeholder vnode's elm.
            // in that case we can just return the element and be done.

            // 子组件patch完成后$el是有值的
            if (isDef(vnode.componentInstance)) {
                initComponent(vnode, insertedVnodeQueue)
                insert(parentElm, vnode.elm, refElm) // 子组件先插入,先子后父
                if (isTrue(isReactivated)) {
                    reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
                }
                return true
            }
        }
    }
```
将遇到的component vnode 实例化，也就是变成vm实例。实际是调用了vnode.hook.init方法

####init
```
init (vnode: VNodeWithData, hydrating: boolean): ?boolean { // 在patch的createComponent方法中执行
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
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
  },
```

init方法中通过createComponentInstanceForVnode将vnode转换为vm实例赋值给child。其实这里并不是真正的child和parent关系。
这里的parent其实是<hello-world></hello-world>这样的占位节点(组件)，child是组件真实的内容。可以理解成将hello-world组件拆开的过程。

```
<hello-world />
//把上面这个vnode，变成了下面这个vm实例（虽然vnode和vm不长这样，但是是这个意思）
<div>
	<p>123</p>
	<p>456</p>
</div>
```

然后调用child也就是新生成的vm的.$mount，也就是mountComponent，然后会走vm._update，也就再一次进入了patch。便可以将dom挂载上去。如果遇到component就继续拆开他


###简而言之一句话，patch将vnode转化为dom，遇到component就将component转化为vm，走$mount，通过_render将vm转化为vnode，然后通过_update的patch将vnode转化为dom
