/**
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/paldepind/snabbdom/blob/master/LICENSE
 *
 * modified by Evan You (@yyx990803)
 *
 * Not type-checking this because this file is perf-critical and the cost
 * of making flow understand it is not worth it.
 */

import VNode, {cloneVNode} from './vnode'
import config from '../config'
import {SSR_ATTR} from 'shared/constants'
import {registerRef} from './modules/ref'
import {traverse} from '../observer/traverse'
import {activeInstance, deactivateChildComponent, updateChildComponent} from '../instance/lifecycle'
import {isTextInputType} from 'web/util/element'

import {
    warn,
    isDef,
    isUndef,
    isTrue,
    makeMap,
    isRegExp,
    isPrimitive
} from '../util/index'

export const emptyNode = new VNode('', {}, [])

const hooks = ['create', 'activate', 'update', 'remove', 'destroy']

function sameVnode(a, b) { // 满足下面的条件的话，就认为是相同的vnode
    return (
        a.key === b.key && ( // 如果key相等,key为null也相等
            (
                a.tag === b.tag &&
                a.isComment === b.isComment &&
                isDef(a.data) === isDef(b.data) &&
                sameInputType(a, b) // tag是否相等，是否同时为注释节点，是不是都有data，是不是相同的input类型
            ) || (
                isTrue(a.isAsyncPlaceholder) && // 不是异步节点
                a.asyncFactory === b.asyncFactory && // 都有异步工厂方法
                isUndef(b.asyncFactory.error)
            )
        )
    )
}

function sameInputType(a, b) {
    if (a.tag !== 'input') return true
    let i
    const typeA = isDef(i = a.data) && isDef(i = i.attrs) && i.type
    const typeB = isDef(i = b.data) && isDef(i = i.attrs) && i.type
    return typeA === typeB || isTextInputType(typeA) && isTextInputType(typeB)
}

function createKeyToOldIdx(children, beginIdx, endIdx) {
    let i, key
    const map = {}
    for (i = beginIdx; i <= endIdx; ++i) {
        key = children[i].key
        if (isDef(key)) map[key] = i
    }
    return map
}

export function createPatchFunction(backend) {
    let i, j
    const cbs = {}

    const {modules, nodeOps} = backend
    // nodeOps所有的dom操作
    // modules各种属性和各种类的钩子函数

    // const hooks = ['create', 'activate', 'update', 'remove', 'destroy']
    for (i = 0; i < hooks.length; ++i) {
        cbs[hooks[i]] = []
        for (j = 0; j < modules.length; ++j) {
            if (isDef(modules[j][hooks[i]])) { // 看modules有没有定义hook，定义了就把modules的hook push到 cbs的对应的hooks里
                cbs[hooks[i]].push(modules[j][hooks[i]])
            }
        }
    }
    // cbs['create'] = [attrs.create,class.create,dom-props.create,event.create.style.create,transition.create] invokeCreateHooks 节点创建的时候执行
    // cbs['update'] = [xxx xxx xxx xxx] 节点更新的时候执行
    // 在patch过程中，遇到相对应的钩子就会执行相关的钩子函数
    // 初始化

    function emptyNodeAt(elm) {
        return new VNode(nodeOps.tagName(elm).toLowerCase(), {}, [], undefined, elm)
    }

    function createRmCb(childElm, listeners) {
        function remove() {
            if (--remove.listeners === 0) {
                removeNode(childElm)
            }
        }

        remove.listeners = listeners
        return remove
    }

    function removeNode(el) {
        const parent = nodeOps.parentNode(el)
        // element may have already been removed due to v-html / v-text
        if (isDef(parent)) {
            nodeOps.removeChild(parent, el)
        }
    }

    function isUnknownElement(vnode, inVPre) {
        return (
            !inVPre &&
            !vnode.ns &&
            !(
                config.ignoredElements.length &&
                config.ignoredElements.some(ignore => {
                    return isRegExp(ignore)
                        ? ignore.test(vnode.tag)
                        : ignore === vnode.tag
                })
            ) &&
            config.isUnknownElement(vnode.tag)
        )
    }

    let creatingElmInVPre = 0

    function createElm(
        vnode,
        insertedVnodeQueue,
        parentElm,
        refElm,
        nested,
        ownerArray,
        index
    ) {
        if (isDef(vnode.elm) && isDef(ownerArray)) {
            // This vnode was used in a previous render!
            // now it's used as a new node, overwriting its elm would cause
            // potential patch errors down the road when it's used as an insertion
            // reference node. Instead, we clone the node on-demand before creating
            // associated DOM element for it.
            vnode = ownerArray[index] = cloneVNode(vnode)
        }

        vnode.isRootInsert = !nested // for transition enter check
        // 当patch遇到组件，就要把组件拆开，把里面的dom挂载到dom上，因为组件没法直接挂载到dom上。组件里的dom还有组件就还要拆开
        if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) { // 判断vnode是不是组件,如果是组件就创建组件
            return
        }

        const data = vnode.data
        const children = vnode.children
        const tag = vnode.tag
        if (isDef(tag)) {
            // 如果tag存在
            // 第一次 传的是div 满足
            if (process.env.NODE_ENV !== 'production') {
                if (data && data.pre) {
                    creatingElmInVPre++
                }
                if (isUnknownElement(vnode, creatingElmInVPre)) { // 没有注册组件
                    warn(
                        'Unknown custom element: <' + tag + '> - did you ' +
                        'register the component correctly? For recursive components, ' +
                        'make sure to provide the "name" option.',
                        vnode.context
                    )
                }
            }

            vnode.elm = vnode.ns // 如果有namespace就创建带有namespace的元素
                ? nodeOps.createElementNS(vnode.ns, tag)
                : nodeOps.createElement(tag, vnode)
            // 调用原生的api,创建element，elm上是真实的dom
            setScope(vnode)

            /* istanbul ignore if */
            if (__WEEX__) {
                // in Weex, the default insertion order is parent-first.
                // List items can be optimized to use children-first insertion
                // with append="tree".
                const appendAsTree = isDef(data) && isTrue(data.appendAsTree)
                if (!appendAsTree) {
                    if (isDef(data)) {
                        invokeCreateHooks(vnode, insertedVnodeQueue)
                    }
                    insert(parentElm, vnode.elm, refElm) // component的时候parentElm为空，不插入
                }
                createChildren(vnode, children, insertedVnodeQueue)
                if (appendAsTree) {
                    if (isDef(data)) {
                        invokeCreateHooks(vnode, insertedVnodeQueue)
                    }
                    insert(parentElm, vnode.elm, refElm)
                }
            } else {
                createChildren(vnode, children, insertedVnodeQueue) // 如果有子节点就创建子节点 先insert子元素，后insert父元素
                if (isDef(data)) { // 创建完子节点后调用invokeCreateHooks
                    invokeCreateHooks(vnode, insertedVnodeQueue) // 插入insert hook
                }
                insert(parentElm, vnode.elm, refElm)
            }

            if (process.env.NODE_ENV !== 'production' && data && data.pre) {
                creatingElmInVPre--
            }


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

    function createComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
        let i = vnode.data
        if (isDef(i)) { // 如果vnode的data存在
            const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
            if (isDef(i = i.hook) && isDef(i = i.init)) {
                // 如果data.hook存在，并且有hook中有init方法，就调用init方法,执行了组件上的init(createElement中createComponent merge hook时 merge的init方法)方法
                i(vnode, false /* hydrating */) // 递归的方式不断patch子组件
                // 将遇到的组件实例化
                /**
                 * <hello-world />
                 * 将上面的vnode节点转化为下面格式的的vm实例，而后继续对vm实例进行mount，走到patch，继续挂载dom，同理也是从下到上的dom挂载结构
                 * <div>
                 *     <p>123</p>
                 *     <another-component />
                 * </div>
                 *
                 * */
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

    function initComponent(vnode, insertedVnodeQueue) { // createComponent中执行
        if (isDef(vnode.data.pendingInsert)) {
            insertedVnodeQueue.push.apply(insertedVnodeQueue, vnode.data.pendingInsert)
            vnode.data.pendingInsert = null
        }
        // patch后 $el会有值，就赋值给vnode.elm
        vnode.elm = vnode.componentInstance.$el
        if (isPatchable(vnode)) { // 先子后父插入insert
            invokeCreateHooks(vnode, insertedVnodeQueue)
            setScope(vnode)
        } else {
            // empty component root.
            // skip all element-related modules except for ref (#3455)
            registerRef(vnode)
            // make sure to invoke the insert hook
            insertedVnodeQueue.push(vnode)
        }
    }

    function reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm) {
        let i
        // hack for #4339: a reactivated component with inner transition
        // does not trigger because the inner node's created hooks are not called
        // again. It's not ideal to involve module-specific logic in here but
        // there doesn't seem to be a better way to do it.
        let innerNode = vnode
        while (innerNode.componentInstance) {
            innerNode = innerNode.componentInstance._vnode
            if (isDef(i = innerNode.data) && isDef(i = i.transition)) {
                for (i = 0; i < cbs.activate.length; ++i) {
                    cbs.activate[i](emptyNode, innerNode)
                }
                insertedVnodeQueue.push(innerNode)
                break
            }
        }
        // unlike a newly created component,
        // a reactivated keep-alive component doesn't insert itself
        insert(parentElm, vnode.elm, refElm)
    }

    function insert(parent, elm, ref) {
        if (isDef(parent)) {
            if (isDef(ref)) {
                if (ref.parentNode === parent) { // 有参考节点并且参考节点的parentNode和parent相等就调用insertBefore
                    nodeOps.insertBefore(parent, elm, ref)
                }
            } else {
                nodeOps.appendChild(parent, elm) // 否则直接appendChild
            }
        }
    }

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

    function isPatchable(vnode) { // 找到可挂载的真实的节点
        while (vnode.componentInstance) { // 如果vnode有componentInstance，说明vnode是组件vnode，也就是占位符vnode，就说明他不止是渲染vnode还是占位符vnode，就无限循环，直到有真实的渲染vnode为止
            vnode = vnode.componentInstance._vnode
        }
        return isDef(vnode.tag) // 一般组件的根vnode是div,就是可挂载的节点
    }

    function invokeCreateHooks(vnode, insertedVnodeQueue) { // 调用所有模块的create方法
        for (let i = 0; i < cbs.create.length; ++i) {
            cbs.create[i](emptyNode, vnode)
        }
        i = vnode.data.hook // Reuse variable
        if (isDef(i)) {
            if (isDef(i.create)) i.create(emptyNode, vnode)
            if (isDef(i.insert)) insertedVnodeQueue.push(vnode) // 如果子组件有insert hook的时候，就插入到insertedVnodeQueue
        }
    }

    // set scope id attribute for scoped CSS.
    // this is implemented as a special case to avoid the overhead
    // of going through the normal attribute patching process.
    function setScope(vnode) {
        let i
        if (isDef(i = vnode.fnScopeId)) {
            nodeOps.setStyleScope(vnode.elm, i)
        } else {
            let ancestor = vnode
            while (ancestor) {
                if (isDef(i = ancestor.context) && isDef(i = i.$options._scopeId)) {
                    nodeOps.setStyleScope(vnode.elm, i)
                }
                ancestor = ancestor.parent
            }
        }
        // for slot content they should also get the scopeId from the host instance.
        if (isDef(i = activeInstance) &&
            i !== vnode.context &&
            i !== vnode.fnContext &&
            isDef(i = i.$options._scopeId)
        ) {
            nodeOps.setStyleScope(vnode.elm, i)
        }
    }

    function addVnodes(parentElm, refElm, vnodes, startIdx, endIdx, insertedVnodeQueue) {
        for (; startIdx <= endIdx; ++startIdx) {
            createElm(vnodes[startIdx], insertedVnodeQueue, parentElm, refElm, false, vnodes, startIdx)
        }
    }

    function invokeDestroyHook(vnode) {
        let i, j
        const data = vnode.data
        if (isDef(data)) {
            if (isDef(i = data.hook) && isDef(i = i.destroy)) i(vnode)
            for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
        }
        if (isDef(i = vnode.children)) {
            for (j = 0; j < vnode.children.length; ++j) {
                invokeDestroyHook(vnode.children[j])
            }
        }
        // destroy (vnode: MountedComponentVNode) {
        //     const { componentInstance } = vnode
        //     if (!componentInstance._isDestroyed) {
        //         if (!vnode.data.keepAlive) {
        //             componentInstance.$destroy()
        //         } else {
        //             deactivateChildComponent(componentInstance, true /* direct */)
        //         }
        //     }
        // } 子组件又调用$destroy
    }

    function removeVnodes(parentElm, vnodes, startIdx, endIdx) {
        for (; startIdx <= endIdx; ++startIdx) {
            const ch = vnodes[startIdx]
            if (isDef(ch)) {
                if (isDef(ch.tag)) {
                    removeAndInvokeRemoveHook(ch)
                    invokeDestroyHook(ch)
                } else { // Text node
                    removeNode(ch.elm)
                }
            }
        }
    }

    function removeAndInvokeRemoveHook(vnode, rm) {
        if (isDef(rm) || isDef(vnode.data)) {
            let i
            const listeners = cbs.remove.length + 1
            if (isDef(rm)) {
                // we have a recursively passed down rm callback
                // increase the listeners count
                rm.listeners += listeners
            } else {
                // directly removing
                rm = createRmCb(vnode.elm, listeners)
            }
            // recursively invoke hooks on child component root node
            if (isDef(i = vnode.componentInstance) && isDef(i = i._vnode) && isDef(i.data)) {
                removeAndInvokeRemoveHook(i, rm)
            }
            for (i = 0; i < cbs.remove.length; ++i) {
                cbs.remove[i](vnode, rm)
            }
            if (isDef(i = vnode.data.hook) && isDef(i = i.remove)) {
                i(vnode, rm)
            } else {
                rm()
            }
        } else {
            removeNode(vnode.elm)
        }
    }

    function updateChildren(parentElm, oldCh, newCh, insertedVnodeQueue, removeOnly) { // 递归遍历所有dom，做diff算法
        let oldStartIdx = 0
        let newStartIdx = 0
        let oldEndIdx = oldCh.length - 1
        let oldStartVnode = oldCh[0]
        let oldEndVnode = oldCh[oldEndIdx]
        let newEndIdx = newCh.length - 1
        let newStartVnode = newCh[0]
        let newEndVnode = newCh[newEndIdx]
        let oldKeyToIdx, idxInOld, vnodeToMove, refElm

        // removeOnly is a special flag used only by <transition-group>
        // to ensure removed elements stay in correct relative positions
        // during leaving transitions
        const canMove = !removeOnly

        if (process.env.NODE_ENV !== 'production') {
            checkDuplicateKeys(newCh)
        }

        while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
            if (isUndef(oldStartVnode)) { // 如果没有oldStartVnode，就取下一个
                oldStartVnode = oldCh[++oldStartIdx] // Vnode has been moved left
            } else if (isUndef(oldEndVnode)) { // 如果没有oldEndVnode，就取上一个
                oldEndVnode = oldCh[--oldEndIdx]
            } else if (sameVnode(oldStartVnode, newStartVnode)) { // 第一个old与第一个new判断
                patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue)
                oldStartVnode = oldCh[++oldStartIdx]
                newStartVnode = newCh[++newStartIdx]
            } else if (sameVnode(oldEndVnode, newEndVnode)) { // 最后一个old和最后一个new判断
                patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue)
                oldEndVnode = oldCh[--oldEndIdx]
                newEndVnode = newCh[--newEndIdx]
            } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right 第一个old和最后一个new判断
                patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue)
                canMove && nodeOps.insertBefore(parentElm, oldStartVnode.elm, nodeOps.nextSibling(oldEndVnode.elm))
                oldStartVnode = oldCh[++oldStartIdx]
                newEndVnode = newCh[--newEndIdx]
            } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left // 最后一个old 和第一个new判断
                patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue)
                canMove && nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)
                oldEndVnode = oldCh[--oldEndIdx]
                newStartVnode = newCh[++newStartIdx]
                // 这么多判断都是为了不同情况下，去寻求最优的解，尽量复用原先有的节点
            } else {
                if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
                idxInOld = isDef(newStartVnode.key)
                    ? oldKeyToIdx[newStartVnode.key]
                    : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx)
                if (isUndef(idxInOld)) { // New element
                    createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
                } else {
                    vnodeToMove = oldCh[idxInOld]
                    if (sameVnode(vnodeToMove, newStartVnode)) {
                        patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue)
                        oldCh[idxInOld] = undefined
                        canMove && nodeOps.insertBefore(parentElm, vnodeToMove.elm, oldStartVnode.elm)
                    } else {
                        // same key but different element. treat as new element
                        createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
                    }
                }
                newStartVnode = newCh[++newStartIdx]
            }
        }
        if (oldStartIdx > oldEndIdx) {
            refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
            addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
        } else if (newStartIdx > newEndIdx) {
            removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx)
        }
    }

    function checkDuplicateKeys(children) {
        const seenKeys = {}
        for (let i = 0; i < children.length; i++) {
            const vnode = children[i]
            const key = vnode.key
            if (isDef(key)) {
                if (seenKeys[key]) {
                    warn(
                        `Duplicate keys detected: '${key}'. This may cause an update error.`,
                        vnode.context
                    )
                } else {
                    seenKeys[key] = true
                }
            }
        }
    }

    function findIdxInOld(node, oldCh, start, end) {
        for (let i = start; i < end; i++) {
            const c = oldCh[i]
            if (isDef(c) && sameVnode(node, c)) return i
        }
    }

    function patchVnode(oldVnode, vnode, insertedVnodeQueue, removeOnly) { // 如果新旧vnode 是同样的vnode，就会执行patchVnode
        if (oldVnode === vnode) {
            return
        }

        const elm = vnode.elm = oldVnode.elm // 获取elm。

        if (isTrue(oldVnode.isAsyncPlaceholder)) {
            if (isDef(vnode.asyncFactory.resolved)) {
                hydrate(oldVnode.elm, vnode, insertedVnodeQueue)
            } else {
                vnode.isAsyncPlaceholder = true
            }
            return
        }

        // reuse element for static trees.
        // note we only do this if the vnode is cloned -
        // if the new node is not cloned it means the render functions have been
        // reset by the hot-reload-api and we need to do a proper re-render.
        if (isTrue(vnode.isStatic) &&
            isTrue(oldVnode.isStatic) &&
            vnode.key === oldVnode.key &&
            (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
        ) {
            vnode.componentInstance = oldVnode.componentInstance
            return
        }

        let i
        const data = vnode.data // 如果vnode有data，并且有hook和prepatch，就说明是组件vnode，旧执行prepatch
        if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
            // 组件更新，就需要对children更新，其实就是调用了updateChildComponent
            // 其实就是占位符节点HelloWorld更新，就需要对他真实的子节点更新
            i(oldVnode, vnode)
        }
        // 当最外层的组件开始执行 update 更新的时候，会在 nextTick 执行 flushSchedulerQueue，这个时候内部的 flushing 会设置为 true。
        // 之后执行 patch 然后执行 prepatch 更新子组件的时候，会触发子组件的重新渲染，这个时候子组件执行 queueWatcher 的时候，flushing 值为 true，那么就会同步把 queue 插入到当前执行的队列中，同步更新。

        const oldCh = oldVnode.children // 获取新旧节点的children,如果有children就是普通的vnode 如果没有就是component
        const ch = vnode.children
        if (isDef(data) && isPatchable(vnode)) { // 如果有data，并且可挂载就执行update钩子
            for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
            if (isDef(i = data.hook) && isDef(i = i.update)) i(oldVnode, vnode)
        }
        if (isUndef(vnode.text)) { // 新节点如果没有text
            if (isDef(oldCh) && isDef(ch)) { // 如果新旧vnode都有children,就会updateChildren
                if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly) // 核心diff算法
            } else if (isDef(ch)) { // 只有新的没有老的
                if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '') // 老的有text直接把text去了，然后插入新的子节点
                addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
            } else if (isDef(oldCh)) { // 只有老的没有新的,就把老的都删掉,因为新的没有子节点，也没有text，清空就行了
                removeVnodes(elm, oldCh, 0, oldCh.length - 1)
            } else if (isDef(oldVnode.text)) { // 如果老的有text，新的没text，就把老的设置为空
                nodeOps.setTextContent(elm, '')
            }
        } else if (oldVnode.text !== vnode.text) {  // 如果有text就是文本节点,并且text不相等就直接更新
            nodeOps.setTextContent(elm, vnode.text)
        }
        if (isDef(data)) { // 执行postpatch
            if (isDef(i = data.hook) && isDef(i = i.postpatch)) i(oldVnode, vnode)
        }
    }

    function invokeInsertHook(vnode, queue, initial) {
        // delay insert hooks for component root nodes, invoke them after the
        // element is really inserted
        if (isTrue(initial) && isDef(vnode.parent)) {
            vnode.parent.data.pendingInsert = queue
        } else {
            for (let i = 0; i < queue.length; ++i) {
                queue[i].data.hook.insert(queue[i])
            }
        }
    }

    let hydrationBailed = false
    // list of modules that can skip create hook during hydration because they
    // are already rendered on the client or has no need for initialization
    // Note: style is excluded because it relies on initial clone for future
    // deep updates (#7063).
    const isRenderedModule = makeMap('attrs,class,staticClass,staticStyle,key')

    // Note: this is a browser-only function so we can assume elms are DOM nodes.
    function hydrate(elm, vnode, insertedVnodeQueue, inVPre) {
        let i
        const {tag, data, children} = vnode
        inVPre = inVPre || (data && data.pre)
        vnode.elm = elm

        if (isTrue(vnode.isComment) && isDef(vnode.asyncFactory)) {
            vnode.isAsyncPlaceholder = true
            return true
        }
        // assert node match
        if (process.env.NODE_ENV !== 'production') {
            if (!assertNodeMatch(elm, vnode, inVPre)) {
                return false
            }
        }
        if (isDef(data)) {
            if (isDef(i = data.hook) && isDef(i = i.init)) i(vnode, true /* hydrating */)
            if (isDef(i = vnode.componentInstance)) {
                // child component. it should have hydrated its own tree.
                initComponent(vnode, insertedVnodeQueue)
                return true
            }
        }
        if (isDef(tag)) {
            if (isDef(children)) {
                // empty element, allow client to pick up and populate children
                if (!elm.hasChildNodes()) {
                    createChildren(vnode, children, insertedVnodeQueue)
                } else {
                    // v-html and domProps: innerHTML
                    if (isDef(i = data) && isDef(i = i.domProps) && isDef(i = i.innerHTML)) {
                        if (i !== elm.innerHTML) {
                            /* istanbul ignore if */
                            if (process.env.NODE_ENV !== 'production' &&
                                typeof console !== 'undefined' &&
                                !hydrationBailed
                            ) {
                                hydrationBailed = true
                                console.warn('Parent: ', elm)
                                console.warn('server innerHTML: ', i)
                                console.warn('client innerHTML: ', elm.innerHTML)
                            }
                            return false
                        }
                    } else {
                        // iterate and compare children lists
                        let childrenMatch = true
                        let childNode = elm.firstChild
                        for (let i = 0; i < children.length; i++) {
                            if (!childNode || !hydrate(childNode, children[i], insertedVnodeQueue, inVPre)) {
                                childrenMatch = false
                                break
                            }
                            childNode = childNode.nextSibling
                        }
                        // if childNode is not null, it means the actual childNodes list is
                        // longer than the virtual children list.
                        if (!childrenMatch || childNode) {
                            /* istanbul ignore if */
                            if (process.env.NODE_ENV !== 'production' &&
                                typeof console !== 'undefined' &&
                                !hydrationBailed
                            ) {
                                hydrationBailed = true
                                console.warn('Parent: ', elm)
                                console.warn('Mismatching childNodes vs. VNodes: ', elm.childNodes, children)
                            }
                            return false
                        }
                    }
                }
            }
            if (isDef(data)) {
                let fullInvoke = false
                for (const key in data) {
                    if (!isRenderedModule(key)) {
                        fullInvoke = true
                        invokeCreateHooks(vnode, insertedVnodeQueue)
                        break
                    }
                }
                if (!fullInvoke && data['class']) {
                    // ensure collecting deps for deep class bindings for future updates
                    traverse(data['class'])
                }
            }
        } else if (elm.data !== vnode.text) {
            elm.data = vnode.text
        }
        return true
    }

    function assertNodeMatch(node, vnode, inVPre) {
        if (isDef(vnode.tag)) {
            return vnode.tag.indexOf('vue-component') === 0 || (
                !isUnknownElement(vnode, inVPre) &&
                vnode.tag.toLowerCase() === (node.tagName && node.tagName.toLowerCase())
            )
        } else {
            return node.nodeType === (vnode.isComment ? 8 : 3)
        }
    }

    return function patch(oldVnode, vnode, hydrating, removeOnly) { // 返回一个patch函数
        // vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
        // 首次执行，oldVnode是真实的dom
        // vnode 是vm._render生成的vnode

        // 更新的时候oldVnode是prevVnode
        if (isUndef(vnode)) { // 如果vnode是空，并且有oldVnode就执行destroy hook 在$destroy的场景中
            if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
            return
        }

        let isInitialPatch = false
        const insertedVnodeQueue = [] // 里面放了存在insert hook的组件vnode

        if (isUndef(oldVnode)) { // 组件渲染时 oldVnode为空
            // empty mount (likely as component), create new root element
            isInitialPatch = true
            createElm(vnode, insertedVnodeQueue)
        } else {
            const isRealElement = isDef(oldVnode.nodeType) // oldVnode是不是真实的dom，第一次执行，且传的是div这种的话的话是true
            // 更新过程的话 isRealElement是false
            if (!isRealElement && sameVnode(oldVnode, vnode)) { // 新旧节点相同的时候，会执行patcherVnode，否则执行else
                // patch existing root node
                patchVnode(oldVnode, vnode, insertedVnodeQueue, removeOnly)
            } else { // 第一次挂载和非相同节点的更新
                // 如果更新的节点与旧节点不相同，就做三步，1.创建新节点 2.更新父的占位符节点 3.删除老节点
                if (isRealElement) {
                    // mounting to a real element
                    // check if this is server-rendered content and if we can perform
                    // a successful hydration.
                    if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
                        //服务渲染
                        oldVnode.removeAttribute(SSR_ATTR)
                        hydrating = true
                    }
                    if (isTrue(hydrating)) {
                        //服务渲染
                        if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
                            invokeInsertHook(vnode, insertedVnodeQueue, true)
                            return oldVnode
                        } else if (process.env.NODE_ENV !== 'production') {
                            warn(
                                'The client-side rendered virtual DOM tree is not matching ' +
                                'server-rendered content. This is likely caused by incorrect ' +
                                'HTML markup, for example nesting block-level elements inside ' +
                                '<p>, or missing <tbody>. Bailing hydration and performing ' +
                                'full client-side render.'
                            )
                        }
                    }
                    // either not server-rendered, or hydration failed.
                    // create an empty node and replace it
                    oldVnode = emptyNodeAt(oldVnode) // 将真实dom oldVnode转换成vnode，并且vnode.elm可以访问到真实的dom

                    // return new VNode(nodeOps.tagName(elm).toLowerCase(), {}, [], undefined, elm)
                    // 通过emptyNodeAt(oldVnode)，可以通过elm访问到真实的dom

                }

                // 现在oldVnode一定是虚拟dom了

                // replacing existing element
                const oldElm = oldVnode.elm // oldElm 就是真实的dom
                const parentElm = nodeOps.parentNode(oldElm) // dom的parentNode

                // create new node
                createElm( // 把vnode挂在到真实的dom上
                    vnode,
                    insertedVnodeQueue,
                    // extremely rare edge case: do not insert if old element is in a
                    // leaving transition. Only happens when combining transition +
                    // keep-alive + HOCs. (#4590)
                    oldElm._leaveCb ? null : parentElm,
                    nodeOps.nextSibling(oldElm) // 参考节点是下一个兄弟节点，便于插入节点insertBefore
                )

                // update parent placeholder node element, recursively
                if (isDef(vnode.parent)) { // vnode.parent是占位符节点
                    // 更新占位符节点，让占位符节点的elm指向新的vnode的elm，并执行一些hook
                    let ancestor = vnode.parent
                    const patchable = isPatchable(vnode) // 当前渲染的节点是不是可挂载的
                    while (ancestor) { // 如果占位符存在
                        for (let i = 0; i < cbs.destroy.length; ++i) {
                            cbs.destroy[i](ancestor)
                        }
                        ancestor.elm = vnode.elm // 占位符的elm指向vnode的dom
                        if (patchable) {
                            for (let i = 0; i < cbs.create.length; ++i) {
                                cbs.create[i](emptyNode, ancestor)
                            }
                            // #6513
                            // invoke insert hooks that may have been merged by create hooks.
                            // e.g. for directives that uses the "inserted" hook.
                            const insert = ancestor.data.hook.insert
                            if (insert.merged) {
                                // start at index 1 to avoid re-invoking component mounted hook
                                for (let i = 1; i < insert.fns.length; i++) {
                                    insert.fns[i]()
                                }
                            }
                        } else {
                            registerRef(ancestor)
                        }
                        ancestor = ancestor.parent // 如果组件的根节点还是占位符节点，就一直往上找,是占位符，就指elm到vnode的elm，并且调用一系列生命周期函数.更新父占位符节点
                    }
                }

                // destroy old node
                if (isDef(parentElm)) { // 如果有parentElm，就把parentElm上的旧的oldVnode删了
                    removeVnodes(parentElm, [oldVnode], 0, 0)
                } else if (isDef(oldVnode.tag)) { // 如果父dom已经被删了，直接执行删除的钩子函数就行了
                    invokeDestroyHook(oldVnode)
                }
            }
        }

        invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch) // 执行insert hook
        return vnode.elm
    }
}
