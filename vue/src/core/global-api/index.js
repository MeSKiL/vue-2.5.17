/* @flow */

import config from '../config'
import {initUse} from './use'
import {initMixin} from './mixin'
import {initExtend} from './extend'
import {initAssetRegisters} from './assets'
import {set, del} from '../observer/index'
import {ASSET_TYPES} from 'shared/constants'
import builtInComponents from '../components/index'

import {
    warn,
    extend,
    nextTick,
    mergeOptions,
    defineReactive
} from '../util/index'

export function initGlobalAPI(Vue: GlobalAPI) { // 给vue增加了各种api
    // config
    const configDef = {}
    configDef.get = () => config // configDef = config
    if (process.env.NODE_ENV !== 'production') {
        configDef.set = () => {
            warn(
                'Do not replace the Vue.config object, set individual fields instead.'
            )
        }
    }
    Object.defineProperty(Vue, 'config', configDef) //vue.config = configDef

    // exposed util methods.
    // NOTE: these are not considered part of the public API - avoid relying on
    // them unless you are aware of the risk.
    Vue.util = { // 不稳定不建议使用
        warn,
        extend,
        mergeOptions,
        defineReactive
    }

    Vue.set = set
    Vue.delete = del
    Vue.nextTick = nextTick

    Vue.options = Object.create(null)
    ASSET_TYPES.forEach(type => {
        // 'component',
        // 'directive',
        // 'filter'
        Vue.options[type + 's'] = Object.create(null)
    }) // 挂载到Vue.options下
    // 初始化了Vue.options.directives

    // this is used to identify the "base" constructor to extend all plain-object
    // components with in Weex's multi-instance scenarios.
    Vue.options._base = Vue // base指向Vue

    extend(Vue.options.components, builtInComponents) // 将keep-alive扩展到components下

    initUse(Vue) // 定义Vue.init
    initMixin(Vue) // Vue.mixin
    initExtend(Vue) // Vue.extend

    initAssetRegisters(Vue)
    // Vue.component
    // Vue.directive
    // Vue.filter
}
