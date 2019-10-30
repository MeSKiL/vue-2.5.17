/* @flow */

import {
    warn,
    once,
    isDef,
    isUndef,
    isTrue,
    isObject,
    hasSymbol
} from 'core/util/index'

import {createEmptyVNode} from 'core/vdom/vnode'

function ensureCtor(comp: any, base) { // 确保无论是es模块还是commonJS模块都能拿到构造器，并且如果不是构造器，是对象就转化为构造器
    if (
        comp.__esModule ||
        (hasSymbol && comp[Symbol.toStringTag] === 'Module')
    ) {
        comp = comp.default
    }
    return isObject(comp)
        ? base.extend(comp)
        : comp
}

export function createAsyncPlaceholder( // createComponent中，异步组件还没加载成功的时候返回一个注释节点
    factory: Function,
    data: ?VNodeData,
    context: Component,
    children: ?Array<VNode>,
    tag: ?string
): VNode {
    const node = createEmptyVNode()
    node.asyncFactory = factory
    node.asyncMeta = {data, context, children, tag}
    return node // 创建一个空的vnode，渲染成一个注释节点
}

export function resolveAsyncComponent( // createComponent的异步组件逻辑
    factory: Function,
    baseCtor: Class<Component>,
    context: Component
): Class<Component> | void {
//Vue.component('hello-world', function (resolve, reject) {
//   require(['./components/HelloWorld'], function (res) {
//     resolve(res)
//   })
// })
    if (isTrue(factory.error) && isDef(factory.errorComp)) { // error优先级最高
        return factory.errorComp
    }

    if (isDef(factory.resolved)) { // 第一次进来的时候没有resolved，调用resolve后，强制forceUpdate，重新执行了render，就再一次进来了，这时候是有值的，值为异步组件的构造器
        return factory.resolved // 返回异步组件的构造器
    }

    if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
        return factory.loadingComp
    }

    if (isDef(factory.contexts)) { // 如果有contexts了，就只需要push就行了
        // already pending
        factory.contexts.push(context)
    } else {
        const contexts = factory.contexts = [context] // 第一次执行将工厂函数中的contexts存起来
        let sync = true

        const forceRender = () => { // 遍历了contexts中vm实例，调用forceUpdate
            for (let i = 0, l = contexts.length; i < l; i++) {
                contexts[i].$forceUpdate()
            }
        }

        const resolve = once((res: Object | Class<Component>) => { // once保证传入的函数只执行一次,工厂函数加载成功后，会执行resolve
            // cache resolved
            factory.resolved = ensureCtor(res, baseCtor) // 拿到异步组件的构造器
            // invoke callbacks only if this is not a synchronous resolve
            // (async resolves are shimmed as synchronous during SSR)
            if (!sync) { // 开始获取异步组件的时候设置成了false,然后执行了forceRender
                forceRender()
            }
        })

        const reject = once(reason => {
            process.env.NODE_ENV !== 'production' && warn(
                `Failed to resolve async component: ${String(factory)}` +
                (reason ? `\nReason: ${reason}` : '')
            )
            if (isDef(factory.errorComp)) {
                factory.error = true
                forceRender()
            }
        })

        const res = factory(resolve, reject) // 执行webpack的require去加载,异步过程

        // const AsyncComp = () => ({ // 高级异步组件
        //     component:import('./components/HelloWorld.vue'),
        //     loading:LoadingComp,
        //     error:ErrorComp,
        //     delay:200,
        //     timeout:1000
        // });
        // Vue.component('helloWorld',AsyncComp)

        if (isObject(res)) { // promise类型的会走到这里,res是一个promise对象
            // 高级异步组件返回一个对象
            if (typeof res.then === 'function') { // 并且有then方法
                // () => Promise
                if (isUndef(factory.resolved)) { // 如果没有resolved，就执行res.then，就是等加载好了之后走resolve
                    res.then(resolve, reject)
                }
            } else if (isDef(res.component) && typeof res.component.then === 'function') {
                // 高级异步组件逻辑,如果res.component.then是函数就执行
                res.component.then(resolve, reject)

                if (isDef(res.error)) { // 绑定error
                    factory.errorComp = ensureCtor(res.error, baseCtor)
                }

                if (isDef(res.loading)) { // 绑定loading
                    factory.loadingComp = ensureCtor(res.loading, baseCtor)
                    if (res.delay === 0) { // 如果delay为0，就直接显示loading
                        factory.loading = true
                    } else {
                        setTimeout(() => { // 延时delay的时间，没设置就是200ms 判断是不是resolved和error了。如果还是没有结果，就显示loading
                            if (isUndef(factory.resolved) && isUndef(factory.error)) {
                                factory.loading = true
                                forceRender() // 这也是一个异步逻辑，不像上面设置为true，就直接渲染loading了，这里要200ms 或者delay时间后调用forceRender重新渲染,重新到这个方法。resolved虽然没有，loadingComp是有的，就返回loadingComp
                            }
                        }, res.delay || 200)
                    }
                }

                if (isDef(res.timeout)) { // 如果过了timeout就走reject然后渲染返回error,然后forceRender，渲染出error
                    setTimeout(() => {
                        if (isUndef(factory.resolved)) {
                            reject(
                                process.env.NODE_ENV !== 'production'
                                    ? `timeout (${res.timeout}ms)`
                                    : null
                            )
                        }
                    }, res.timeout)
                }
            }
        }

        sync = false
        // return in case resolved synchronously
        return factory.loading // 没有loading，没有resolved就返回unduefined
            ? factory.loadingComp
            : factory.resolved
    }
}
