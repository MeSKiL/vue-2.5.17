/* @flow */

import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.

const modules = platformModules.concat(baseModules)

// nodeOps所有的dom操作
// modules各种属性和各种类的钩子函数
export const patch: Function = createPatchFunction({ nodeOps, modules })
// createPatchFunction：返回 function patch(oldVnode, vnode, hydrating, removeOnly)
// 函数柯里化，vuejs是跨平台的，web和weex操作api的方法是不一样的，所以要将nodeOps和modules以参数的方式传入，可以根据平台生成不同的函数
// 通过闭包的技巧，完成了nodeOps和modules的持有

// vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
